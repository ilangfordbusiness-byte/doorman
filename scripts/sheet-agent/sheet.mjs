#!/usr/bin/env node
// CLI for the task-sheet bridge (scripts/sheet-agent/Code.gs).
// Used by the hourly Claude routine; also handy by hand.
//
//   node scripts/sheet-agent/sheet.mjs list [--pending]        tasks as JSON
//   node scripts/sheet-agent/sheet.mjs claim  --tab T --row N --task "..."
//   node scripts/sheet-agent/sheet.mjs update --tab T --row N --task "..." \
//        [--status S] [--pr URL] [--notes "..."] [--done true|false]
//   node scripts/sheet-agent/sheet.mjs reconcile                sync PR states back
//
// Env: SHEET_AGENT_URL (Apps Script /exec URL), SHEET_AGENT_SECRET.
// `reconcile` also needs the GitHub CLI (`gh`) authenticated for the repo.

import { execFileSync } from 'node:child_process';

const URL_ = process.env.SHEET_AGENT_URL;
const SECRET = process.env.SHEET_AGENT_SECRET;
const STALE_CLAIM_MS = 3 * 60 * 60 * 1000; // an "In progress" row with no PR older than this is released

function die(msg) {
  console.error(`sheet: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) die(`unexpected argument ${a}`);
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i++; }
  }
  return { cmd, flags };
}

const ATTEMPTS = 4;              // Apps Script cold starts answer the first POST with a 404/5xx HTML page
const REQUEST_TIMEOUT_MS = 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lostReplies = 0; // attempts whose write may have landed although the reply was unusable

async function call(body) {
  if (!URL_ || !SECRET) die('SHEET_AGENT_URL and SHEET_AGENT_SECRET must be set');
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let res, text;
    try {
      // Apps Script answers POSTs with a 302 to googleusercontent; fetch follows it.
      res = await fetch(URL_, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret: SECRET, ...body }),
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      text = await res.text();
    } catch (err) {
      lastErr = `network error: ${err.name === 'TimeoutError' ? `no reply within ${REQUEST_TIMEOUT_MS / 1000}s` : err.message}`;
      await backoff(attempt, lastErr);
      continue;
    }
    let json;
    try { json = JSON.parse(text); } catch {
      lastErr = `non-JSON reply (${res.status}): ${text.slice(0, 300)}`;
      // 4xx other than 404/429 is a real answer (bad URL, auth); do not hammer it.
      const transient = res.status === 404 || res.status === 429 || res.status >= 500;
      if (!transient) die(lastErr);
      lostReplies++; // Apps Script ran doPost and only the redirect target failed
      await backoff(attempt, lastErr);
      continue;
    }
    if (!json.ok) {
      // Apps Script occasionally bounces the redirect back to doGet without the
      // body, which reads as "unauthorised"; a genuinely wrong secret fails the
      // same way after every attempt.
      if (json.error === 'unauthorised') { lastErr = 'unauthorised'; lostReplies++; await backoff(attempt, lastErr); continue; }
      die(json.error || 'request failed');
    }
    return json;
  }
  die(`${lastErr} (after ${ATTEMPTS} attempts)`);
}

async function backoff(attempt, why) {
  if (attempt >= ATTEMPTS) return;
  const ms = 2000 * attempt;
  console.error(`sheet: attempt ${attempt} failed (${why.split('\n')[0].slice(0, 120)}); retrying in ${ms / 1000}s`);
  await sleep(ms);
}

function rowArgs(flags) {
  if (!flags.tab || !flags.row || typeof flags.task !== 'string') die('--tab, --row and --task are required');
  return { tab: flags.tab, row: Number(flags.row), expect_task: flags.task };
}

const isPending = (t) => t.agent && !t.done && t.status === '';

function hasGh() {
  try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

// Returns { state: 'OPEN' | 'MERGED' | 'CLOSED' }. Uses `gh` when installed; otherwise
// the REST API via curl, which honours HTTPS_PROXY (the cloud sandbox's GitHub proxy
// injects credentials for GH_TOKEN / GITHUB_TOKEN).
function prState(url) {
  if (hasGh()) {
    const out = execFileSync('gh', ['pr', 'view', url, '--json', 'state,mergedAt,isDraft,url'], { encoding: 'utf8' });
    return JSON.parse(out);
  }
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) throw new Error(`not a GitHub PR URL: ${url}`);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const args = ['-sS', '--fail-with-body', '--max-time', '30', '-H', 'Accept: application/vnd.github+json'];
  if (token) args.push('-H', `Authorization: Bearer ${token}`);
  args.push(`https://api.github.com/repos/${m[1]}/${m[2]}/pulls/${m[3]}`);
  const pr = JSON.parse(execFileSync('curl', args, { encoding: 'utf8' }));
  return { url, isDraft: !!pr.draft, mergedAt: pr.merged_at, state: pr.merged_at ? 'MERGED' : pr.state === 'closed' ? 'CLOSED' : 'OPEN' };
}

async function reconcile() {
  const { tasks } = await call({ action: 'list' });
  const changes = [];
  for (const t of tasks) {
    const ref = { tab: t.tab, row: t.row, expect_task: t.task };
    if (t.pr && (t.status === 'PR open' || t.status === 'In progress')) {
      let pr;
      try { pr = prState(t.pr); } catch (err) {
        changes.push({ ...ref, note: `gh could not read ${t.pr}: ${String(err.message).split('\n')[0]}` });
        continue;
      }
      if (pr.state === 'MERGED') {
        await call({ action: 'update', ...ref, set: { status: 'Merged', done: true } });
        changes.push({ ...ref, note: `merged -> Done` });
      } else if (pr.state === 'CLOSED') {
        await call({ action: 'update', ...ref, set: { status: 'Needs human', agent_notes: `PR closed without merge: ${t.pr}` } });
        changes.push({ ...ref, note: `closed unmerged -> Needs human` });
      } else if (t.status === 'In progress') {
        await call({ action: 'update', ...ref, set: { status: 'PR open' } });
        changes.push({ ...ref, note: `had a PR but was In progress -> PR open` });
      }
      continue;
    }
    if (t.status === 'In progress' && !t.pr) {
      const age = Date.now() - Date.parse(t.agent_updated || 0);
      if (!Number.isFinite(age) || age > STALE_CLAIM_MS) {
        await call({ action: 'update', ...ref, set: { status: '', agent_notes: `released stale claim (${t.agent_updated || 'no timestamp'})` } });
        changes.push({ ...ref, note: `stale claim released` });
      }
    }
  }
  return changes;
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  switch (cmd) {
    case 'list': {
      const { tasks } = await call({ action: 'list' });
      const out = flags.pending ? tasks.filter(isPending) : tasks;
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    case 'claim': {
      const ref = rowArgs(flags);
      const startedAt = Date.now() - 30_000; // clock-skew allowance
      const r = await call({ action: 'claim', ...ref });
      if (!r.claimed && lostReplies > 0) {
        // Our own write may have landed although its reply was lost. If the row went
        // "In progress" with no PR since we started, that was us.
        const { tasks } = await call({ action: 'list' });
        const row = tasks.find((t) => t.tab === ref.tab && t.task === ref.expect_task);
        if (row && row.status === 'In progress' && !row.pr && Date.parse(row.agent_updated) >= startedAt) {
          r.claimed = true;
          r.recovered = true;
        }
      }
      console.log(JSON.stringify(r));
      if (!r.claimed) process.exit(2);
      return;
    }
    case 'update': {
      const set = {};
      if (flags.status !== undefined) set.status = flags.status === true ? '' : flags.status;
      if (flags.pr !== undefined) set.pr = flags.pr === true ? '' : flags.pr;
      if (flags.notes !== undefined) set.agent_notes = flags.notes === true ? '' : flags.notes;
      if (flags.done !== undefined) set.done = String(flags.done) === 'true';
      if (!Object.keys(set).length) die('nothing to update');
      console.log(JSON.stringify(await call({ action: 'update', ...rowArgs(flags), set })));
      return;
    }
    case 'reconcile': {
      console.log(JSON.stringify(await reconcile(), null, 2));
      return;
    }
    default:
      die('usage: sheet.mjs list [--pending] | claim | update | reconcile');
  }
}

main().catch((err) => die(err.message || String(err)));
