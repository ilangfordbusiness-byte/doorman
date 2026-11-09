// Apple Wallet .pkpass builder: pass.json + images, a manifest of SHA-1
// hashes, and a detached PKCS#7 signature of the manifest made with the Pass
// Type ID certificate (WWDR intermediate included). Pure JS (node-forge for
// CMS, fflate for the zip) so it runs in the Supabase edge runtime with no
// native modules or file system.
import forge from 'npm:node-forge@1.3.1';
import { zipSync } from 'npm:fflate@0.8.2';

export interface PassSigningConfig {
  passTypeIdentifier: string;
  teamIdentifier: string;
  certPem: string;
  keyPem: string;
  keyPassphrase?: string;
  wwdrPem: string;
}

// Reads the signing config from env. Returns null when any required value is
// missing, so the caller can answer "not set up" instead of failing to sign.
export function passSigningConfigFromEnv(): PassSigningConfig | null {
  const get = (k: string) => (Deno.env.get(k) || '').trim();
  // Secrets stored as one-line values often carry literal "\n"; restore them.
  const pem = (k: string) => get(k).replace(/\\n/g, '\n');
  const cfg = {
    passTypeIdentifier: get('APPLE_PASS_TYPE_ID'),
    teamIdentifier: get('APPLE_TEAM_ID'),
    certPem: pem('APPLE_PASS_CERT_PEM'),
    keyPem: pem('APPLE_PASS_KEY_PEM'),
    keyPassphrase: get('APPLE_PASS_KEY_PASSPHRASE') || undefined,
    wwdrPem: pem('APPLE_WWDR_CERT_PEM'),
  };
  if (!cfg.passTypeIdentifier || !cfg.teamIdentifier || !cfg.certPem || !cfg.keyPem || !cfg.wwdrPem) {
    return null;
  }
  return cfg;
}

function bytesToBinary(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return s;
}

function binaryToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  return binaryToBytes(atob(b64));
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Detached PKCS#7 (CMS SignedData) over `content`, DER-encoded.
export function signManifest(content: Uint8Array, cfg: PassSigningConfig): Uint8Array {
  const cert = forge.pki.certificateFromPem(cfg.certPem);
  const wwdr = forge.pki.certificateFromPem(cfg.wwdrPem);
  const key = cfg.keyPassphrase
    ? forge.pki.decryptRsaPrivateKey(cfg.keyPem, cfg.keyPassphrase)
    : forge.pki.privateKeyFromPem(cfg.keyPem);
  if (!key) throw new Error('Could not read the pass signing key (wrong passphrase?)');

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(bytesToBinary(content));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  return binaryToBytes(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

// Zips pass.json + files + manifest.json + signature into a .pkpass.
export async function buildPkpass(
  passJson: Record<string, unknown>,
  files: Record<string, Uint8Array>,
  cfg: PassSigningConfig,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const all: Record<string, Uint8Array> = {
    'pass.json': enc.encode(JSON.stringify({
      ...passJson,
      passTypeIdentifier: cfg.passTypeIdentifier,
      teamIdentifier: cfg.teamIdentifier,
    })),
    ...files,
  };
  const manifest: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(all)) manifest[name] = await sha1Hex(bytes);
  const manifestBytes = enc.encode(JSON.stringify(manifest));
  all['manifest.json'] = manifestBytes;
  all['signature'] = signManifest(manifestBytes, cfg);
  return zipSync(all, { level: 6 });
}
