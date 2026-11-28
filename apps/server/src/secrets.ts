import { readFileSync } from "node:fs";

/**
 * Secret files are written by whatever editor or shell the operator had to
 * hand: Windows PowerShell 5 `echo … > file` and Notepad's "Unicode" save
 * UTF-16 LE with a byte-order mark and CRLF, some tools add a UTF-8 BOM, and
 * a few write UTF-16 with no BOM at all. All of them decode to the same text.
 */
export function decodeSecret(bytes: Uint8Array): string {
  const [first, second] = bytes;
  if (first === 0xef && second === 0xbb && bytes[2] === 0xbf)
    return strict("utf-8", bytes.subarray(3));
  if (first === 0xff && second === 0xfe)
    return strict("utf-16le", bytes.subarray(2));
  if (first === 0xfe && second === 0xff)
    return strict("utf-16be", bytes.subarray(2));
  return strict(bomlessUtf16(bytes) ?? "utf-8", bytes);
}

/**
 * Without a BOM, UTF-16 is recognised only for ASCII-range text: an even
 * length, a zero high byte in every character and a non-zero low byte. Tokens
 * and passwords typed on a keyboard fit that; UTF-8 never has a NUL in text,
 * so a UTF-8 file can't be mistaken for it.
 */
function bomlessUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  if (!bytes.length || bytes.length % 2) return null;
  const ascii = (high: number) => {
    for (let i = 0; i < bytes.length; i += 2)
      if (bytes[i + high] !== 0 || !bytes[i + 1 - high]) return false;
    return true;
  };
  return ascii(1) ? "utf-16le" : ascii(0) ? "utf-16be" : null;
}

function strict(encoding: string, bytes: Uint8Array) {
  return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(
    bytes,
  );
}

/** Control characters (NUL, line breaks inside the value) and characters that print as nothing. */
const hidden = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

const recreate =
  'Recreate it as plain text on one line (see "Secret files" in the README).';

/**
 * A secret from `${name}_FILE` (which wins) or `${name}`, without surrounding
 * whitespace or line endings, which are never part of a token or password.
 * Errors name the variable and file but never repeat what is in them.
 */
export function readSecret(
  env: NodeJS.ProcessEnv,
  name: string,
  resolvePath: (path: string) => string,
  { spaces = false } = {},
): string | undefined {
  const file = env[`${name}_FILE`];
  let raw = env[name];
  let source = name;
  if (file) {
    const path = resolvePath(file);
    source = `${name}_FILE (${path})`;
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      throw new Error(`${name}_FILE must point to a readable secret file`);
    }
    try {
      raw = decodeSecret(bytes);
    } catch {
      throw new Error(`${source} is not readable text. ${recreate}`);
    }
  }
  if (raw === undefined) return undefined;
  const value = raw.trim();
  const fix = file ? ` ${recreate}` : "";
  if (!value) throw new Error(`${source} is empty.${fix}`);
  if (hidden.test(value))
    throw new Error(
      `${source} contains invisible or control characters, such as a NUL or a line break inside the value.${fix}`,
    );
  if (!spaces && /\s/.test(value))
    throw new Error(`${source} must not contain spaces.${fix}`);
  return value;
}
