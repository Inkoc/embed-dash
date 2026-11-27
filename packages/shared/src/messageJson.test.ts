import { expect, test } from "vitest";
import {
  discordLimits,
  emptyEmbed,
  exportMessageJson,
  importMessageJson,
  type MessageDraft,
} from "./index.js";

const fixture = {
  content: "Community update",
  embeds: [
    {
      title: "Open evening",
      description: "Bring a friend.",
      color: 0x123456,
      url: "https://example.com",
      timestamp: "2026-11-27T18:00:00Z",
      author: {
        name: "Hosts",
        url: "https://example.com",
        icon_url: "https://example.com/a.png",
      },
      footer: { text: "Doors at six", icon_url: "https://example.com/f.png" },
      image: { url: "https://example.com/image.png" },
      thumbnail: { url: "https://example.com/thumb.png" },
      fields: [
        { name: "Where", value: "Town hall", inline: true },
        { name: "Entry", value: "Free" },
      ],
    },
  ],
};
test("bare and wrapped external objects load supported fields and defaults", () => {
  for (const input of [fixture, { messages: [{ data: fixture }] }]) {
    const result = importMessageJson(JSON.stringify(input));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notices).toEqual([]);
    expect(result.message.embeds[0]).toMatchObject({
      color: "#123456",
      author: { iconUrl: "https://example.com/a.png" },
      fields: [{ inline: true }, { inline: false }],
    });
    expect(
      importMessageJson(
        exportMessageJson(result.message, new Date("2026-11-27T18:00:00Z"))
          .json,
      ),
    ).toEqual(result);
  }
});
test("multiple messages use the first and report ignored metadata and buttons", () => {
  const result = importMessageJson(
    JSON.stringify({
      version: 1,
      messages: [
        {
          data: {
            content: "First",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Visit",
                    url: "https://example.com",
                  },
                ],
              },
            ],
            embeds: [
              {
                title: "Welcome",
                image: { url: "https://example.com/i.png", width: 100 },
                provider: { name: "Site" },
              },
            ],
          },
          webhook: "ignored",
        },
        { data: { content: "Second" } },
      ],
    }),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.message.content).toBe("First");
  expect(result.notices.join(" ")).toContain("components");
  expect(result.notices.join(" ")).toContain("embeds[0].image.width");
  expect(result.notices.join(" ")).toContain("provider");
  expect(result.notices.join(" ")).toContain("webhook");
  expect(result.notices.join(" ")).toContain("version");
  expect(result.notices.join(" ")).toContain("first of 2");
});
test.each([
  ["{", "Invalid JSON"],
  ["null", "Message"],
  ["[]", "Message"],
  ['{"content":5}', "Message text"],
  ['{"messages":[]}', "Message list"],
  ['{"messages":[{}]}', "data"],
  ['{"embeds":[{"color":"#fff"}]}', "colour"],
  ['{"embeds":[{"color":16777216}]}', "colour"],
  ['{"embeds":[{"timestamp":"now"}]}', "time"],
  ['{"embeds":[{"fields":[{"name":"x"}]}]}', "value"],
  [JSON.stringify({ content: "x".repeat(discordLimits.content + 1) }), "2,000"],
  [
    JSON.stringify({
      embeds: Array.from(
        { length: discordLimits.embedsPerMessage + 1 },
        () => ({ title: "a" }),
      ),
    }),
    "at most",
  ],
  [
    JSON.stringify({
      embeds: [{ description: "x".repeat(discordLimits.description + 1) }],
    }),
    "4,096",
  ],
  [
    JSON.stringify({
      embeds: [{ title: "x".repeat(discordLimits.title + 1) }],
    }),
    "256",
  ],
  [
    JSON.stringify({
      embeds: [{ title: "a", image: { url: "javascript:alert(1)" } }],
    }),
    "images",
  ],
  [
    JSON.stringify({ embeds: [{ image: { url: "attachment://lost.png" } }] }),
    "No attached file",
  ],
  ['{"embeds":[{}]}', "empty"],
  ["{}", "Add message"],
])("rejects invalid input %s with a specific error", (input, expected) => {
  const result = importMessageJson(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(expected);
});
test("content-only objects and minimally populated embeds get composer defaults", () => {
  expect(importMessageJson('{"content":"Hello"}')).toEqual({
    ok: true,
    message: { content: "Hello", embeds: [], attachments: [] },
    notices: [],
  });
  const result = importMessageJson('{"embeds":[{"title":"Hello"}]}');
  expect(result.ok && result.message.embeds[0]).toEqual({
    ...emptyEmbed(),
    title: "Hello",
  });
});
test("exports only portable fields, omits uploads and resolves dynamic time without mutation", () => {
  const draft: MessageDraft = {
    content: "Hello",
    embeds: [
      {
        ...emptyEmbed(),
        title: "Welcome",
        image: "attachment://photo.png",
        thumbnail: "/api/uploads/private/content",
        timestamp: "now",
        author: { name: "Hosts", url: "", iconUrl: "attachment://photo.png" },
        footer: { text: "Info", iconUrl: "attachment://photo.png" },
      },
    ],
    attachments: [
      {
        id: "private",
        filename: "photo.png",
        size: 2,
        contentType: "image/png",
      },
    ],
  };
  const before = structuredClone(draft);
  const result = exportMessageJson(draft, new Date("2026-11-27T18:00:00Z"));
  expect(result.json).not.toMatch(/private|attachment:|photo.png|contentType/);
  expect(result.json).toContain("2026-11-27T18:00:00.000Z");
  expect(result.notices).toHaveLength(6);
  expect(draft).toEqual(before);
  expect(importMessageJson(result.json).ok).toBe(true);
});

test.each([
  {
    content: null,
    embeds: [{ title: "Evening programme", color: null }],
    attachments: [],
  },
  { content: "Doors open", embeds: null, attachments: [] },
])(
  "imports nullable community-builder message fields without empty-value notices",
  (data) => {
    const result = importMessageJson(JSON.stringify({ messages: [{ data }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notices).toEqual([]);
    expect(result.message.content).toBe(data.content ?? "");
    expect(result.message.embeds).toEqual(
      data.embeds ? [{ ...emptyEmbed(), title: "Evening programme" }] : [],
    );
  },
);

test("ignores null and empty-array unsupported values and limits nonempty notices", () => {
  const data = {
    content: "Hello",
    ignored: null,
    attachments: [],
    ...Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [`extra${i}`, true]),
    ),
  };
  const result = importMessageJson(JSON.stringify(data));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.notices).toHaveLength(21);
  expect(result.notices[0]).toBe("Unsupported field: extra0.");
  expect(result.notices[19]).toBe("Unsupported field: extra19.");
  expect(result.notices[20]).toBe("And 5 more unsupported fields.");
  const multiple = importMessageJson(
    JSON.stringify({ messages: [{ data }, { data: { content: "Second" } }] }),
  );
  expect(multiple.ok && multiple.notices.at(-1)).toBe(
    "Imported the first of 2 messages. Remaining messages were not loaded.",
  );
});

test.each(["#12", "#zz", "123456", "#1234567", ""])(
  "omits invalid export colour %s with a notice",
  (color) => {
    const result = exportMessageJson(
      {
        content: "",
        attachments: [],
        embeds: [{ ...emptyEmbed(), title: "Hello", color }],
      },
      new Date("2026-11-27T18:00:00Z"),
    );
    expect(JSON.parse(result.json).embeds[0]).not.toHaveProperty("color");
    expect(result.notices).toEqual([
      "Embed 1 side colour was omitted because it is not a six-digit hex colour.",
    ]);
    expect(importMessageJson(result.json).ok).toBe(true);
  },
);

test.each([
  [{ content: 1 }, "Message text must be text."],
  [{ embeds: [{ title: 12 }] }, "Embed 1 title must be text."],
  [
    { embeds: [{ fields: [{ name: "Place", value: false }] }] },
    "Embed 1 field 1 value must be text.",
  ],
  [{ embeds: [{ author: { name: 1 } }] }, "Embed 1 author name must be text."],
  [
    { embeds: [{ image: "https://example.com" }] },
    "Embed 1 image must be an object.",
  ],
  [
    { embeds: [{ timestamp: "tomorrow" }] },
    "Embed 1 time must be an ISO 8601 date and time, such as 2026-11-27T18:00:00Z.",
  ],
  [{ embeds: "wrong" }, "Embeds must be a list."],
  [{ messages: [] }, "Message list must contain at least one message."],
  [{ messages: [{}] }, "First message data must be an object."],
])("maps schema failures to composer terms", (data, expected) => {
  const result = importMessageJson(JSON.stringify(data));
  expect(result).toEqual({ ok: false, error: expected });
  if (!("messages" in data))
    expect(importMessageJson(JSON.stringify({ messages: [{ data }] }))).toEqual(
      result,
    );
});
