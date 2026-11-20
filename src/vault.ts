// Encrypts/decrypts journal columns, binding each ciphertext to its row and column.
import { decrypt, encrypt, importKey } from "./crypto.ts";

export type Column = "content" | "response";

export async function openVault(env: Env) {
  const key = await importKey(env.ENCRYPTION_KEY);
  const aad = (col: Column, id: number) => `journals.${col}:${id}`;
  return {
    enc: (col: Column, id: number, v: string | null) => encrypt(key, v, aad(col, id)),
    dec: (col: Column, id: number, v: string | null) => decrypt(key, v, aad(col, id)),
  };
}
export type Vault = Awaited<ReturnType<typeof openVault>>;
