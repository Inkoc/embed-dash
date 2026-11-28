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

test("decodes non-ASCII text in UTF-8 and UTF-16 with a BOM", () => {
  const text = "pässwörd-☃";
  expect(decodeSecret(Buffer.from(text))).toBe(text);
  expect(
    decodeSecret(
      Buffer.concat([Buffer.from(bom.le), Buffer.from(text, "utf16le")]),
    ),
  ).toBe(text);
});

test("doesn't take an even-length UTF-8 text for UTF-16", () => {
  expect(decodeSecret(Buffer.from("abcd"))).toBe("abcd");
  expect(decodeSecret(Buffer.from("ab"))).toBe("ab");
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
  expect(() => read({ TOKEN_FILE: join(dir, "missing") })).toThrow(
    "TOKEN_FILE must point to a readable secret file",
  );
});
