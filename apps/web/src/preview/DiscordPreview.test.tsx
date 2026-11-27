// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { emptyEmbed } from "@embed-dash/shared";
import { afterEach, expect, test } from "vitest";
import { exampleDraft, withIds, type Draft } from "../compose/draft";
import { DiscordPreview } from "./DiscordPreview";

afterEach(cleanup);

const show = (draft: Draft) =>
  render(
    <DiscordPreview
      draft={draft}
      bot={{ id: "1", name: "Bot", avatarUrl: null }}
      botPending={false}
      time="Today at 18:00"
    />,
  );

test("all ten embeds a message can carry are shown", () => {
  show(
    withIds({
      content: "",
      attachments: [],
      embeds: Array.from({ length: 10 }, (_, i) => ({
        ...emptyEmbed(),
        title: `Embed ${i + 1}`,
      })),
    }),
  );
  const embeds = screen.getAllByTestId("preview-embed");
  expect(embeds).toHaveLength(10);
  expect(embeds[9]!.textContent).toContain("Embed 10");
});

test("the example's markdown is formatted, and each part keeps its own rules", () => {
  const draft = exampleDraft();
  draft.content = "**Heads up** <@123456789012345678>";
  draft.embeds[0]!.footer.text = "**not bold** in a footer";
  show(draft);
  const message = screen.getByRole("article", { name: "Message preview" });
  expect(within(message).getByText("Heads up").tagName).toBe("STRONG");
  expect(within(message).getByText("@unknown-user")).toBeTruthy();
  const embed = screen.getByTestId("preview-embed");
  expect(within(embed).getByText("six new tidal caves").tagName).toBe("STRONG");
  expect(
    within(embed)
      .getByRole("link", { name: "patch page" })
      .getAttribute("href"),
  ).toBe("https://lanternfall.example/patch/0-9-4");
  expect(within(embed).getByText(/\*\*not bold\*\* in a footer/)).toBeTruthy();
});

test("pictures that don't load leave a placeholder in their place", () => {
  show(
    withIds({
      content: "",
      attachments: [],
      embeds: [
        {
          ...emptyEmbed(),
          title: "Pictures",
          image: "https://example.com/missing.png",
          thumbnail: "https://example.com/missing-thumb.png",
          author: {
            name: "Author",
            url: "",
            iconUrl: "https://example.com/a.png",
          },
        },
      ],
    }),
  );
  const image = screen.getByRole("img", { name: "Embed image" });
  fireEvent.error(image);
  fireEvent.error(screen.getByRole("img", { name: "Embed thumbnail" }));
  expect(
    screen.getByRole("img", { name: "Embed image (didn’t load)" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Embed thumbnail (didn’t load)" }),
  ).toBeTruthy();
});

test("links Discord wouldn't show as pictures are left out", () => {
  show(
    withIds({
      content: "",
      attachments: [],
      embeds: [
        { ...emptyEmbed(), title: "T", image: "ftp://example.com/x.png" },
      ],
    }),
  );
  expect(screen.queryByRole("img", { name: /Embed image/ })).toBeNull();
});

test("an attached image shows in the preview, and a missing one leaves a placeholder", () => {
  show(
    withIds({
      content: "",
      attachments: [
        {
          id: "up1",
          filename: "banner.png",
          size: 10,
          contentType: "image/png",
        },
      ],
      embeds: [
        {
          ...emptyEmbed(),
          title: "Attached",
          image: "attachment://banner.png",
          thumbnail: "attachment://gone.png",
        },
      ],
    }),
  );
  expect(
    screen.getByRole("img", { name: "Embed image" }).getAttribute("src"),
  ).toBe("/api/uploads/up1/content");
  expect(
    screen.getByRole("img", { name: "Embed thumbnail (didn’t load)" }),
  ).toBeTruthy();
});
