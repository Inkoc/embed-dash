import { describe, expect, test } from "vitest";
import {
  attachmentName,
  botIdentitySchema,
  canPost,
  canSendTo,
  channelPermissions,
  countedLength,
  discordLimits,
  embedTextLength,
  emptyEmbed,
  guildsResponseSchema,
  inviteUrl,
  isAcceptedLink,
  deliveryErrors,
  mainChannelId,
  messageDraftSchema,
  messageLink,
  messagePayloadSchema,
  messageEmbedTextLength,
  sessionUserSchema,
  snowflakeSchema,
  sanitizeFilename,
  sendRequestSchema,
  sendResultSchema,
  uniqueFilename,
  uploadProblem,
  validateMessage,
  type AttachmentDraft,
  type EmbedDraft,
  type GuildChannel,
  type MessageDraft,
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

describe("counting", () => {
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

  test("leading and trailing whitespace is not counted", () => {
    expect(countedLength("  two words \n\n")).toBe(9);
    expect(embedTextLength({ title: "  Hi  ", description: "\n\n" })).toBe(2);
  });

  test("the total adds up every embed in the message", () => {
    expect(
      messageEmbedTextLength([
        { title: "abc" },
        { description: " de " },
        { fields: [{ name: "f", value: "g" }] },
      ]),
    ).toBe(3 + 2 + 2);
  });
});

describe("the draft schema", () => {
  const draft: MessageDraft = {
    content: "Hi",
    embeds: [{ ...emptyEmbed(), title: "One" }],
    attachments: [],
  };

  test("accepts a draft and rejects anything shaped differently", () => {
    expect(messageDraftSchema.parse(draft)).toEqual(draft);
    expect(messageDraftSchema.safeParse({ content: "Hi" }).success).toBe(false);
    // Drafts saved before attachments existed still load.
    expect(
      messageDraftSchema.parse({ content: "Hi", embeds: draft.embeds }),
    ).toEqual(draft);
    expect(
      messageDraftSchema.safeParse({
        content: "",
        embeds: [{ ...emptyEmbed(), timestamp: true }],
      }).success,
    ).toBe(false);
  });
});

const embed = (change: Partial<EmbedDraft> = {}): EmbedDraft => ({
  ...emptyEmbed(),
  title: "Title",
  ...change,
});
const file = (filename: string, size = 1000): AttachmentDraft => ({
  id: `id-${filename}`,
  filename,
  size,
  contentType: "image/png",
});
const issuesFor = (message: Partial<MessageDraft>) =>
  validateMessage({
    content: "",
    embeds: [embed()],
    attachments: [file("team.png"), file("thumb.png")],
    ...message,
  });
const paths = (message: Partial<MessageDraft>) =>
  issuesFor(message).map((issue) => issue.path);

describe("validation", () => {
  test("a complete message has no issues", () => {
    expect(
      issuesFor({
        content: "Hello",
        embeds: [
          embed({
            url: "https://example.com",
            description: "Body",
            author: {
              name: "Team",
              url: "http://example.com/team",
              iconUrl: "attachment://team.png",
            },
            fields: [{ name: "When", value: "Now", inline: true }],
            image: "https://example.com/a.png",
            thumbnail: "attachment://thumb.png",
            footer: { text: "Footer", iconUrl: "https://example.com/f.png" },
            timestamp: "now",
          }),
          embed({ timestamp: "2026-12-03T18:00:00.000Z" }),
        ],
      }),
    ).toEqual([]);
  });

  test.each<[string, Partial<MessageDraft>]>([
    ["content", { content: "x".repeat(2001) }],
    ["embeds.0.title", { embeds: [embed({ title: "x".repeat(257) })] }],
    [
      "embeds.0.description",
      { embeds: [embed({ description: "x".repeat(4097) })] },
    ],
    [
      "embeds.0.author.name",
      {
        embeds: [
          embed({ author: { name: "x".repeat(257), url: "", iconUrl: "" } }),
        ],
      },
    ],
    [
      "embeds.0.footer.text",
      { embeds: [embed({ footer: { text: "x".repeat(2049), iconUrl: "" } })] },
    ],
    [
      "embeds.0.fields.0.name",
      {
        embeds: [
          embed({
            fields: [{ name: "x".repeat(257), value: "v", inline: false }],
          }),
        ],
      },
    ],
    [
      "embeds.0.fields.0.value",
      {
        embeds: [
          embed({
            fields: [{ name: "n", value: "x".repeat(1025), inline: false }],
          }),
        ],
      },
    ],
  ])("%s over its limit is reported", (path, message) => {
    const issues = issuesFor(message);
    expect(issues.map((issue) => issue.path)).toEqual([path]);
    expect(issues[0]!.message).toMatch(/^1 character over the [\d,]+ limit\.$/);
  });

  test("each limit is inclusive", () => {
    expect(
      issuesFor({
        content: "x".repeat(2000),
        embeds: [
          embed({
            title: "x".repeat(256),
            fields: [
              { name: "x".repeat(256), value: "x".repeat(1024), inline: true },
            ],
            author: { name: "x".repeat(256), url: "", iconUrl: "" },
            footer: { text: "x".repeat(2048), iconUrl: "" },
          }),
        ],
      }),
    ).toEqual([]);
    expect(
      issuesFor({ embeds: [embed({ description: "x".repeat(4096) })] }),
    ).toEqual([]);
  });

  test("whitespace around embed text doesn't count towards its limit", () => {
    expect(
      paths({ embeds: [embed({ title: ` ${"x".repeat(256)}\n` })] }),
    ).toEqual([]);
  });

  test("the 6,000 total spans every embed", () => {
    const big = () => embed({ title: "", description: "x".repeat(2000) });
    expect(paths({ embeds: [big(), big(), big()] })).toEqual([]);
    const over = issuesFor({
      embeds: [big(), big(), big(), embed({ title: "xx" })],
    });
    expect(over).toEqual([
      {
        path: "embeds",
        label: "All embed text",
        message: "2 characters over the 6,000 limit for all embeds together.",
      },
    ]);
  });

  test("an embed needs something to show, and a message needs something to send", () => {
    expect(issuesFor({ embeds: [emptyEmbed()] })).toEqual([
      expect.objectContaining({ path: "embeds.0", label: "Embed 1" }),
    ]);
    expect(
      paths({ embeds: [embed({ title: "", image: "https://a.b/c.png" })] }),
    ).toEqual([]);
    expect(paths({ embeds: [] })).toEqual(["content"]);
    expect(paths({ content: "Just text", embeds: [] })).toEqual([]);
  });

  test("fields need a name and a value", () => {
    const issues = issuesFor({
      embeds: [
        embed({
          fields: [
            { name: "ok", value: "ok", inline: true },
            { name: " ", value: "", inline: true },
          ],
        }),
      ],
    });
    expect(issues.map((issue) => [issue.path, issue.label])).toEqual([
      ["embeds.0.fields.1.name", "Embed 1, field 2 name"],
      ["embeds.0.fields.1.value", "Embed 1, field 2 value"],
    ]);
  });

  test("links must use a scheme Discord accepts", () => {
    expect(paths({ embeds: [embed({ url: "attachment://a.png" })] })).toEqual([
      "embeds.0.url",
    ]);
    expect(paths({ embeds: [embed({ url: "example.com" })] })).toEqual([
      "embeds.0.url",
    ]);
    expect(paths({ embeds: [embed({ image: "ftp://a.b/c.png" })] })).toEqual([
      "embeds.0.image",
    ]);
    expect(
      issuesFor({ embeds: [embed({ thumbnail: "javascript:alert(1)" })] })[0]!
        .message,
    ).toContain("not javascript:");
    expect(
      paths({
        embeds: [
          embed({
            author: { name: "A", url: "ftp://x.y", iconUrl: "nope" },
            footer: { text: "F", iconUrl: "data:x" },
          }),
        ],
      }),
    ).toEqual([
      "embeds.0.author.url",
      "embeds.0.author.iconUrl",
      "embeds.0.footer.iconUrl",
    ]);
  });

  test("attachment links must name one file", () => {
    for (const image of [
      "attachment:foo",
      "attachment://",
      "attachment:///foo",
      "attachment://a/b.png",
      "attachment://my banner.png",
      "attachment://..",
    ])
      expect(paths({ embeds: [embed({ image })] }), image).toEqual([
        "embeds.0.image",
      ]);
    expect(
      paths({
        embeds: [embed({ image: "attachment://My_banner-2.png" })],
        attachments: [file("My_banner-2.png")],
      }),
    ).toEqual([]);
    expect(isAcceptedLink("attachment://a.png", true)).toBe(true);
    expect(isAcceptedLink("attachment://a.png", false)).toBe(false);
    expect(isAcceptedLink("", false)).toBe(true);
  });

  test("author and footer extras need their text", () => {
    expect(
      paths({
        embeds: [
          embed({
            author: { name: "", url: "https://a.b", iconUrl: "" },
            footer: { text: "", iconUrl: "https://a.b/i.png" },
          }),
        ],
      }),
    ).toEqual(["embeds.0.author.name", "embeds.0.footer.text"]);
  });

  test("colour and time must be readable", () => {
    expect(paths({ embeds: [embed({ color: "#12345" })] })).toEqual([
      "embeds.0.color",
    ]);
    expect(paths({ embeds: [embed({ timestamp: "soon" })] })).toEqual([
      "embeds.0.timestamp",
    ]);
  });

  test("counts of embeds and fields are capped", () => {
    expect(
      paths({ embeds: Array.from({ length: 11 }, () => embed()) }),
    ).toEqual(["embeds"]);
    const fields = Array.from({ length: 26 }, () => ({
      name: "n",
      value: "v",
      inline: true,
    }));
    expect(paths({ embeds: [embed({ fields })] })).toEqual(["embeds.0.fields"]);
  });
});

describe("attachments", () => {
  test("a link to a file that isn't attached is reported", () => {
    expect(
      paths({
        embeds: [embed({ thumbnail: "attachment://gone.png" })],
        attachments: [],
      }),
    ).toEqual(["embeds.0.thumbnail"]);
  });

  test("count, total size and duplicate names are capped", () => {
    const many = Array.from({ length: 11 }, (_, i) => file(`f${i}.txt`));
    expect(paths({ attachments: many })).toEqual(["attachments"]);
    expect(
      paths({
        attachments: [file("a.bin", 20 * 2 ** 20), file("b.bin", 6 * 2 ** 20)],
      }),
    ).toEqual(["attachments"]);
    expect(paths({ attachments: [file("a.png"), file("a.png")] })).toEqual([
      "attachments.1",
    ]);
  });
});

describe("filenames", () => {
  test.each([
    ["photo.png", "photo.png"],
    ["my banner (1).png", "my_banner_1_.png"],
    ["Café déjà vu.JPG", "Cafe_deja_vu.JPG"],
    ["../../etc/passwd", "passwd"],
    ["C:\\Users\\me\\a b.gif", "a_b.gif"],
    [".hidden", "hidden"],
    ["...", "file"],
    ["日本語.png", "_.png"],
    ["", "file"],
  ])("%s becomes %s", (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
    expect(
      isAcceptedLink(`attachment://${sanitizeFilename(input)}`, true),
    ).toBe(true);
  });

  test("a long name keeps its extension", () => {
    const name = sanitizeFilename(`${"a".repeat(300)}.png`);
    expect(name).toHaveLength(100);
    expect(name.endsWith(".png")).toBe(true);
  });

  test("taken names get a numbered suffix before the extension", () => {
    expect(uniqueFilename("a.png", ["b.png"])).toBe("a.png");
    expect(uniqueFilename("a.png", ["a.png", "a-2.png"])).toBe("a-3.png");
    expect(uniqueFilename("notes", ["notes"])).toBe("notes-2");
  });

  test("a numbered suffix never pushes a long name past what the server keeps", () => {
    const long = sanitizeFilename(`${"a".repeat(300)}.png`);
    const second = uniqueFilename(long, [long]);
    expect(second).toHaveLength(100);
    expect(second.endsWith("-2.png")).toBe(true);
    // Shortened again by the server it stays what it was, so it can't collide with the first.
    expect(sanitizeFilename(second)).toBe(second);
    expect(second).not.toBe(long);
    expect(uniqueFilename(long, [long, second])).toMatch(/-3\.png$/);
  });

  test("attachmentName reads only attachment links", () => {
    expect(attachmentName(" attachment://a.png ")).toBe("a.png");
    expect(attachmentName("https://a.b/a.png")).toBeNull();
    expect(attachmentName("attachment://a b")).toBeNull();
  });
});

describe("upload limits", () => {
  const mb = 1024 * 1024;
  const limit = 10 * mb;
  test("an empty or oversize file is refused with its name and the limit", () => {
    expect(uploadProblem({ name: "a.txt", size: 0 }, [], limit)).toContain(
      "empty",
    );
    expect(
      uploadProblem({ name: "a.mp4", size: 11 * mb }, [], limit),
    ).toContain("at most 10 MB");
    expect(uploadProblem({ name: "a.mp4", size: limit }, [], limit)).toBeNull();
  });

  test("the message total and file count are checked together", () => {
    const attached = [{ size: 10 * mb }, { size: 10 * mb }];
    expect(
      uploadProblem({ name: "c.bin", size: 6 * mb }, attached, limit),
    ).toContain("25 MB");
    expect(
      uploadProblem({ name: "c.bin", size: 5 * mb }, attached, limit),
    ).toBeNull();
    const ten = Array.from({ length: 10 }, () => ({ size: 1 }));
    expect(uploadProblem({ name: "c", size: 1 }, ten, limit)).toContain("10");
  });
});

test("names the permissions to check and builds an invite with them", () => {
  expect(channelPermissions.map((p) => p.label)).toEqual([
    "View Channel",
    "Send Messages",
    "Embed Links",
    "Attach Files",
  ]);
  // 1024 + 2048 + 16384 + 32768
  expect(inviteUrl("42")).toBe(
    "https://discord.com/oauth2/authorize?client_id=42&scope=bot&permissions=52224",
  );
});

test("Attach Files alone doesn't stop the bot posting", () => {
  expect(canPost({ missing: [] })).toBe(true);
  expect(canPost({ missing: ["attachFiles"] })).toBe(true);
  expect(canPost({ missing: ["embedLinks"] })).toBe(false);
});

test("the main channel is the system channel, then announcements, then text", () => {
  const ch = (
    id: string,
    kind: GuildChannel["kind"],
    missing: GuildChannel["missing"] = [],
  ): GuildChannel => ({ id, name: id, kind, missing });
  const channels = [
    ch("forum", "forum"),
    ch("text", "text"),
    ch("news", "announcement"),
    ch("system", "text"),
  ];
  expect(mainChannelId(channels, "system")).toBe("system");
  expect(mainChannelId(channels, null)).toBe("news");
  expect(
    mainChannelId(
      [ch("news", "announcement", ["sendMessages"]), ...channels.slice(0, 2)],
      "gone",
    ),
  ).toBe("text");
  expect(mainChannelId([ch("system", "text", ["viewChannel"])], "system")).toBe(
    null,
  );
});

test("parses the guild list the server returns", () => {
  expect(
    guildsResponseSchema.parse({
      guilds: [
        {
          id: "1",
          name: "Lanternfall",
          iconUrl: null,
          mainChannelId: null,
          channels: [{ id: "2", name: "news", kind: "forum", missing: [] }],
        },
      ],
      unavailable: [],
      fetchedAt: "2026-11-27T10:00:00.000Z",
    }).guilds[0].channels[0].kind,
  ).toBe("forum");
});

describe("sending", () => {
  const file = (id: string, filename: string): AttachmentDraft => ({
    id,
    filename,
    size: 10,
    contentType: "image/png",
  });

  test("forum channels can't be sent to, whatever the permissions", () => {
    expect(canSendTo({ kind: "text", missing: [] })).toBe(true);
    expect(canSendTo({ kind: "announcement", missing: ["attachFiles"] })).toBe(
      true,
    );
    expect(canSendTo({ kind: "text", missing: ["sendMessages"] })).toBe(false);
    expect(canSendTo({ kind: "forum", missing: [] })).toBe(false);
  });

  test("a payload defaults to no pings and a normal notification", () => {
    const payload = messagePayloadSchema.parse({ content: "Hi", embeds: [] });
    expect(payload).toEqual({
      content: "Hi",
      embeds: [],
      attachments: [],
      pings: [],
      silent: false,
    });
    expect(
      messagePayloadSchema.safeParse({ ...payload, pings: ["users", "users"] })
        .success,
    ).toBe(false);
    expect(
      messagePayloadSchema.safeParse({ ...payload, pings: ["bots"] }).success,
    ).toBe(false);
  });

  test("a send names its channels once each and carries the browser's id", () => {
    const base = {
      id: "6f1c1e1e-6d5e-4b8e-8f7a-0b6d2f4f9a11",
      payload: { content: "Hi", embeds: [] },
    };
    const accepts = (change: object) =>
      sendRequestSchema.safeParse({
        ...base,
        channelIds: ["1", "2"],
        ...change,
      }).success;
    expect(accepts({})).toBe(true);
    expect(accepts({ channelIds: [] })).toBe(false);
    expect(accepts({ channelIds: ["1", "1"] })).toBe(false);
    expect(accepts({ id: "send-1" })).toBe(false);
  });

  test("results only carry codes that have a readable reason", () => {
    for (const message of Object.values(deliveryErrors))
      expect(message).toMatch(/\.$/);
    const target = {
      id: "t",
      guildId: "g",
      guildName: "Server",
      channelId: "c",
      channelName: "news",
      status: "failed",
      messageId: null,
      error: { code: "CHANNEL_GONE", message: deliveryErrors.CHANNEL_GONE },
    };
    expect(
      sendResultSchema.safeParse({
        id: "s",
        status: "partial",
        targets: [target],
      }).success,
    ).toBe(true);
    expect(
      sendResultSchema.safeParse({
        id: "s",
        status: "partial",
        targets: [{ ...target, error: { code: "OTHER", message: "x" } }],
      }).success,
    ).toBe(false);
  });

  test("links to a sent message in Discord", () => {
    expect(messageLink({ guildId: "1", channelId: "2", messageId: "3" })).toBe(
      "https://discord.com/channels/1/2/3",
    );
  });

  test("files the server lost are reported on the file and on every image that uses it", () => {
    const message: MessageDraft = {
      content: "",
      attachments: [file("a", "banner.png"), file("b", "kept.png")],
      embeds: [
        {
          ...emptyEmbed(),
          title: "T",
          image: "attachment://banner.png",
          footer: { text: "f", iconUrl: "attachment://kept.png" },
        },
      ],
    };
    expect(validateMessage(message)).toEqual([]);
    expect(
      validateMessage(message, { missingFiles: new Set(["a"]) }).map(
        (issue) => issue.path,
      ),
    ).toEqual(["attachments.0", "embeds.0.image"]);
  });

  test("a duplicate name says which file to remove", () => {
    const issues = validateMessage({
      content: "Hi",
      embeds: [],
      attachments: [file("a", "x.png"), { ...file("b", "x.png"), size: 2048 }],
    });
    expect(issues).toEqual([
      expect.objectContaining({
        path: "attachments.1",
        message: expect.stringContaining("Remove this 2 KB one"),
      }),
    ]);
  });
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
