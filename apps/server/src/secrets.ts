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
  const utf8 = attempt("utf-8", bytes);
  // Valid UTF-8 without a NUL is UTF-8, whatever it holds: a second line or a
  // control character is then refused, never re-read as another clean value.
  if (utf8 !== null && !bytes.includes(0)) return utf8;
  // Valid UTF-8 with NULs is UTF-16 only when most code units have a high
  // byte below 0x20, as ASCII (0x00), Latin, Greek and Cyrillic do; a stray
  // NUL in UTF-8 text stays UTF-8 and is refused.
  if (utf8 !== null && lowHighUnits(bytes) * 4 <= bytes.length) return utf8;
  const utf16 = bomlessUtf16(bytes);
  if (utf16 !== null) return utf16;
  if (utf8 === null) throw new Error("Not readable text");
  return utf8;
}

/** UTF-16 code units with a high byte below 0x20, in the likelier byte order. */
function lowHighUnits(bytes: Uint8Array) {
  let even = 0;
  let odd = 0;
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    if (bytes[i]! < 0x20) even++;
    if (bytes[i + 1]! < 0x20) odd++;
  }
  return Math.max(even, odd);
}

/**
 * Without a BOM, UTF-16 is recognised by its zero bytes: every ASCII
 * character, a line ending included, has a zero high byte, which sits at odd
 * offsets in little-endian and even ones in big-endian. The side with more
 * zeros is tried first, and a reading counts only if it decodes strictly to
 * clean text. It is only tried for bytes that hold a NUL or aren't valid
 * UTF-8, so text with no ASCII character at all, not even a line ending, may
 * not be recognised (Cyrillic and many CJK characters also read as valid
 * UTF-8); such values need UTF-8 or a BOM, as the README says.
 */
function bomlessUtf16(bytes: Uint8Array): string | null {
  if (!bytes.length || bytes.length % 2) return null;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) continue;
    if (i % 2) odd++;
    else even++;
  }
  // With no zeros to go by, the high bytes are the side that varies less:
  // one script keeps them nearly constant.
  const bigEndian =
    even === odd ? distinct(bytes, 0) < distinct(bytes, 1) : even > odd;
  const order = bigEndian
    ? (["utf-16be", "utf-16le"] as const)
    : (["utf-16le", "utf-16be"] as const);
  for (const encoding of order) {
    const text = attempt(encoding, bytes);
    if (text !== null && plain(text)) return text;
  }
  return null;
}

function distinct(bytes: Uint8Array, offset: number) {
  const seen = new Set<number>();
  for (let i = offset; i < bytes.length; i += 2) seen.add(bytes[i]!);
  return seen.size;
}

function strict(encoding: string, bytes: Uint8Array) {
  return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(
    bytes,
  );
}

function attempt(encoding: string, bytes: Uint8Array) {
  try {
    return strict(encoding, bytes);
  } catch {
    return null;
  }
}

/** Emoji sequences legitimately hold joiners and variation selectors, so they are set aside before the check. */
const emoji = /\p{RGI_Emoji}/gv;
/**
 * Control characters (NUL, line breaks inside the value), format characters
 * and everything Unicode says renders as nothing when unsupported
 * (Default_Ignorable_Code_Point: joiners, fillers, variation selectors).
 * Visible combining accents are not in these sets.
 */
const hidden =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;

const invisible = (value: string) => hidden.test(value.replace(emoji, ""));

/** A reading that is a single clean value once trimmed, with no unassigned or private-use code points. */
const plain = (text: string) => {
  const value = text.trim();
  return !!value && !invisible(value) && !/[\p{Cn}\p{Co}]/u.test(value);
};

const recreate =
  'Recreate it as plain text on one line (see "Secret files" in the README).';

function unreadable(source: string, error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "ENOENT" || code === "ENOTDIR")
    return `${source} doesn't exist. Create it, or fix the path. ${recreate}`;
  if (code === "EACCES" || code === "EPERM") {
    const uid = process.getuid?.();
    return `${source} can't be read by the user the server runs as${uid === undefined ? "" : ` (uid ${uid})`}. Give that user read access to the file (see "Secret files" in the README).`;
  }
  return `${source} can't be read. Check that it is a readable file. ${recreate}`;
}

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
    } catch (error) {
      throw new Error(unreadable(source, error), { cause: error });
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
  if (invisible(value))
    throw new Error(
      `${source} contains invisible or control characters, such as a NUL or a line break inside the value.${fix}`,
    );
  if (!spaces && /\s/.test(value))
    throw new Error(`${source} must not contain spaces.${fix}`);
  return value;
}
