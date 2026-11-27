import { expect, test } from "vitest";
import { botIdentitySchema, discordLimits, embedTextLength } from "./index.js";
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
