import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
test("find a sent title and inspect every channel result", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const title = `Observatory bulletin ${crypto.randomUUID()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await page
    .getByRole("region", { name: "Lanternfall Cup EU", exact: true })
    .getByRole("checkbox", { name: "news", exact: true })
    .check();
  await page
    .getByRole("complementary", { name: "Tray" })
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Tray" })
      .getByText("Sent", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search history" }),
  ).toBeVisible();
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
  await page.getByRole("searchbox").fill(title);
  const entry = page.getByRole("link", { name: new RegExp(title) });
  await expect(page).toHaveURL(
    new RegExp(`q=${encodeURIComponent(title).replace(/%20/g, "\\+")}`),
  );
  await expect(
    page.getByRole("list", { name: "Sent messages" }).getByRole("link"),
  ).toHaveCount(1);
  await expect(entry).toContainText("All sent");
  await page.keyboard.press("ArrowDown");
  await expect(entry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("article", { name: "Message preview" }),
  ).toContainText(title);
  await expect(
    page.getByRole("heading", { name: "Channel results" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeFocused();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open in Discord/ }),
  ).toHaveAttribute("href", /^https:\/\/discord.com\/channels\/\d+\/\d+\/\d+$/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("switch", { name: "Dark theme" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 360, height: 800 });
  // The top bar refits in the frame after a resize, so wait for the layout to settle.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("searchbox")).toHaveValue(title);
  await expect(entry).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: /Back to history/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(entry).toBeFocused();
  expect(errors).toEqual([]);
});
