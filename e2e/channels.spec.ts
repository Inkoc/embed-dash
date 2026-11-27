import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const drawer = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const drawers = (page: Page) => page.locator("[data-drawer]");
const tray = (page: Page) => page.getByRole("complementary", { name: "Tray" });

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("finds channels by server name and by ID, and ticks two into the tray", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = collectErrors(page);
  await page.goto("/send");
  await expect(drawers(page)).toHaveCount(12);

  // / focuses the search from anywhere on the page.
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  const search = page.getByLabel("Find channels");
  await expect(search).toBeFocused();

  await search.fill("Cup EU");
  await expect(drawers(page)).toHaveCount(1);
  const cup = drawer(page, "Lanternfall Cup EU");
  // Each term is marked where it matched.
  await expect(cup.locator("mark")).toHaveText(["Cup", "EU"]);
  await cup.getByRole("checkbox", { name: "news" }).check();

  // A channel ID finds the one channel, with the hit marked in its call number.
  await search.fill("110348291550200002");
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  // The mark runs across the call number's plain prefix and its bold tail.
  await expect(page.locator("li mark")).toHaveText(["110348291550", "200002"]);
  // ↓ enters the list and Space ticks.
  await search.press("ArrowDown");
  await expect(
    page.getByRole("checkbox", { name: "release-notes" }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("checkbox", { name: "release-notes" }),
  ).toBeChecked();

  // Esc clears the search first instead of leaving the view.
  await search.focus();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page).toHaveURL(/\/send$/);

  await expect(tray(page)).toContainText("2 channels in 2 servers");
  await expect(
    tray(page).getByRole("listitem").filter({ hasText: "#news" }),
  ).toContainText("Lanternfall Cup EU");
  await expect(
    page.getByRole("button", { name: "Send to 2 channels" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("navigation", { name: "Servers" }).getByRole("button", {
      name: /Lanternfall Cup EU.*1 of 3 postable channels ticked/,
    }),
  ).toBeVisible();

  // Taking a slip out of the tray unticks its entry.
  await tray(page)
    .getByRole("button", { name: /Take #news \(Lanternfall Cup EU\)/ })
    .click();
  await expect(
    drawer(page, "Lanternfall Cup EU").getByRole("checkbox", { name: "news" }),
  ).not.toBeChecked();
  await expect(tray(page)).toContainText("1 channel in 1 server");

  // Channels the bot can't post in are listed, disabled, with the reason.
  const blocked = drawer(page, "Lanternfall Community").getByRole("checkbox", {
    name: "moderators",
  });
  await expect(blocked).toHaveAttribute("aria-disabled", "true");
  await expect(blocked).toHaveAccessibleDescription(
    /Bot is missing Send Messages here/,
  );
  await blocked.click({ force: true });
  await expect(blocked).not.toBeChecked();

  // Quick picks: the main channel of each server, then clear.
  await page
    .getByRole("button", { name: /Main channel of each server/ })
    .click();
  await expect(tray(page)).toContainText("13 channels in 12 servers");
  await page.getByRole("button", { name: /^Clear \d/ }).click();
  await expect(tray(page)).toContainText("Nothing ticked yet");

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [360, 768])
  test(`the picker fits ${width} px without sideways scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto("/send");
    const sheet = tray(page);
    await expect(sheet).toContainText("Nothing ticked yet");
    // The server strip scrolls inside itself; the page never scrolls sideways.
    await expect(
      page.getByRole("navigation", { name: "Servers" }).getByRole("button"),
    ).toHaveCount(12);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // An empty tray is a slim bar; the first tick brings the Send action.
    await expect(sheet.getByRole("button", { name: "Send" })).toBeHidden();
    await drawer(page, "Lanternfall Community")
      .getByRole("checkbox", { name: "general" })
      .check();
    await expect(sheet).toContainText("1 channel in 1 server");
    // The sheet rises into place, then sits on the bottom edge.
    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!;
        return Math.round(box.y + box.height);
      })
      .toBe(780);
    await expect(sheet.getByRole("listitem")).toBeHidden();
    await sheet.getByRole("button", { name: "Show ticked channels" }).click();
    await expect(sheet.getByRole("listitem")).toContainText("#general");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
