import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";
test("shows the connected bot from Discord through the real server", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  expect((await request.get("/health")).ok()).toBeTruthy();
  const bot = await request.get("/api/bot");
  expect(await bot.json()).toEqual({
    id: "123456789012345678",
    name: "Walking Skeleton Bot",
    avatarUrl: null,
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "embed-dash", exact: true }),
  ).toBeAttached();
  await expect(page.getByRole("banner")).toContainText(
    "Bot Walking Skeleton Bot",
  );
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: join(
        homedir(),
        `forge-artifacts/embed-dash/scaffold/bot-${width}.png`,
      ),
    });
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});
