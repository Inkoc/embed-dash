import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const tray = (page: Page) => page.getByRole("complementary", { name: "Tray" });
const drawer = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function compose(page: Page, title: string) {
  await page.goto("/");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Maintenance starts at 06:00 UTC.");
}

async function pick(page: Page, guild: string, channel: string) {
  await drawer(page, guild).getByRole("checkbox", { name: channel }).check();
}

test("compose, pick two channels, confirm, and see two sent copies", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = collectErrors(page);
  await compose(page, "Server maintenance");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  // What is about to go out stays in view while channels are picked.
  await expect(page.getByText("Sending", { exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "Sending Server maintenance 1 embed",
  );
  await pick(page, "Lanternfall Cup EU", "news");
  await pick(page, "Lanternfall Modding Guild", "release-notes");
  await expect(tray(page)).toContainText("2 channels in 2 servers");

  await tray(page).getByRole("button", { name: "Send to 2 channels" }).click();
  const dialog = page.getByRole("dialog", { name: "Send to 2 channels?" });
  // The confirmation names the message and the destinations before anything goes out.
  await expect(dialog).toContainText("Server maintenance");
  await expect(dialog).toContainText("This posts to 2 channels in 2 servers.");
  await expect(dialog).toContainText("#news");
  await expect(dialog).toContainText("Mentions won’t notify anyone.");
  await dialog.getByRole("button", { name: "Send to 2 channels" }).click();

  // While the copies are delivered the tray shows how far it has got and the selection is locked.
  await expect(
    tray(page).getByRole("button", { name: /^Sending \d of 2…/ }),
  ).toBeDisabled();
  await expect(page.getByText(/The selection is locked/)).toBeVisible();
  await expect(
    drawer(page, "Lanternfall Cup EU").getByRole("checkbox", {
      name: "match-schedule",
    }),
  ).toHaveAttribute("aria-disabled", "true");

  await expect(tray(page).getByText("Sent", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/The selection is locked/)).toHaveCount(0);
  await expect(tray(page)).toContainText("2 sent.");
  await expect(tray(page)).toContainText("Every copy arrived.");
  const links = tray(page).getByRole("link", { name: /Open in Discord/ });
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute(
    "href",
    /^https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+$/,
  );

  // The results stay when the operator steps back to Compose and returns.
  await page.getByRole("link", { name: "Compose", exact: true }).click();
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(tray(page)).toContainText("2 sent.");

  // Measure the settled colours; view-arrival motion is covered by the navigation specs.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const violations = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.violations.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});

test("one refused channel fails on its own slip and retry sends only that one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await compose(page, "Match schedule");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await pick(page, "Lanternfall Cup EU", "match-schedule");
  // The fake refuses the first post to #results, once.
  await pick(page, "Lanternfall Cup EU", "results");
  await tray(page).getByRole("button", { name: "Send to 2 channels" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 2 channels" })
    .click();

  await expect(tray(page)).toContainText("1 sent, 1 failed.");
  const failed = tray(page)
    .getByRole("listitem")
    .filter({ hasText: "#results" });
  await expect(failed).toContainText("Failed");
  await expect(failed).toContainText("The bot isn’t allowed to post");
  await expect(
    tray(page).getByRole("listitem").filter({ hasText: "#match-schedule" }),
  ).toContainText("Sent");

  await tray(page).getByRole("button", { name: "Retry 1 failed" }).click();
  await expect(tray(page)).toContainText("2 sent.");
  await expect(tray(page)).toContainText("Every copy arrived.");
  await expect(failed).toContainText("Sent");
  await expect(tray(page).getByRole("button", { name: /Retry/ })).toHaveCount(
    0,
  );

  // Keeping the draft unticks the channels that have it and marks them.
  await tray(page).getByRole("button", { name: "Keep this draft" }).click();
  await expect(tray(page)).toContainText("Nothing ticked yet");
  const results = drawer(page, "Lanternfall Cup EU").getByRole("checkbox", {
    name: "results",
  });
  await expect(results).not.toBeChecked();
  await expect(results).toHaveAccessibleDescription(/Already has this message/);
});

test("after a send, Compose a new message clears the draft and the selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = collectErrors(page);
  await compose(page, "Weekly digest");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await pick(page, "Lanternfall Cup EU", "news");
  await tray(page).getByRole("button", { name: "Send to 1 channel" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 1 channel" })
    .click();
  await expect(tray(page)).toContainText("Every copy arrived.");

  await tray(page)
    .getByRole("button", { name: "Compose a new message" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Start a new message?" });
  await expect(dialog).toContainText(
    "The copies already posted stay in Discord.",
  );
  await dialog.getByRole("button", { name: "Clear and compose" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(tray(page)).toContainText("Nothing ticked yet");
  await expect(
    drawer(page, "Lanternfall Cup EU").getByRole("checkbox", { name: "news" }),
  ).not.toBeChecked();
  await expect(page.locator("main")).toContainText("Nothing written yet");
  expect(errors).toEqual([]);
});

test("forum channels are listed with a reason and can't be picked", async ({
  page,
}) => {
  await page.goto("/send");
  const bugs = drawer(page, "Lanternfall Community").getByRole("checkbox", {
    name: "bug-reports",
  });
  await expect(bugs).toHaveAttribute("aria-disabled", "true");
  await expect(
    drawer(page, "Lanternfall Community").getByText(
      "Forum posting isn’t available yet",
      { exact: true },
    ),
  ).toBeVisible();
  await bugs.click({ force: true });
  await expect(bugs).not.toBeChecked();
});

test("a draft with problems keeps Send disabled and points at the field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByLabel("Description", { exact: true }).fill("x".repeat(4100));
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await pick(page, "Lanternfall Cup EU", "news");
  await expect(
    tray(page).getByRole("button", { name: "Send to 1 channel" }),
  ).toBeDisabled();
  await expect(tray(page)).toContainText("to fix before sending");
  await tray(page)
    .getByRole("link", { name: /Go to the field/ })
    .first()
    .click();
  await expect(page.getByLabel("Description", { exact: true })).toBeFocused();
});

test("on a phone the sheet's Send button works and the results fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await compose(page, "Phone send");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await pick(page, "Lanternfall Cup EU", "news");
  await tray(page).getByRole("button", { name: "Send to 1 channel" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 1 channel" })
    .click();
  await expect(tray(page)).toContainText("1 sent.");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("reloading mid-send shows its progress again, the lock note stays in view and the next steps look disabled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await compose(page, "Reload mid-send");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await pick(page, "Lanternfall Cup EU", "news");
  await pick(page, "Lanternfall Cup EU", "match-schedule");
  await pick(page, "Lanternfall Modding Guild", "release-notes");
  await tray(page).getByRole("button", { name: "Send to 3 channels" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 3 channels" })
    .click();
  await expect(
    tray(page).getByRole("button", { name: "Keep this draft" }),
  ).toBeDisabled();
  await expect(
    tray(page).getByRole("button", { name: "Compose a new message" }),
  ).toBeDisabled();

  // Scrolled down, the note is still there, and a locked row isn't live-looking.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByText(/The selection is locked/)).toBeInViewport();

  await page.reload();
  await expect(page.getByText(/The selection is locked/)).toBeVisible();
  await expect(tray(page)).toContainText(/\d of 3 sent|3 sent/);
  await expect(tray(page)).toContainText("3 sent.");
  await expect(tray(page)).toContainText("Every copy arrived.");
  await expect(page.getByText(/The selection is locked/)).toHaveCount(0);
  await expect(
    tray(page).getByRole("link", { name: /Open in Discord/ }),
  ).toHaveCount(3);
});
