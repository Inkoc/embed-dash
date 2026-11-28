import { describe, expect, test } from "vitest";
import { embedTime } from "../preview/DiscordPreview";
import {
  addEmbed,
  addedEmbed,
  addField,
  blankDraft,
  isBlank,
  toMessage,
  updateEmbed,
  written,
  copyOf,
  duplicateEmbed,
  locate,
  moveEmbed,
  moveField,
  removeEmbed,
  removeField,
  updateField,
  withIds,
  type Draft,
} from "./draft";
import { normaliseHex, partSummaries } from "./EmbedEditor";
import {
  applyEdit,
  codeBlock,
  insertSnippet,
  isSnowflake,
  link,
  mention,
  timestamp,
  toggleLinePrefix,
  toggleWrap,
  type Edit,
} from "./markdown";

/** Applies an edit and marks the selection afterwards with [ and ]. */
function run(text: string, edit: (text: string) => Edit) {
  const result = edit(text);
  const next = applyEdit(text, result);
  return (
    next.slice(0, result.selectionStart) +
    "[" +
    next.slice(result.selectionStart, result.selectionEnd) +
    "]" +
    next.slice(result.selectionEnd)
  );
}

describe("formatting commands", () => {
  test("wrap the selection, or a selected placeholder when nothing is selected", () => {
    expect(run("say hi", (t) => toggleWrap(t, 4, 6, "**", "bold text"))).toBe(
      "say **[hi]**",
    );
    expect(run("", (t) => toggleWrap(t, 0, 0, "||", "spoiler"))).toBe(
      "||[spoiler]||",
    );
  });

  test("unwrap text that is already wrapped, inside or around the selection", () => {
    expect(run("**hi**", (t) => toggleWrap(t, 2, 4, "**", "x"))).toBe("[hi]");
    expect(run("**hi**", (t) => toggleWrap(t, 0, 6, "**", "x"))).toBe("[hi]");
    expect(run("~~gone~~", (t) => toggleWrap(t, 2, 6, "~~", "x"))).toBe(
      "[gone]",
    );
  });

  test("italic and bold combine instead of eating each other's stars", () => {
    expect(run("**hi**", (t) => toggleWrap(t, 2, 4, "*", "x"))).toBe(
      "***[hi]***",
    );
    expect(run("***hi***", (t) => toggleWrap(t, 3, 5, "*", "x"))).toBe(
      "**[hi]**",
    );
    expect(run("***hi***", (t) => toggleWrap(t, 3, 5, "**", "x"))).toBe(
      "*[hi]*",
    );
    expect(run("**hi**", (t) => toggleWrap(t, 0, 6, "*", "x"))).toBe(
      "*[**hi**]*",
    );
  });

  test("line prefixes cover every selected line and toggle off", () => {
    expect(run("one\ntwo\nthree", (t) => toggleLinePrefix(t, 1, 5, "> "))).toBe(
      "[> one\n> two]\nthree",
    );
    expect(run("> one\n> two", (t) => toggleLinePrefix(t, 0, 11, "> "))).toBe(
      "[one\ntwo]",
    );
    expect(run("## Old", (t) => toggleLinePrefix(t, 3, 3, "# "))).toBe(
      "# Old[]",
    );
    expect(run("a\n\nb", (t) => toggleLinePrefix(t, 0, 4, "- "))).toBe(
      "[- a\n\n- b]",
    );
    expect(run("a\nb", (t) => toggleLinePrefix(t, 0, 2, "- "))).toBe(
      "[- a]\nb",
    );
  });

  test("code blocks sit on lines of their own", () => {
    expect(run("say hi now", (t) => codeBlock(t, 4, 6))).toBe(
      "say \n```\n[hi]\n```\n now",
    );
    expect(run("", (t) => codeBlock(t, 0, 0))).toBe("```\n[]\n```");
  });

  test("a fenced selection, or one just inside fences, is unfenced", () => {
    const once = "say \n```\nhi\n```\n now";
    expect(run(once, (t) => codeBlock(t, 9, 11))).toBe("say \n[hi]\n now");
    expect(run(once, (t) => codeBlock(t, 5, 15))).toBe("say \n[hi]\n now");
    expect(run("```js\nx\n```", (t) => codeBlock(t, 0, 12))).toBe("[x]");
    expect(run("```\n\n```", (t) => codeBlock(t, 4, 4))).toBe("[]");
    // Text after a closed block isn't inside it.
    expect(run("```\na\n```\nb\n```", (t) => codeBlock(t, 10, 11))).toBe(
      "```\na\n```\n```\n[b]\n```\n```",
    );
  });

  test("links select whatever is still to be typed", () => {
    expect(run("docs", (t) => link(t, 0, 4))).toBe("[docs]([https://])");
    expect(run("https://a.b", (t) => link(t, 0, 11))).toBe(
      "[[link text]](https://a.b)",
    );
  });

  test("mentions and timestamps are inserted as Discord writes them", () => {
    expect(mention("user", "1")).toBe("<@1>");
    expect(mention("role", "1")).toBe("<@&1>");
    expect(mention("channel", "1")).toBe("<#1>");
    expect(timestamp(new Date(1_700_000_000_500), "R")).toBe(
      "<t:1700000000:R>",
    );
    expect(run("hi x", () => insertSnippet(3, 4, "<@1>"))).toBe("hi <@1>[]");
    expect(isSnowflake("110349001187655271")).toBe(true);
    expect(isSnowflake("12345")).toBe(false);
  });
});

