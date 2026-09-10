#!/usr/bin/env node
// Pushes the branded auth email templates in supabase/templates/ to a hosted
// Supabase project through the Management API, so production and the local
// stack (config.toml) send the same emails. Only the template/subject keys are
// written; nothing else in the auth config is touched.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/push-auth-templates.mjs --ref <project-ref>
//   (the token is also read from ~/.supabase/access-token, where `supabase login` stores it)
//
// The templates link to {{ .SiteURL }}/auth/confirm, so a trailing slash on the
// project's Site URL is stripped in the same write.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const refIdx = args.indexOf('--ref');
const ref = refIdx >= 0 ? args[refIdx + 1] : process.env.SUPABASE_PROJECT_REF;
if (!ref) { console.error('usage: push-auth-templates.mjs --ref <project-ref>'); process.exit(1); }
const dryRun = args.includes('--dry-run');

let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  try { token = (await readFile(join(homedir(), '.supabase', 'access-token'), 'utf8')).trim(); } catch { /* fall through */ }
}
if (!token && process.platform === 'darwin') {
  // `supabase login` stores the token in the macOS Keychain.
  try {
    token = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim();
  } catch { /* fall through */ }
}
if (!token) { console.error('No SUPABASE_ACCESS_TOKEN and no ~/.supabase/access-token (run `supabase login`).'); process.exit(1); }

const TEMPLATES = {
  confirmation: 'Confirm your DoorMan email',
  recovery: 'Reset your DoorMan password',
  email_change: 'Confirm your new DoorMan email',
};

const base = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const current = await (await fetch(base, { headers })).json();
if (current.message) { console.error('Management API:', current.message); process.exit(1); }
const siteUrl = String(current.site_url || '');
console.log(`project ${ref}: site_url=${siteUrl} smtp_host=${current.smtp_host || '(built-in)'}`);
const patch = {};
if (siteUrl.endsWith('/')) {
  // The templates append /auth/confirm, so a trailing slash would produce
  // "https://host//auth/confirm". Normalise it in the same write.
  patch.site_url = siteUrl.replace(/\/+$/, '');
  console.log(`  site_url: "${siteUrl}" -> "${patch.site_url}" (trailing slash removed)`);
}
for (const [name, subject] of Object.entries(TEMPLATES)) {
  const html = await readFile(new URL(`../supabase/templates/${name}.html`, import.meta.url), 'utf8');
  patch[`mailer_subjects_${name}`] = subject;
  patch[`mailer_templates_${name}_content`] = html;
  console.log(`  ${name}: "${subject}" (${html.length} bytes)`);
}
if (dryRun) { console.log('dry run, nothing pushed'); process.exit(0); }

const res = await fetch(base, { method: 'PATCH', headers, body: JSON.stringify(patch) });
if (!res.ok) { console.error('PATCH failed', res.status, await res.text()); process.exit(1); }
console.log('pushed. Send yourself a sign-up confirmation to check placement.');
