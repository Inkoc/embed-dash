import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const artifacts = join(homedir(), "forge-artifacts/embed-dash/issue-10");
test("find a sent title and inspect every channel result", async ({ page }) => {
  mkdirSync(artifacts, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const title = `Observatory bulletin ${Date.now()}`;
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
  await expect(entry).toContainText("All sent");
  await page.screenshot({
    path: join(artifacts, "history-1280.png"),
    fullPage: true,
  });
  for (let step = 0; step < 20; step++) {
    if (await entry.evaluate((element) => element === document.activeElement))
      break;
    await page.keyboard.press("Tab");
  }
  await expect(entry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("article", { name: "Message preview" }),
  ).toContainText(title);
  await expect(
    page.getByRole("heading", { name: "Channel results" }),
  ).toBeVisible();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open in Discord/ }),
  ).toHaveAttribute("href", /^https:\/\/discord.com\/channels\/\d+\/\d+\/\d+$/);
  await page.screenshot({
    path: join(artifacts, "detail-1280.png"),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("switch", { name: "Dark theme" }).click();
  await page.screenshot({
    path: join(artifacts, "detail-dark-1280.png"),
    fullPage: true,
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: join(artifacts, "detail-dark-360.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("searchbox")).toHaveValue(title);
  await page.screenshot({
    path: join(artifacts, "history-dark-360.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});
test("history loading, empty and error recovery", async ({ page }) => {
  mkdirSync(artifacts, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/sends?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        json: { entries: [], hasMore: false, destinations: [] },
      });
    });
    await page.goto("/history");
    await expect(
      page.getByRole("heading", { name: "History", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Loading history" }),
    ).toContainText("Loading history");
    await page.screenshot({
      path: join(artifacts, `loading-${width}.png`),
      fullPage: true,
    });
    await expect(
      page.getByRole("link", { name: "Compose your first message" }),
    ).toBeVisible();
    await page.screenshot({
      path: join(artifacts, `empty-${width}.png`),
      fullPage: true,
    });
    await page.unroute("**/api/sends?*");
    await page.route("**/api/sends?*", (route) =>
      route.fulfill({ status: 503, json: { error: "Unavailable" } }),
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "History could not be loaded",
    );
    await page.screenshot({
      path: join(artifacts, `error-${width}.png`),
      fullPage: true,
    });
    await page.unroute("**/api/sends?*");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
