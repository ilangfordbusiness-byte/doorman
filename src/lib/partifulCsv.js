// Parse a guest-list CSV (Partiful's export, or any sheet with a name column)
// into door-list rows: { name, status, plus_ones, phone, email, note }.
//
// The header row is found by name rather than position, so extra or reordered
// columns don't matter. Without a recognisable header, the first column is
// taken as the name.

// RFC 4180: quoted fields may hold commas, quotes ("") and newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (h) => String(h || "").trim().toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();

const MATCHERS = {
  name: (h) => /^(full name|name|guest|guest name|attendee|attendee name)$/.test(h),
  first: (h) => /^first( name)?$/.test(h),
  last: (h) => /^(last|sur)( ?name)?$/.test(h),
  status: (h) => /(^status$|rsvp|response|approval)/.test(h) && !/(date|time|at$)/.test(h),
  plus: (h) => /(plus|\+ ?1|\+1s|guests? count|additional guests?)/.test(h),
  phone: (h) => /(phone|mobile|cell)/.test(h),
  email: (h) => /e ?mail/.test(h),
  note: (h) => /(note|comment|message)/.test(h),
};

function findColumns(header) {
  const h = header.map(norm);
  const col = {};
  for (const [key, test] of Object.entries(MATCHERS)) {
    const i = h.findIndex((x) => test(x));
    if (i !== -1) col[key] = i;
  }
  return col;
}

const isHeader = (col) => col.name !== undefined || (col.first !== undefined);

export function parseGuestCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { guests: [], headerFound: false };

  // Look for the header in the first few rows (some exports lead with a title).
  let headerIdx = -1;
  let col = {};
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const c = findColumns(rows[i]);
    if (isHeader(c)) { headerIdx = i; col = c; break; }
  }
  const dataRows = headerIdx === -1 ? rows : rows.slice(headerIdx + 1);
  if (headerIdx === -1) col = { name: 0 };

  const cell = (r, k) => (col[k] === undefined ? "" : String(r[col[k]] ?? "").trim());
  const seen = new Set();
  const guests = [];
  for (const r of dataRows) {
    let name = cell(r, "name");
    if (!name) name = [cell(r, "first"), cell(r, "last")].filter(Boolean).join(" ");
    name = name.replace(/\s+/g, " ").trim();
    let plus = parseInt(cell(r, "plus").replace(/[^0-9]/g, ""), 10);
    // No plus-ones column (or 0): accept "Jo Smith +2" / "Jo Smith (+2)".
    const inName = name.match(/^(.*?)\s*\(?\+\s*(\d{1,2})\)?$/);
    if (inName && inName[1] && !(plus > 0)) {
      name = inName[1].trim();
      plus = parseInt(inName[2], 10);
    }
    if (!name) continue;
    const g = {
      name: name.slice(0, 200),
      status: cell(r, "status") || null,
      plus_ones: Number.isFinite(plus) ? Math.min(Math.max(plus, 0), 50) : 0,
      phone: cell(r, "phone") || null,
      email: cell(r, "email").toLowerCase() || null,
      note: cell(r, "note") || null,
    };
    // Drop exact duplicate rows; keep different people who share a name.
    const key = [g.name.toLowerCase(), g.phone, g.email].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    guests.push(g);
  }
  return { guests, headerFound: headerIdx !== -1 };
}

// "DavesBassmentbananza_11-11_guests.csv" -> "DavesBassmentbananza 11-11"
export function listNameFromFilename(filename) {
  return String(filename || "")
    .replace(/\.csv$/i, "")
    .replace(/[_-]?guests?$/i, "")
    .replace(/_/g, " ")
    .trim() || "Door list";
}
