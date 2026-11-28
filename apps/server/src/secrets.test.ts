import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { decodeSecret, readSecret } from "./secrets.js";

const secret = "Fixture-Secret.42";
const dir = mkdtempSync(join(tmpdir(), "embed-secrets-"));
afterAll(() => rmSync(dir, { recursive: true }));

const utf16be = (text: string) => Buffer.from(text, "utf16le").swap16();
const bom = { le: [0xff, 0xfe], be: [0xfe, 0xff], utf8: [0xef, 0xbb, 0xbf] };

function fromFile(bytes: Uint8Array, options?: { spaces?: boolean }) {
  const file = join(dir, "secret");
  writeFileSync(file, bytes);
  return readSecret({ TOKEN_FILE: file }, "TOKEN", (path) => path, options);
}

test.each([
  ["UTF-8", (text: string) => Buffer.from(text)],
  [
    "UTF-8 with BOM",
    (text: string) => Buffer.concat([Buffer.from(bom.utf8), Buffer.from(text)]),
  ],
  [
    "UTF-16 LE with BOM",
    (text: string) =>
      Buffer.concat([Buffer.from(bom.le), Buffer.from(text, "utf16le")]),
  ],
  [
    "UTF-16 BE with BOM",
    (text: string) => Buffer.concat([Buffer.from(bom.be), utf16be(text)]),
  ],
  ["UTF-16 LE without BOM", (text: string) => Buffer.from(text, "utf16le")],
  ["UTF-16 BE without BOM", utf16be],
])("reads %s with any line ending", (_name, encode) => {
  for (const ending of ["", "\n", "\r\n", "\r\n\r\n", "  \t\n"])
    expect(fromFile(encode(`${secret}${ending}`))).toBe(secret);
  expect(fromFile(encode(` \t${secret}\r\n`))).toBe(secret);
});

const encodings: [string, (text: string) => Buffer][] = [
  ["UTF-8", (text) => Buffer.from(text)],
  ["UTF-8 with BOM", (text) => Buffer.from(`\ufeff${text}`)],
  ["UTF-16 LE with BOM", (text) => Buffer.from(`\ufeff${text}`, "utf16le")],
  ["UTF-16 BE with BOM", (text) => utf16be(`\ufeff${text}`)],
  ["UTF-16 LE without BOM", (text) => Buffer.from(text, "utf16le")],
  ["UTF-16 BE without BOM", utf16be],
];

test.each(
  [
    "пароль-42",
    "Пароль",
    "pass雪",
    "密码🔐x",
    "zażółć-gęślą",
    "🔐 safe ❤\ufe0f 👨\u200d👩\u200d👧",
  ].flatMap((text) =>
    encodings.map(([name, encode]) => [text, name, encode] as const),
  ),
)("reads the password %s from %s", (text, name, encode) => {
  // BOM-less UTF-16 with no ASCII character at all is covered below.
  const endings =
    name.endsWith("without BOM") && !/[ -~]/.test(text)
      ? ["\n", "\r\n"]
      : ["", "\n", "\r\n"];
  for (const ending of endings)
    expect(fromFile(encode(`${text}${ending}`), { spaces: true })).toBe(text);
});

test("BOM-less UTF-16 with no ASCII at all is read only if it isn't valid UTF-8", () => {
  // Emoji surrogates are never valid UTF-8, in either byte order's favour.
  expect(decodeSecret(Buffer.from("🔐🔐", "utf16le"))).toBe("🔐🔐");
  // Cyrillic code units are also valid UTF-8 bytes, so without a line ending
  // or a BOM the file reads as UTF-8 and is refused for its control bytes.
  expect(() => fromFile(Buffer.from("пароль", "utf16le"))).toThrow(
    "invisible or control",
  );
});

test("doesn't take an even-length UTF-8 text for UTF-16", () => {
  expect(decodeSecret(Buffer.from("abcd"))).toBe("abcd");
  expect(decodeSecret(Buffer.from("ab"))).toBe("ab");
  // Damaged UTF-8 stays UTF-8, to be refused for what it holds.
  expect(decodeSecret(Buffer.from("abc\0"))).toBe("abc\0");
  expect(decodeSecret(Buffer.from("secret\0\n"))).toBe("secret\0\n");
});

test.each([
  ["a\nb\n"],
  ["a\r\nb"],
  ["a\nb"],
  ["a\u0001b\u0002"],
  ["\u0001a\u0002b\u0003c"],
  ["ab\ncd\nef\n"],
  ["Fixture\tSecret"],
])("valid UTF-8 %j stays UTF-8 and is refused, never re-read", (text) => {
  expect(decodeSecret(Buffer.from(text))).toBe(text);
  expect(() => fromFile(Buffer.from(text))).toThrow(
    /invisible or control|must not contain spaces/,
  );
});

