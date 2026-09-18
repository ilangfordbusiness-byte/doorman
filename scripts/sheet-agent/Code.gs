/**
 * DoorMan task-sheet bridge — Google Apps Script bound to the team task sheet.
 *
 * Exposes the Features / Bugs tabs as JSON so the hourly Claude routine can
 * read open tasks and write back status, PR links and notes. The Google Drive
 * connector can read a sheet but cannot write cells; this script is the
 * write path (and a cleaner read path: it returns tab + row numbers).
 *
 * Setup (once, by a sheet owner):
 *   1. Extensions -> Apps Script, paste this file as Code.gs.
 *   2. Project Settings -> Script Properties: add SHEET_AGENT_SECRET with a
 *      long random value (e.g. `openssl rand -hex 32`).
 *      Optional: TASK_TABS = "Features,Bugs" (defaults to that).
 *   3. Run `setup` once from the editor (authorise when prompted). It adds the
 *      agent columns to each task tab: Agent (checkbox), Status (dropdown),
 *      PR, Agent notes, Agent updated.
 *   4. Deploy -> New deployment -> Web app. Execute as: Me. Who has access:
 *      Anyone. Copy the /exec URL — that is SHEET_AGENT_URL for the routine.
 *
 * Every request must carry the secret. Row writes also carry the Task text
 * the caller read, and are refused if the row's Task no longer matches, so a
 * sort or insert between read and write cannot corrupt a neighbour.
 */

const DEFAULT_TASK_TABS = 'Features,Bugs';
const BASE_COLUMNS = ['Done?', 'Task', 'Priority', 'Deadline', 'Assignee', 'Notes'];
const AGENT_COLUMNS = ['Agent', 'Status', 'PR', 'Agent notes', 'Agent updated'];
const STATUSES = ['In progress', 'PR open', 'Merged', 'Needs human'];

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  return respond_(() => {
    authorise_((e && e.parameter && e.parameter.secret) || '');
    return { ok: true, tabs: taskTabs_(), tasks: readTasks_() };
  });
}

function doPost(e) {
  return respond_(() => {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authorise_(body.secret || '');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (body.action) {
        case 'claim':  return claim_(body);
        case 'update': return update_(body);
        case 'list':   return { ok: true, tabs: taskTabs_(), tasks: readTasks_() };
        default: throw new Error('unknown action: ' + body.action);
      }
    } finally {
      lock.releaseLock();
    }
  });
}

