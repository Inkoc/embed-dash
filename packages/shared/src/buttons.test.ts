import { expect, test } from "vitest";
import {
  buttonRowsSchema,
  completeButtonRows,
  discordLimits,
  importMessageJson,
  exportMessageJson,
  messageDraftSchema,
  validateMessage,
  type LinkButtonDraft,
} from "./index.js";
const button: LinkButtonDraft = {
  type: 2,
  style: 5,
  label: "Read more",
  url: "https://example.com",
};
const row = (change: Partial<LinkButtonDraft> = {}) => ({
  type: 1 as const,
  components: [{ ...button, ...change }],
});

test("accepts the full row and button budget and rejects excess and empty rows", () => {
  const full = Array.from({ length: discordLimits.buttonRows }, () => ({
    type: 1,
    components: Array.from(
      { length: discordLimits.buttonsPerRow },
      () => button,
    ),
  }));
  expect(buttonRowsSchema.safeParse(full).success).toBe(true);
  expect(buttonRowsSchema.safeParse([...full, row()]).success).toBe(false);
  expect(
    buttonRowsSchema.safeParse([
      { type: 1, components: [...full[0]!.components, button] },
    ]).success,
  ).toBe(false);
  expect(
    buttonRowsSchema.safeParse([{ type: 1, components: [] }]).success,
  ).toBe(false);
});

test("enforces label and URL lengths and requires HTTP(S)", () => {
  expect(
    buttonRowsSchema.safeParse([
      row({ label: "x".repeat(discordLimits.buttonLabel) }),
    ]).success,
  ).toBe(true);
  expect(
    buttonRowsSchema.safeParse([
      row({ label: "x".repeat(discordLimits.buttonLabel + 1) }),
    ]).success,
  ).toBe(false);
  const url = "https://example.com/".padEnd(discordLimits.buttonUrl, "x");
  expect(buttonRowsSchema.safeParse([row({ url })]).success).toBe(true);
  expect(buttonRowsSchema.safeParse([row({ url: url + "x" })]).success).toBe(
    false,
  );
  for (const url of [
    "",
    "relative",
    "ftp://example.com",
    "javascript:alert(1)",
    "attachment://a.png",
  ])
    expect(buttonRowsSchema.safeParse([row({ url })]).success).toBe(false);
  expect(
    buttonRowsSchema.safeParse([row({ url: "http://example.com" })]).success,
  ).toBe(true);
});

test("accepts Unicode and custom emoji, including emoji-only buttons", () => {
  for (const emoji of [
    { name: "🔗" },
    { name: "👩🏽‍💻" },
    { name: "🇭🇷" },
    { name: "1️⃣" },
    { name: "wave", id: "123456789012345678", animated: true },
  ])
    expect(
      buttonRowsSchema.safeParse([row({ label: "", emoji })]).success,
    ).toBe(true);
  for (const emoji of [
    { name: "" },
    { name: "hello" },
    { name: "🔗🔗" },
    { name: "🔗", id: "" },
    { name: "🔗", animated: true },
    { name: "wave", id: "bad" },
  ])
    expect(buttonRowsSchema.safeParse([row({ emoji })]).success).toBe(false);
  expect(buttonRowsSchema.safeParse([row({ label: "" })]).success).toBe(false);
});

test("shared validation identifies the exact button field and supports buttons-only messages", () => {
  const message = messageDraftSchema.parse({
    content: "",
    embeds: [],
    components: [row()],
  });
  expect(validateMessage(message)).toEqual([]);
  message.components![0]!.components[0]!.url = "invalid";
  expect(validateMessage(message)).toContainEqual(
    expect.objectContaining({ path: "components.0.components.0.url" }),
  );
});

test("round-trips link buttons and emoji through bare and community-builder JSON", () => {
  const components = [
    row({ emoji: { name: "wave", id: "123456789012345678", animated: true } }),
  ];
  const message = messageDraftSchema.parse({
    content: "Links",
    embeds: [],
    components,
  });
  const exported = exportMessageJson(message, new Date());
  expect(JSON.parse(exported.json).components).toEqual(components);
  for (const json of [
    exported.json,
    JSON.stringify({ messages: [{ data: JSON.parse(exported.json) }] }),
  ]) {
    const result = importMessageJson(json);
    expect(result).toMatchObject({ ok: true, message, notices: [] });
  }
  const unsupported = importMessageJson(
    JSON.stringify({
      content: "Links",
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, custom_id: "a", label: "Interactive" },
            button,
          ],
        },
        { type: 10, content: "V2" },
      ],
    }),
  );
  expect(unsupported).toMatchObject({
    ok: true,
    message: { components: [row()] },
  });
  if (unsupported.ok) expect(unsupported.notices).toHaveLength(2);
});

test("unfinished buttons and empty rows are omitted from portable messages", () => {
  expect(completeButtonRows([row({ url: "" }), row()])).toEqual([row()]);
  expect(completeButtonRows()).toEqual([]);
});

test("malformed link button fields refuse an import instead of being discarded as unsupported", () => {
  for (const change of [{ label: 7 }, { url: null }, { emoji: { name: 3 } }]) {
    const result = importMessageJson(
      JSON.stringify({
        content: "Links",
        components: [{ type: 1, components: [{ ...button, ...change }] }],
      }),
    );
    expect(result.ok).toBe(false);
  }
});
