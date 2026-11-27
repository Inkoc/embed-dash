import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseURL = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 28742) + 1}`;
test.use({ baseURL, storageState: { cookies: [], origins: [] } });

test("an approved Discord account signs in, shows in the bar and signs out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Wide enough for the name badge, which narrower bars fold into Sign out.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  const signIn = page.getByRole("link", { name: "Sign in with Discord" });
  await expect(signIn).toBeFocused();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await signIn.click();
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
  await page.getByRole("button", { name: "Sign out Ada Lovelace" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(signIn).toBeVisible();
  expect(errors).toEqual([]);
});

test("an account that is not approved sees its ID and stays out", async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: "fake_user", value: "blocked", url: baseURL }]);
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign in with Discord" }).click();
  await expect(
    page.getByRole("heading", { name: "Not allowed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Not allowed" }),
  ).toBeFocused();
  await expect(page.getByText("222222222222222222")).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Not allowed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with another account" }),
  ).toBeVisible();
});