const sample = (): Draft =>
  withIds({
    content: "",
    attachments: [],
    embeds: ["A", "B", "C"].map((title) => ({
      ...blankDraft().embeds[0]!,
      title,
      fields: [
        { name: "1", value: "v", inline: true },
        { name: "2", value: "v", inline: false },
      ],
    })),
  });
const titles = (draft: Draft) =>
  draft.embeds.map((embed) => embed.title).join("");

describe("draft edits", () => {
  test("embeds are added, duplicated, moved and removed", () => {
    const draft = sample();
    const [a, b, c] = draft.embeds;
    expect(titles(moveEmbed(draft, a!.id, 1))).toBe("BAC");
    expect(titles(moveEmbed(draft, c!.id, -1))).toBe("ACB");
    expect(titles(moveEmbed(draft, a!.id, -1))).toBe("ABC");
    expect(titles(removeEmbed(draft, b!.id))).toBe("AC");
    expect(titles(addEmbed(draft))).toBe("ABC");
    expect(addEmbed(draft).embeds).toHaveLength(4);
    const copy = copyOf(b!);
    const duplicated = duplicateEmbed(draft, b!.id, copy);
    expect(titles(duplicated)).toBe("ABBC");
    expect(copy.id).not.toBe(b!.id);
    expect(copy.fields[0]!.id).not.toBe(b!.fields[0]!.id);
  });

  test("fields are added, edited, moved and removed within their embed", () => {
    const draft = sample();
    const embed = draft.embeds[1]!;
    const [one, two] = embed.fields;
    const names = (d: Draft) => d.embeds[1]!.fields.map((f) => f.name).join("");
    expect(names(moveField(draft, embed.id, one!.id, 1))).toBe("21");
    expect(names(removeField(draft, embed.id, two!.id))).toBe("1");
    expect(
      names(
        addField(draft, embed.id, {
          id: "n",
          name: "3",
          value: "",
          inline: true,
        }),
      ),
    ).toBe("123");
    expect(names(updateField(draft, embed.id, one!.id, { name: "x" }))).toBe(
      "x2",
    );
    expect(names(draft)).toBe("12");
    expect(draft.embeds[0]!.fields.map((f) => f.name).join("")).toBe("12");
  });

  test("an issue's path leads to its control and the rows hiding it", () => {
    const draft = sample();
    const [a, b] = draft.embeds;
    const field = b!.fields[1]!;
    expect(locate(draft, "content")).toEqual({
      id: "in-content",
      open: [],
      unfold: [],
    });
    expect(locate(draft, "embeds").id).toBe("compose-budget");
    expect(locate(draft, "embeds.0")).toEqual({
      id: `${a!.id}-head`,
      open: [],
      unfold: [`${a!.id}:folded`],
    });
    expect(locate(draft, "embeds.1.fields.1.value")).toEqual({
      id: `${field.id}-value`,
      open: [field.id],
      unfold: [`${b!.id}:folded`],
    });
    expect(locate(draft, "embeds.1.fields").id).toBe(`${b!.id}-fields`);
    expect(locate(draft, "embeds.0.author.iconUrl")).toMatchObject({
      id: `${a!.id}-author-iconUrl`,
      open: [`${a!.id}:author`],
    });
    expect(locate(draft, "embeds.0.thumbnail").open).toEqual([
      `${a!.id}:images`,
    ]);
    expect(locate(draft, "embeds.0.footer.text").open).toEqual([
      `${a!.id}:footer`,
    ]);
    expect(locate(draft, "embeds.0.timestamp").id).toBe(`${a!.id}-time`);
    expect(locate(draft, "embeds.0.url").open).toEqual([`${a!.id}:url`]);
    expect(locate(draft, "embeds.0.color").id).toBe(`${a!.id}-hex`);
    expect(locate(draft, "embeds.0.title").id).toBe(`${a!.id}-title`);
  });
});

