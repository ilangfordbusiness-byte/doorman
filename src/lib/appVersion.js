// Compare dotted numeric versions: isBelowVersion("1.1", "1.1.1") === true.
// Anything that cannot be parsed returns false, so a bad value never locks
// people out of the app.
export function isBelowVersion(installed, minimum) {
  const valid = /^\d+(\.\d+)*$/;
  if (!valid.test(installed ?? "") || !valid.test(minimum ?? "")) return false;
  const a = installed.split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