test.each([
  ["empty", Buffer.alloc(0), "is empty"],
  ["blank lines", Buffer.from("\r\n \n"), "is empty"],
  ["a BOM alone", Buffer.from(bom.le), "is empty"],
  ["NUL", Buffer.from(`${secret}\0x`), "invisible or control"],
  ["NUL only", Buffer.from([0, 0, 0]), "invisible or control"],
  ["two lines", Buffer.from(`${secret}\nsecond`), "invisible or control"],
  ["escape", Buffer.from(`${secret}\x1b`), "invisible or control"],
  ["zero-width space", Buffer.from(`${secret}\u200b1`), "invisible or control"],
  ["inner BOM", Buffer.from(`a\ufeff${secret}`), "invisible or control"],
  ["trailing NUL", Buffer.from(`${secret}x\0`), "invisible or control"],
  ["NUL padding", Buffer.from(`${secret}\0\0\0`), "invisible or control"],
  ["grapheme joiner", Buffer.from(`${secret}\u034f`), "invisible or control"],
  ["Hangul filler", Buffer.from(`\u3164${secret}`), "invisible or control"],
  ["soft hyphen", Buffer.from(`a\u00ad${secret}`), "invisible or control"],
  ["word joiner", Buffer.from(`${secret}\u2060`), "invisible or control"],
  [
    "lone variation selector",
    Buffer.from(`${secret}\ufe0f`),
    "invisible or control",
  ],
  ["bidi override", Buffer.from(`\u202e${secret}`), "invisible or control"],
  ["invalid UTF-8", Buffer.from([0x66, 0xc3, 0x28]), "not readable text"],
  [
    "odd-length UTF-16",
    Buffer.concat([
      Buffer.from(bom.le),
      Buffer.from("abc", "utf16le"),
      Buffer.from([0x61]),
    ]),
    "not readable text",
  ],
  ["inner space", Buffer.from(`${secret} x`), "must not contain spaces"],
])("rejects %s, naming the file but not its contents", (_name, bytes, why) => {
  const read = () => fromFile(bytes);
  expect(read).toThrow(why);
  expect(read).toThrow(join(dir, "secret"));
  expect(read).toThrow("TOKEN_FILE");
  expect(read).toThrow("plain text on one line");
  try {
    read();
  } catch (error) {
    expect((error as Error).message).not.toContain(secret);
  }
});

test("a password may hold inner spaces but not line breaks", () => {
  expect(fromFile(Buffer.from(" correct horse \r\n"), { spaces: true })).toBe(
    "correct horse",
  );
  expect(() =>
    fromFile(Buffer.from("correct\nhorse"), { spaces: true }),
  ).toThrow("invisible or control");
});

test("variables are checked the same way, and the file wins", () => {
  const file = join(dir, "winner");
  writeFileSync(file, `${secret}\n`);
  const read = (env: NodeJS.ProcessEnv) =>
    readSecret(env, "TOKEN", (path) => path);
  expect(read({})).toBeUndefined();
  expect(read({ TOKEN: ` ${secret}\n` })).toBe(secret);
  expect(read({ TOKEN: "env", TOKEN_FILE: file })).toBe(secret);
  expect(() => read({ TOKEN: " " })).toThrow("TOKEN is empty.");
  expect(() => read({ TOKEN: `${secret}\u200b` })).toThrow(
    "TOKEN contains invisible or control characters",
  );
});

test("visible combining accents are kept", () => {
  expect(fromFile(Buffer.from("cafe\u0301-ñ\u0303"))).toBe(
    "cafe\u0301-ñ\u0303",
  );
});

test("a missing or unreadable file is named with what to do, never its contents", () => {
  const read = (path: string) => () =>
    readSecret({ TOKEN_FILE: path }, "TOKEN", (file) => file);
  const missing = join(dir, "missing");
  expect(read(missing)).toThrow(`TOKEN_FILE (${missing}) doesn't exist.`);
  expect(read(missing)).toThrow("plain text on one line");
  expect(read(dir)).toThrow(`TOKEN_FILE (${dir}) can't be read.`);
  const locked = join(dir, "locked");
  writeFileSync(locked, secret, { mode: 0o000 });
  // Root reads any file, so the permission case only shows for other users.
  if (process.getuid?.() !== 0) {
    expect(read(locked)).toThrow(
      `TOKEN_FILE (${locked}) can't be read by the user the server runs as (uid ${process.getuid?.()}).`,
    );
    expect(read(locked)).not.toThrow(secret);
  }
});