describe("embed details", () => {
  test("hex colours are tidied the way people paste them", () => {
    expect(normaliseHex("0D9488")).toBe("#0d9488");
    expect(normaliseHex(" #09A ")).toBe("#0099aa");
    expect(normaliseHex("#nope")).toBe("#nope");
  });

  test("closed parts summarise what they hold", () => {
    const embed = blankDraft().embeds[0]!;
    expect(partSummaries(embed).author).toMatch(/^Not used/);
    expect(
      partSummaries({
        ...embed,
        author: { name: "Team", url: "https://a.b", iconUrl: "https://a.b/i" },
        image: "https://a.b/i.png",
        thumbnail: "https://a.b/t.png",
        footer: { text: "Notes", iconUrl: "" },
        timestamp: "now",
      }),
    ).toEqual({
      author: "Team, linked, with icon",
      images: "Large image and thumbnail set",
      footer: "Notes · time of sending",
    });
    expect(partSummaries({ ...embed, image: "x" }).images).toBe(
      "Large image set",
    );
  });

  test("embed times read as Discord writes them", () => {
    const now = new Date(2026, 11, 3, 20, 0);
    expect(embedTime("now", "Today at 18:00", now)).toBe("Today at 18:00");
    expect(embedTime("", "x", now)).toBe("");
    expect(embedTime("soon", "x", now)).toBe("");
    expect(
      embedTime(new Date(2026, 11, 3, 9, 5).toISOString(), "x", now),
    ).toMatch(/^Today at 0?9:05/);
    expect(
      embedTime(new Date(2026, 0, 2, 9, 5).toISOString(), "x", now),
    ).not.toMatch(/Today/);
  });
});

describe("embeds added and not written in yet", () => {
  test("are left out of the message until edited, wherever they move", () => {
    const base = withIds({
      content: "Hello",
      attachments: [],
      embeds: [],
    });
    const added = addedEmbed();
    const draft = addEmbed(base, added);
    expect(toMessage(draft).embeds).toHaveLength(0);
    expect(written(draft).embeds).toHaveLength(0);
    expect(written(base)).toBe(base);
    const edited = updateEmbed(draft, added.id, () => ({ title: "" }));
    // An edit replaces the embed, even one that leaves it empty again: it is
    // shown from then on, but an empty embed is still never in the message.
    expect(written(edited).embeds).toHaveLength(1);
    expect(toMessage(edited).embeds).toHaveLength(0);
    const titled = updateEmbed(draft, added.id, () => ({ title: "Hi" }));
    expect(toMessage(titled).embeds).toHaveLength(1);
  });

  test("an empty embed is never in the message, however it came about", () => {
    const draft = withIds({
      content: "Hello",
      attachments: [],
      embeds: [{ ...blankDraft().embeds[0]!, color: "#123456" }],
    });
    expect(toMessage(draft).embeds).toHaveLength(0);
  });

  test("leave a draft blank if nothing else is in it", () => {
    const draft = addEmbed(blankDraft(), addedEmbed());
    expect(draft.embeds).toHaveLength(2);
    expect(isBlank(draft)).toBe(true);
    expect(isBlank({ ...draft, content: "x" })).toBe(false);
  });
});
