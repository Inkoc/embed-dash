import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectHeaderFits, expectPhoneHeaderFits, padViews } from "./header.js";

const preview = (page: Page) => page.getByTestId("preview-embed");
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 2, name, exact: true });

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

test("editing title, description and colour updates the preview live", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Show" })).toBeHidden();
  await page.getByLabel("Title", { exact: true }).fill("Server maintenance");
  await expect(preview(page)).toContainText("Server maintenance");
  await page
    .getByLabel("Description", { exact: true })
    .fill("The server restarts at 06:00 UTC.");
  await expect(preview(page)).toContainText(
    "The server restarts at 06:00 UTC.",
  );
  const hex = page.getByLabel("Side colour", { exact: true });
  await hex.fill("#3366ff");
  await expect(preview(page)).toHaveAttribute(
    "style",
    /--embed-color: #3366ff/,
  );
  await expect(hex).toHaveValue("#3366FF");
  // Counts stay hidden until a control has focus.
  const count = page.locator("[id$='-title-count']");
  await page.getByLabel("Description", { exact: true }).focus();
  await expect(count).toHaveCSS("opacity", "0");
  await page.getByLabel("Title", { exact: true }).focus();
  await expect(count).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
});

test("markdown in the description renders formatted in the preview", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByLabel("Title", { exact: true }).fill("Patch notes");
  await page
    .getByLabel("Description", { exact: true })
    .fill(
      "## What's new\n**Faster** saves, __fewer__ crashes.\n- Tidal caves\n- A new [map](https://example.com/map)\n> Back up first\n||Secret boss||",
    );
  const embed = preview(page);
  await expect(embed.getByText("What's new")).toHaveCSS("font-weight", "700");
  await expect(embed.locator("strong", { hasText: "Faster" })).toBeVisible();
  await expect(embed.locator("u", { hasText: "fewer" })).toBeVisible();
  await expect(embed.getByRole("listitem")).toHaveText([
    "Tidal caves",
    "A new map",
  ]);
  await expect(embed.getByRole("link", { name: "map" })).toHaveAttribute(
    "href",
    "https://example.com/map",
  );
  await expect(embed.locator("blockquote")).toHaveText("Back up first");
  const spoiler = embed.getByRole("button", {
    name: "Spoiler, select to show",
  });
  await spoiler.click();
  await expect(spoiler).toBeHidden();
  await expect(embed.getByText("Secret boss")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the signed-in bar keeps to one line without overlap from tablet to wide desktop", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByText("Walking Skeleton Bot"),
  ).toBeVisible();
  await expectHeaderFits(page);
  // With room to spare beside four views, Shortcuts keeps its word.
  await page.setViewportSize({ width: 1440, height: 800 });
  await expect(
    page.getByRole("button", { name: "Shortcuts" }).getByText("Shortcuts"),
  ).toBeInViewport();
});

test("when the bot can't connect after the page loads, the bar refits around the failure", async ({
  page,
}) => {
  // Held briefly, so the bar first fits the connecting state and then has to refit.
  await page.route("/api/bot", async (route) => {
    await new Promise((done) => setTimeout(done, 300));
    await route.fulfill({ status: 502, json: {} });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const banner = page.getByRole("banner");
  await expect(banner.getByText("Connecting to Discord…")).toBeVisible();
  await expect(banner.getByText("Not connected")).toBeVisible();
  await expectHeaderFits(page);
  // Short of room, the failure moves to the notice above the view, Retry and all.
  await page.setViewportSize({ width: 768, height: 800 });
  await expect(banner.getByText("Not connected")).toBeHidden();
  const notice = page.getByRole("main").getByRole("alert");
  await expect(notice).toContainText("Unable to connect to Discord");
  const retry = await notice
    .getByRole("button", { name: "Retry connection" })
    .boundingBox();
  expect(retry!.width).toBeGreaterThanOrEqual(44);
  expect(retry!.height).toBeGreaterThanOrEqual(44);
});

test("on phones the views take their own row, with or without Sign out, and hold four views", async ({
  page,
}) => {
  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "Templates", exact: true }),
  ).toBeVisible();
  await padViews(page, 4);
  await expectPhoneHeaderFits(page);
  // Local mode has no Sign out; the layout mustn't depend on it.
  await page.evaluate(() =>
    document.querySelector("[data-session-control]")?.remove(),
  );
  await expectPhoneHeaderFits(page);
});

