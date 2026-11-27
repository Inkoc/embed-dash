import { expect, test } from "vitest";
import {
  botIdentitySchema,
  discordLimits,
  embedTextLength,
  sessionUserSchema,
  snowflakeSchema,
} from "./index.js";
test("validates the public bot identity", () => {
  expect(
    botIdentitySchema.parse({ id: "123", name: "Example bot", avatarUrl: null })
      .name,
  ).toBe("Example bot");
  expect(() => botIdentitySchema.parse({ id: "", name: "" })).toThrow();
});
test("matches Discord's documented embed limits", () => {
  expect(discordLimits).toEqual({
    content: 2000,
    embedsPerMessage: 10,
    title: 256,
    description: 4096,
    fields: 25,
    fieldName: 256,
    fieldValue: 1024,
    footerText: 2048,
    authorName: 256,
    embedTotal: 6000,
  });
});
test("counts every text part of an embed towards the total", () => {
  expect(embedTextLength({})).toBe(0);
  expect(
    embedTextLength({
      title: "Patch",
      description: "Notes",
      fields: [{ name: "When", value: "Thu" }],
      footer: { text: "Team" },
      author: { name: "Dev" },
    }),
  ).toBe(5 + 5 + 4 + 3 + 4 + 3);
});
test("counts characters, not UTF-16 code units", () => {
  expect(embedTextLength({ title: "🏮" })).toBe(1);
});
test("accepts only Discord snowflakes as user IDs", () => {
  expect(snowflakeSchema.safeParse("123456789012345678").success).toBe(true);
  for (const id of [
    "",
    "1234",
    "12345678901234567890123",
    "12345678901234567a",
  ])
    expect(snowflakeSchema.safeParse(id).success).toBe(false);
});
test("describes the signed-in user", () => {
  const user = { id: "123456789012345678", name: "Ada", avatarUrl: null };
  expect(sessionUserSchema.parse(user)).toEqual(user);
  expect(sessionUserSchema.safeParse({ ...user, name: "" }).success).toBe(
    false,
  );
  expect(sessionUserSchema.safeParse({ ...user, id: "ada" }).success).toBe(
    false,
  );
});
