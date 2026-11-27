import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("password login reaches composer and logout protects it again", async ({
  page,
}) => {
  test.skip(process.env.E2E_AUTH_MODE === "none");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your instance" }),
  ).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Dark theme" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Instance password")).toBeFocused();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByLabel("Instance password").fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect password");
  await page.getByLabel("Instance password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