// ---------------------------------------------------------------------------
// One-off setup: add the agent columns + validations to each task tab
// ---------------------------------------------------------------------------

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const missing = taskTabs_().filter((name) => !ss.getSheetByName(name));
  if (missing.length) {
    throw new Error(
      'Task tabs not found: ' + missing.join(', ') +
      '. Sheet tabs are: ' + ss.getSheets().map((s) => s.getName()).join(', ') +
      '. Rename them or set the TASK_TABS script property.');
  }
  taskTabs_().forEach((name) => {
    const sheet = ss.getSheetByName(name);
    const header = findHeader_(sheet);
    const cols = header.columns;
    AGENT_COLUMNS.forEach((title) => {
      if (cols[title] === undefined) {
        const nextCol = sheet.getLastColumn() + 1;
        sheet.getRange(header.row, nextCol).setValue(title).setFontWeight('bold');
        cols[title] = nextCol;
      }
    });
    const lastRow = Math.max(sheet.getMaxRows(), header.row + 1);
    const bodyRows = lastRow - header.row;
    sheet.getRange(header.row + 1, cols['Agent'], bodyRows, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    sheet.getRange(header.row + 1, cols['Status'], bodyRows, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUSES, true).setAllowInvalid(true).build());
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function readTasks_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = [];
  taskTabs_().forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;
    const header = findHeader_(sheet);
    const cols = header.columns;
    const lastRow = sheet.getLastRow();
    if (lastRow <= header.row) return;
    const width = sheet.getLastColumn();
    const values = sheet.getRange(header.row + 1, 1, lastRow - header.row, width).getValues();
    values.forEach((rowVals, i) => {
      const cell = (title) => (cols[title] === undefined ? '' : rowVals[cols[title] - 1]);
      const task = String(cell('Task') || '').trim();
      if (!task) return;
      out.push({
        tab: name,
        row: header.row + 1 + i,
        done: truthy_(cell('Done?')),
        task: task,
        priority: String(cell('Priority') || '').trim(),
        deadline: fmt_(cell('Deadline')),
        assignee: String(cell('Assignee') || '').trim(),
        notes: String(cell('Notes') || '').trim(),
        agent: truthy_(cell('Agent')),
        status: String(cell('Status') || '').trim(),
        pr: String(cell('PR') || '').trim(),
        agent_notes: String(cell('Agent notes') || '').trim(),
        agent_updated: fmt_(cell('Agent updated')),
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Set Status = "In progress" only if Status is currently blank. Returns {claimed}. */
function claim_(body) {
  const target = locate_(body);
  const current = String(target.sheet.getRange(target.row, target.cols['Status']).getValue() || '').trim();
  if (current !== '') return { ok: true, claimed: false, status: current };
  target.sheet.getRange(target.row, target.cols['Status']).setValue('In progress');
  stamp_(target);
  return { ok: true, claimed: true, status: 'In progress' };
}

/** Write any of: status, pr, agent_notes, done. Only provided keys change. */
function update_(body) {
  const target = locate_(body);
  const set = body.set || {};
  if ('status' in set) {
    const s = String(set.status || '').trim();
    if (s && STATUSES.indexOf(s) === -1) throw new Error('bad status: ' + s);
    target.sheet.getRange(target.row, target.cols['Status']).setValue(s);
  }
  if ('pr' in set) target.sheet.getRange(target.row, target.cols['PR']).setValue(String(set.pr || ''));
  if ('agent_notes' in set) {
    target.sheet.getRange(target.row, target.cols['Agent notes']).setValue(String(set.agent_notes || ''));
  }
  if ('done' in set) target.sheet.getRange(target.row, target.cols['Done?']).setValue(!!set.done);
  stamp_(target);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function locate_(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (taskTabs_().indexOf(body.tab) === -1) throw new Error('not a task tab: ' + body.tab);
  const sheet = ss.getSheetByName(body.tab);
  if (!sheet) throw new Error('tab not found: ' + body.tab);
  const header = findHeader_(sheet);
  const cols = header.columns;
  AGENT_COLUMNS.forEach((c) => { if (cols[c] === undefined) throw new Error('run setup(): missing column ' + c); });
  const row = Number(body.row);
  if (!Number.isInteger(row) || row <= header.row) throw new Error('bad row: ' + body.row);
  const actual = String(sheet.getRange(row, cols['Task']).getValue() || '').trim();
  if (typeof body.expect_task === 'string' && actual !== body.expect_task.trim()) {
    throw new Error('row ' + row + ' Task changed since read: "' + actual + '" != "' + body.expect_task + '"');
  }
  return { sheet: sheet, row: row, cols: cols };
}

function stamp_(target) {
  target.sheet.getRange(target.row, target.cols['Agent updated']).setValue(new Date().toISOString());
}

/** Find the header row (the first row containing a "Task" cell) and map titles to 1-based columns. */
function findHeader_(sheet) {
  const scan = sheet.getRange(1, 1, Math.min(10, sheet.getMaxRows()), sheet.getMaxColumns()).getValues();
  for (let r = 0; r < scan.length; r++) {
    const titles = scan[r].map((v) => String(v || '').trim());
    if (titles.indexOf('Task') !== -1) {
      const columns = {};
      titles.forEach((t, i) => { if (t && columns[t] === undefined) columns[t] = i + 1; });
      BASE_COLUMNS.forEach((c) => { if (columns[c] === undefined) throw new Error(sheet.getName() + ': header missing ' + c); });
      return { row: r + 1, columns: columns };
    }
  }
  throw new Error(sheet.getName() + ': no header row with a "Task" column in the first 10 rows');
}

function taskTabs_() {
  const raw = PropertiesService.getScriptProperties().getProperty('TASK_TABS') || DEFAULT_TASK_TABS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function authorise_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty('SHEET_AGENT_SECRET');
  if (!expected) throw new Error('SHEET_AGENT_SECRET script property is not set');
  if (!secret || secret !== expected) throw new Error('unauthorised');
}

function truthy_(v) {
  if (v === true) return true;
  const s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'x' || s === '1';
}

function fmt_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v || '').trim();
}

function respond_(fn) {
  let payload;
  try {
    payload = fn();
  } catch (err) {
    payload = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
