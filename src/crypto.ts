// Column-level encryption for journal text (AES-256-GCM) plus token helpers.
// Only erasable TypeScript syntax here: scripts/import-sqlite.ts imports this file directly in Node.

const VERSION = "v1:";

const b64encode = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const b64decode = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Import the base64-encoded 32-byte ENCRYPTION_KEY secret. */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = b64decode(base64Key.trim());
  if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Encrypt `plaintext`. `aad` binds the ciphertext to its location (e.g. "journals.content:42"),
 * so a ciphertext copied into another row or column fails to decrypt.
 */
export async function encrypt(key: CryptoKey, plaintext: string | null, aad: string): Promise<string | null> {
  if (plaintext === null) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return VERSION + b64encode(out);
}

export async function decrypt(key: CryptoKey, stored: string | null, aad: string): Promise<string | null> {
  if (stored === null || stored === undefined) return null;
  if (!stored.startsWith(VERSION)) throw new Error("Unrecognised ciphertext format");
  const data = b64decode(stored.slice(VERSION.length));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: data.slice(0, 12), additionalData: new TextEncoder().encode(aad) },
    key,
    data.slice(12),
  );
  return new TextDecoder().decode(pt);
}

/** 32 random bytes as hex: used for login links and session cookies. */
export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
