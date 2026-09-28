import { exportTextFile } from "@/lib/native";

// CSV building and download for host exports. Rows are arrays of cells; a
// cell may be a string, number, boolean, Date, null or undefined.

// RFC 4180 quoting, plus a guard against spreadsheet formula injection: a
// text cell that starts with =, +, -, @ or a control character is prefixed
// with an apostrophe so Excel/Sheets show it as text instead of evaluating it.
// E.164 phone numbers ("+447700900000") are exempt: a sign followed only by
// digits is a plain number to a spreadsheet, not something it can execute.
export function csvEscape(value) {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]\d+$/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

// Hand `text` to the user as a UTF-8 CSV (BOM so Excel opens it with the
// right encoding): a download on the web, the share sheet in the iOS app.
// Resolves to the outcome from exportTextFile; throws only if the file could
// not be produced at all.
export async function downloadCsv(filename, text) {
  const result = await exportTextFile({
    filename,
    text: `\uFEFF${text}`,
    mimeType: "text/csv;charset=utf-8",
  });
  if (result === "failed") throw new Error("Could not save the CSV file.");
  return result;
}

// "My Big Night!" -> "my-big-night"
export function slugForFilename(s) {
  return String(s || "export").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "export";
}
