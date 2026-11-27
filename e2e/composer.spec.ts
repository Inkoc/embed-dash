import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const shots = join(homedir(), "forge-artifacts/embed-dash/baseline");
mkdirSync(shots, { recursive: true });

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
  await page.getByLabel("Title", { exact: true }).fill("Server maintenance");
  await expect(preview(page)).toContainText("Server maintenance");
  await page
    .getByLabel("Description")
    .fill("The server restarts at 06:00 UTC.");
  await expect(preview(page)).toContainText(
    "The server restarts at 06:00 UTC.",
  );
  await page.getByLabel("Side colour").fill("#3366ff");
  await expect(preview(page)).toHaveAttribute(
    "style",
    /--embed-color: #3366ff/,
  );
  await expect(page.getByText("#3366FF")).toBeVisible();
  // Counts stay hidden until a control has focus.
  const count = page.locator("#in-title-count");
  await page.getByLabel("Description").focus();
  await expect(count).toHaveCSS("opacity", "0");
  await page.getByLabel("Title", { exact: true }).focus();
  await expect(count).toHaveCSS("opacity", "1");
  expect(errors).toEqual([]);
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
  await page.waitForTimeout(400);
  await page.screenshot({
    path: join(shots, "compose-phone-preset-1280-light.png"),
  });
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

test("the bot indicator shows a failure with a working retry", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/bot", (route) =>
    fail
      ? route.fulfill({ status: 502, json: { error: "unreachable" } })
      : route.continue(),
  );
  await page.goto("/");
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("alert")).toContainText("Not connected");
  await expect(preview(page)).toBeVisible();
  fail = false;
  await banner.getByRole("button", { name: "Retry connection" }).click();
  await expect(banner).toContainText("Walking Skeleton Bot");
});

for (const theme of ["light", "dark"] as const)
  test(`composer and send pass axe and render at every width in ${theme}`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, name] of [
        ["/", "Compose"],
        ["/send", "Send"],
      ] as const) {
        await page.goto(path);
        await expect(heading(page, name)).toBeVisible();
        await expect(page.getByRole("banner")).toBeVisible();
        await page.waitForTimeout(400);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: join(shots, `${name.toLowerCase()}-${width}-${theme}.png`),
        });
        expect(await axe(page)).toEqual([]);
      }
      if (width < 861) {
        await page.goto("/");
        await page.getByRole("tab", { name: "Preview" }).click();
        await page.waitForTimeout(400);
        await page.screenshot({
          path: join(shots, `compose-preview-${width}-${theme}.png`),
        });
        expect(await axe(page)).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.screenshot({
      path: join(shots, `compose-1280-${theme}-full.png`),
      fullPage: true,
    });
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(shots, `shortcuts-1280-${theme}.png`),
    });
    expect(await axe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
