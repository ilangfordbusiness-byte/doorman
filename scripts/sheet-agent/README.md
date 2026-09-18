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

## Using the CLI by hand

```bash
export SHEET_AGENT_URL='https://script.google.com/macros/s/.../exec'
export SHEET_AGENT_SECRET='...'
node scripts/sheet-agent/sheet.mjs list --pending
node scripts/sheet-agent/sheet.mjs reconcile
node scripts/sheet-agent/sheet.mjs update --tab Bugs --row 4 --task "<exact task text>" --status "" --notes ""
```

Every write carries the Task text that was read, and the script refuses the
write if the row's Task no longer matches, so sorting or inserting rows while a
run is in flight cannot corrupt a neighbouring row.
