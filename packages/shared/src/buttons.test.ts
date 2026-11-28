import { expect, test } from "vitest";
import {
  completeButtonRows,
  discordLimits,
  importMessageJson,
  exportMessageJson,
  messageDraftSchema,
  validateMessage,
  type LinkButtonDraft,
} from "./index.js";
const acceptsRows = (components: unknown) => {
  const parsed = messageDraftSchema.safeParse({
    content: "Links",
    embeds: [],
    components,
  });
  return {
    success: parsed.success && validateMessage(parsed.data).length === 0,
  };
};
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
  expect(acceptsRows(full).success).toBe(true);
  expect(acceptsRows([...full, row()]).success).toBe(false);
  expect(
    acceptsRows([{ type: 1, components: [...full[0]!.components, button] }])
      .success,
  ).toBe(false);
  expect(acceptsRows([{ type: 1, components: [] }]).success).toBe(false);
});

test("enforces label and URL lengths and requires HTTP(S)", () => {
  expect(
    acceptsRows([row({ label: "x".repeat(discordLimits.buttonLabel) })])
      .success,
  ).toBe(true);
  expect(
    acceptsRows([row({ label: "x".repeat(discordLimits.buttonLabel + 1) })])
      .success,
  ).toBe(false);
  const url = "https://example.com/".padEnd(discordLimits.buttonUrl, "x");
  expect(acceptsRows([row({ url })]).success).toBe(true);
  expect(acceptsRows([row({ url: url + "x" })]).success).toBe(false);
  for (const url of [
    "",
    "relative",
    "ftp://example.com",
    "javascript:alert(1)",
    "attachment://a.png",
  ])
    expect(acceptsRows([row({ url })]).success).toBe(false);
  expect(acceptsRows([row({ url: "http://example.com" })]).success).toBe(true);
});

test("accepts Unicode and custom emoji, including emoji-only buttons", () => {
  for (const emoji of [
    { name: "🔗" },
    { name: "👩🏽‍💻" },
    { name: "🇭🇷" },
    { name: "1️⃣" },
    { name: "wave", id: "123456789012345678", animated: true },
  ])
    expect(acceptsRows([row({ label: "", emoji })]).success).toBe(true);
  for (const emoji of [
    { name: "" },
    { name: "hello" },
    { name: "🔗🔗" },
    { name: "🔗", id: "" },
    { name: "🔗", animated: true },
    { name: "wave", id: "bad" },
  ])
    expect(acceptsRows([row({ emoji })]).success).toBe(false);
  expect(acceptsRows([row({ label: "" })]).success).toBe(false);
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
    expect.objectContaining({
      path: "components.0.components.0.url",
      label: "Row 1, button 1: Link",
    }),
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

test("button validation counts trimmed labels and links and rejects remaining URL whitespace", () => {
  expect(
    acceptsRows([
      row({
        label: `  ${"x".repeat(discordLimits.buttonLabel)}  `,
        url: `  ${"https://example.com/".padEnd(discordLimits.buttonUrl, "x")}  `,
      }),
    ]).success,
  ).toBe(true);
  expect(acceptsRows([row({ label: " \t " })]).success).toBe(false);
  expect(
    acceptsRows([row({ label: " \t ", emoji: { name: "🔗" } })]).success,
  ).toBe(true);
  for (const url of [
    "https://example.com/a b",
    "https://example.com/a\nb",
    "https://exa\tmple.com",
    "https://example.com/a\u00a0b",
  ])
    expect(acceptsRows([row({ url })]).success).toBe(false);
  expect(acceptsRows([row({ url: "https://example.com/a%20b" })]).success).toBe(
    true,
  );
});

test("exports trimmed buttons, omits whitespace-only labels with emoji and drops unfinished buttons", () => {
  const message = messageDraftSchema.parse({
    content: "Links",
    embeds: [],
    components: [
      row({ label: "  Guide  ", url: "  https://example.com/guide  " }),
      row({ label: "   ", emoji: { name: "🔗" } }),
      row({ url: "" }),
      row({ url: "https://example.com/a b" }),
      row({ label: "   " }),
    ],
  });
  expect(
    JSON.parse(exportMessageJson(message, new Date()).json).components,
  ).toEqual([
    row({ label: "Guide", url: "https://example.com/guide" }),
    {
      type: 1,
      components: [
        { type: 2, style: 5, url: button.url, emoji: { name: "🔗" } },
      ],
    },
  ]);
});

test("imports missing optional button values and reports row metadata", () => {
  const result = importMessageJson(
    JSON.stringify({
      content: "Links",
      components: [
        {
          ...row({ emoji: { name: "🔗" } }),
          id: 12,
          components: [{ ...button, label: null, emoji: { name: "🔗" } }],
        },
        { ...row(), components: [{ ...button, emoji: null }] },
      ],
    }),
  );
  expect(result).toMatchObject({
    ok: true,
    message: { components: [row({ label: "", emoji: { name: "🔗" } }), row()] },
    notices: ["Unsupported field: components[0].id."],
  });
});
