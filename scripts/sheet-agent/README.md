# Task-sheet routine

Hourly cloud Claude routine that reads the team task sheet (Features and Bugs
tabs), opens a ready-for-review PR for every row ticked **Agent**, and writes
the PR link and status back to the sheet. Merge is always a human decision:
the sheet's **Done?** is ticked only after the routine sees the PR merged.

```text
Google Sheet ──(Apps Script web app, Code.gs)──► sheet.mjs ──► routine prompt
      ▲                                                            │
      └── Status / PR / Agent notes / Done? written back ◄─── one subagent per row ──► gh pr create
```

## Sheet columns

`setup()` in `Code.gs` appends these to each task tab, after the existing
`Done? | Task | Priority | Deadline | Assignee | Notes`:

| Column | Written by | Meaning |
| --- | --- | --- |
| Agent | humans | Checkbox. Only ticked rows are ever picked up. |
| Status | routine | blank → `In progress` → `PR open` → `Merged`, or `Needs human`. |
| PR | routine | Pull request URL. Also the idempotency lock. |
| Agent notes | routine | Why a row needs a human, or what the routine could not do. |
| Agent updated | routine | ISO timestamp of the last write; used to release stale claims. |

Row lifecycle:

1. Human ticks **Agent** on a row with a clear, code-shaped task.
2. Next hourly run: routine claims the row (`In progress`), spawns a subagent in
   its own worktree, subagent branches `agent/<tab>-r<row>-<slug>` from main,
   implements, runs lint and build, opens a PR. Routine writes `PR open`
   and the link.
3. CI (`.github/workflows/ci.yml`) runs lint/typecheck/build and the three SQL
   suites on the PR. A human reviews and merges.
4. Next run after merge: `reconcile` flips the row to `Merged` and ticks Done?.

A row the agent cannot deliver (product decision, app-store work, too vague)
gets `Needs human` plus a question in Agent notes. Clear Status to blank to
re-queue it after answering.

## One-time setup

1. **Apps Script.** In the sheet: Extensions → Apps Script. Paste
   `Code.gs`. Project Settings → Script Properties: `SHEET_AGENT_SECRET` =
   `openssl rand -hex 32` output. If the tabs are not literally named
   `Features` and `Bugs`, also set `TASK_TABS`. Run `setup` once from the editor
   and authorise it. Deploy → New deployment → Web app, execute as *Me*, access
   *Anyone*. Copy the `/exec` URL.
2. **Routine.** Created at https://claude.ai/code/routines with the prompt in
   `ROUTINE_PROMPT.md`, hourly, repo `ilangfordbusiness-byte/doorman`, and the
   environment variables `SHEET_AGENT_URL` and `SHEET_AGENT_SECRET`. Push
   notifications on. Re-create or update the routine whenever
   `ROUTINE_PROMPT.md` changes; the prompt is not read from the repo at run time.
3. **CI.** Merge `.github/workflows/ci.yml` so agent PRs get the SQL suites,
   which the cloud runner cannot execute itself.
4. **GitHub write access.** The cloud sandbox reaches GitHub through Claude's
   proxy, which needs the Claude GitHub App installed with write access on the
   account that owns the repository
   (https://github.com/apps/claude/installations/select_target). Without it,
   clones work but every push and API write returns 403 and the routine stops
   at its access probe.
5. **Environment network access.** The routine's cloud environment must allow
   egress to `script.google.com` and `script.googleusercontent.com` (Custom
   network access with the default package-manager list kept).

## Known quirks of the bridge

- The first POST of a run to the Apps Script often comes back as a Google
  404 page or as `unauthorised` (the redirect bounced to `doGet` without the
  body). `sheet.mjs` retries up to four times with backoff and a 60s timeout
  per request. A wrong secret therefore takes ~12s to fail.
- A write can land even when its reply is lost that way. `claim` handles it:
  if a retry says the row is already taken but it went `In progress` with no
  PR since the command started, it reports `"recovered": true` and exits 0.
- `reconcile` uses `gh` when installed and otherwise the GitHub REST API via
  `curl` (which honours the sandbox's `HTTPS_PROXY` and `GH_TOKEN` /
  `GITHUB_TOKEN`). The cloud sandbox has no `gh`; the routine prompt tells the
  agent to fall back to the GitHub MCP tools for anything the CLI cannot read.

## Using the CLI by hand

```bash
export SHEET_AGENT_URL='https://script.google.com/macros/s/.../exec'
export SHEET_AGENT_SECRET='...'
node scripts/sheet-agent/sheet.mjs list --pending
node scripts/sheet-agent/sheet.mjs reconcile
node scripts/sheet-agent/sheet.mjs update --tab Bugs --row 4 --task "<exact task text>" --status "" --notes ""
```

## Living with the TODO tracker automation

`Code.gs` also holds the sheet's existing `onEdit` automation: ticking Done?
strikes the row through and moves it to the bottom, and every task tab stays
sorted by Priority. Rows therefore move, and the bridge is built for that:

- Every write carries the Task text that was read. If the row at that number
  no longer holds that text, the bridge re-finds the row by exact Task text
  and writes there. If the text is missing or appears on more than one row it
  refuses the write, so a neighbouring row can never be corrupted.
- Programmatic writes never fire `onEdit`, so when `reconcile` ticks Done? the
  bridge runs the same sort itself. The merged row is struck through and moved
  down exactly as if a person had clicked the box.
