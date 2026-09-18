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

async function call(body) {
  if (!URL_ || !SECRET) die('SHEET_AGENT_URL and SHEET_AGENT_SECRET must be set');
  // Apps Script answers POSTs with a 302 to googleusercontent; fetch follows it.
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: SECRET, ...body }),
    redirect: 'follow',
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { die(`non-JSON reply (${res.status}): ${text.slice(0, 300)}`); }
  if (!json.ok) die(json.error || 'request failed');
  return json;
}

function rowArgs(flags) {
  if (!flags.tab || !flags.row || typeof flags.task !== 'string') die('--tab, --row and --task are required');
  return { tab: flags.tab, row: Number(flags.row), expect_task: flags.task };
}

const isPending = (t) => t.agent && !t.done && t.status === '';

function prState(url) {
  const out = execFileSync('gh', ['pr', 'view', url, '--json', 'state,mergedAt,isDraft,url'], { encoding: 'utf8' });
  return JSON.parse(out); // state: OPEN | MERGED | CLOSED
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
      const r = await call({ action: 'claim', ...rowArgs(flags) });
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