test("the theme switch is remembered and applied before first paint", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");
  const toggle = page.getByRole("switch", { name: "Dark theme" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Discord light")).toBeVisible();
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Discord dark")).toBeVisible();
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // With the app's scripts blocked, only the inline pre-paint script can set the theme.
  await page.route("**/assets/*.js", (route) => route.abort());
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
});

test("view switching never waits: clicks land during transitions", async ({
  page,
}) => {
  await page.goto("/");
  // Count view transitions; navigation must never start one.
  await page.evaluate(() => {
    const counted = window as unknown as { transitions: number };
    const original = document.startViewTransition.bind(document);
    counted.transitions = 0;
    document.startViewTransition = (callback) => {
      counted.transitions++;
      return original(callback);
    };
  });
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Send" }).click();
  await nav.getByRole("link", { name: "Compose" }).click();
  await nav.getByRole("link", { name: "Send" }).click();
  await expect(page).toHaveURL(/\/send$/);
  await expect(heading(page, "Send")).toBeVisible();
  // Navigation never uses a view transition, so nothing can swallow a click.
  expect(
    await page.evaluate(
      () => (window as unknown as { transitions: number }).transitions,
    ),
  ).toBe(0);
  // The theme wipe does use one; a click during it still reaches the page.
  await page.getByRole("switch", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/theme-wipe/);
  // force: a real click at the link's position, without waiting for the wipe to end
  await nav.getByRole("link", { name: "Compose" }).click({ force: true });
  await expect(page).toHaveURL(/\/$/);
  await expect(heading(page, "Compose")).toBeVisible();
});

test("keyboard shortcuts move between views and list themselves", async ({
  page,
}) => {
  await page.goto("/");
  // A blank draft can't go forward; the example can.
  await page.getByRole("button", { name: "Start from an example" }).click();
  await page.getByLabel("Title", { exact: true }).focus();
  await page.keyboard.press("Alt+2");
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("Control+Enter");
  await expect(page).toHaveURL(/\/send$/);
  await expect(heading(page, "Send")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await expect(heading(page, "Compose")).toBeFocused();
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Go forward: from Compose to Send");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  // Typing a question mark in a field is just typing.
  await page.getByLabel("Title", { exact: true }).fill("");
  await page.getByLabel("Title", { exact: true }).pressSequentially("Why?");
  await expect(dialog).toBeHidden();
  await expect(preview(page)).toContainText("Why?");
});

test("the preview resizes by drag, keys and presets", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const handle = page.getByRole("separator", { name: "Resize preview" });
  await expect(handle).toHaveAttribute("aria-valuenow", "640");
  await page.getByRole("button", { name: "Phone" }).click();
  await expect(handle).toHaveAttribute("aria-valuenow", "360");
  await expect(page.getByRole("button", { name: "Phone" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuenow", "376");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "320");
  await page.keyboard.press("End");
  const max = Number(await handle.getAttribute("aria-valuemax"));
  await expect(handle).toHaveAttribute("aria-valuenow", String(max));
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", String(max - 200));
  await page.getByRole("button", { name: "Desktop" }).click();
  await expect(handle).toHaveAttribute("aria-valuenow", "640");
});

test("the composer passes axe and loads cleanly under the CSP", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Settled motion, so axe measures final colours rather than a frame mid-fade.
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText("Walking Skeleton Bot");
  await expect(heading(page, "Compose")).toBeVisible();
  expect(
    await page.evaluate(() => document.fonts.check("1rem 'Atkinson Next'")),
  ).toBe(true);
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("at 360 px long field names wrap beside a thumbnail, and a linked title stays legible", async ({
  page,
}) => {
  const word = "Antidisestablishmentarianism";
  const embed = {
    color: "#e8a33d",
    title: "Opens `v2` <t:1700000000:R> ||soon||",
    url: "https://example.com/notes",
    description: "",
    author: { name: "", url: "", iconUrl: "" },
    // A file that isn't attached: the thumbnail placeholder takes the right
    // edge without any network request.
    thumbnail: "attachment://missing.png",
    image: "",
    fields: [
      { name: word, value: `${word}${word}`, inline: true },
      { name: word, value: "Two", inline: true },
      { name: `${word}${word}`, value: "Full", inline: false },
    ],
    footer: { text: word.repeat(3), iconUrl: "" },
    timestamp: "",
  };
  await page.addInitScript(
    (draft) => localStorage.setItem("embed-dash:draft", JSON.stringify(draft)),
    { content: "", attachments: [], embeds: [embed] },
  );
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page
    .getByRole("group", { name: "Show" })
    .getByRole("button", { name: "Preview" })
    .click();
  await expect(preview(page)).toBeVisible();
  await preview(page)
    .getByRole("button", { name: "Spoiler, select to show" })
    .click();
  const overflowing = () =>
    preview(page).evaluate((root) =>
      [...root.querySelectorAll("[style*='grid-column'] > *, p")]
        .filter((el) => el.scrollWidth > el.clientWidth)
        .map((el) => el.textContent),
    );
  expect(await overflowing()).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await axe(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await axe(page)).toEqual([]);
});

test("at 320 px the action bar keeps its count and Choose channels on one line each", async ({
  page,
}) => {
  // One line of text: its rects all share a top.
  const lines = (selector: string) =>
    page.evaluate((selector) => {
      const element = document.querySelector(selector)!;
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(
        [...range.getClientRects()]
          .filter((rect) => rect.width > 1)
          .map((rect) => Math.round(rect.top)),
      ).size;
    }, selector);
  const embed = (description: string, fields: number) => ({
    color: "#e8a33d",
    title: "",
    url: "",
    description,
    author: { name: "", url: "", iconUrl: "" },
    thumbnail: "",
    image: "",
    fields: Array.from({ length: fields }, () => ({
      name: "A",
      value: "b".repeat(999),
      inline: false,
    })),
    footer: { text: "", iconUrl: "" },
    timestamp: "",
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  // A four-digit count, then the most an embed set may hold.
  for (const [draft, count] of [
    [embed("a".repeat(1001), 0), "1,001"],
    [embed("a".repeat(4000), 2), "6,000"],
  ] as const) {
    await page.evaluate(
      (draft) =>
        localStorage.setItem(
          "embed-dash:draft",
          JSON.stringify({ content: "", attachments: [], embeds: [draft] }),
        ),
      draft,
    );
    await page.reload();
    await expect(page.locator("#action-meta")).toContainText(count);
    expect(await lines("#action-meta"), count).toBe(1);
    expect(await lines("#action-meta + *"), count).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("at 360 px the composer stacks without horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const show = page.getByRole("group", { name: "Show" });
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await expect(preview(page)).toBeHidden();
  await show.getByRole("button", { name: "Preview" }).click();
  await expect(preview(page)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(show.getByRole("button", { name: "Edit" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("banner")).toContainText("Walking Skeleton Bot");
  // A folded embed's one-line summary must not widen the page either.
  await page.getByRole("button", { name: "Start from an example" }).click();
  await page.getByRole("button", { name: "Add embed" }).click();
  const fold = page
    .locator('button[aria-expanded][aria-controls$="-body"]')
    .first();
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an embed is built with fields, and a limit breach blocks sending", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Clear" }).click();
  await page
    .getByRole("dialog", { name: "Clear the draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");

  await page.getByLabel("Title", { exact: true }).fill("Weekly raid");
  const description = page.getByLabel("Description", { exact: true });
  await description.fill("Bring potions");
  await description.press("ControlOrMeta+a");
  await description.press("ControlOrMeta+b");
  await expect(description).toHaveValue("**Bring potions**");

  for (const [name, value] of [
    ["When", "Friday 20:00"],
    ["Where", "The Sunken Keep"],
  ]) {
    await page.getByRole("button", { name: "Add field" }).click();
    await page.keyboard.type(name);
    await page
      .getByRole("textbox", { name: "Value", exact: true })
      .last()
      .fill(value);
  }
  await expect(page.getByText("2 of 25")).toBeVisible();
  await expect(preview(page)).toContainText("When");
  await expect(preview(page)).toContainText("The Sunken Keep");
  await expect(page.getByText("Looks right?")).toBeVisible();

  // Over the limit: the count turns red at once, the message shows on blur.
  const name = page.getByRole("textbox", { name: "Name", exact: true }).last();
  await name.fill("x".repeat(260));
  await expect(
    page.locator(`#${await name.getAttribute("id")}-count`),
  ).toHaveAttribute("data-level", "over");
  await name.blur();
  await expect(
    page.getByText("4 characters over the 256 limit.").first(),
  ).toBeVisible();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("1 problem to fix before sending")).toBeVisible();
  const forward = page.getByRole("button", { name: /Choose channels/ }).first();
  await expect(forward).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Control+Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(name).toBeFocused();

  // The draft survives a reload.
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Weekly raid",
  );
  await expect(page.getByText("1 problem to fix before sending")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const height of [640, 740])
  test(`on a 360×${height} phone, going forward from a blank draft shows that there is nothing to send`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await page.keyboard.press("Control+Enter");
    const line = page
      .getByText("Nothing to send yet.", { exact: true })
      .first();
    await expect(line).toBeVisible();
    await expect(page.locator("#in-content")).toBeFocused();
    const layout = await page.evaluate(() => {
      const box = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      return {
        line: box("#starter"),
        stickyBottom: box("[aria-label='Show']").bottom,
        barTop: box("#action-meta").top,
      };
    });
    // The whole answer sits between the sticky bars, not under them.
    expect(layout.line.top).toBeGreaterThanOrEqual(layout.stickyBottom);
    expect(layout.line.bottom).toBeLessThanOrEqual(layout.barTop);
  });

test("an embed added and left empty is not sent, even after a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page
    .getByLabel("Title", { exact: true })
    .fill(`Reload check ${Date.now()}`);
  await page.getByRole("button", { name: "Add embed" }).click();
  await expect(page.getByText("Not sent until you write in it.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Not sent until you write in it.")).toBeVisible();
  await expect(page.getByText("Looks right?")).toBeVisible();
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page.getByText(/1 embed/).first()).toBeVisible();
  await page
    .getByRole("region", { name: "Lanternfall Cup EU", exact: true })
    .getByRole("checkbox", { name: "match-schedule", exact: true })
    .check();
  const tray = page.getByRole("complementary", { name: "Tray" });
  await tray
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  // The server refuses an empty embed, so a confirmed copy shows it was left out.
  await expect(tray.getByText("Sent", { exact: true })).toHaveCount(1);
});
