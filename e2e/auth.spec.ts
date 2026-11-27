import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ storageState: { cookies: [], origins: [] } });

test("password login reaches composer and logout protects it again", async ({
  page,
}) => {
  test.skip(process.env.E2E_AUTH_MODE === "none");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByLabel("Instance password")).toBeFocused();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByLabel("Instance password").fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t sign in: the password is incorrect.",
  );
  await page.getByLabel("Instance password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Compose", exact: true }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Dark theme" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("switch", { name: "Dark theme" })).toBeVisible();
  expect(errors).toEqual([]);
});

/** The notice and everything in it lie inside the viewport, and the page doesn't scroll sideways. */
async function expectOnScreen(page: Page, notice: Locator) {
  const width = page.viewportSize()!.width;
  const box = (await notice.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  // Nothing inside spills past the notice's own edge.
  expect(
    await notice.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const width of [360, 1280])
  test(`refused sign-in and sign-out notices stay on screen with Details open at ${width} px`, async ({
    page,
  }) => {
    test.skip(process.env.E2E_AUTH_MODE === "none");
    await page.setViewportSize({ width, height: 800 });
    await page.route("**/api/auth/login", (route) =>
      route.request().postDataJSON().password === "e2e-password"
        ? route.continue()
        : route.fulfill({
            status: 403,
            json: { code: "PROXY_NOT_TRUSTED", error: "Proxy not trusted." },
          }),
    );
    await page.goto("/login");
    await page.getByLabel("Instance password").fill("wrong");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const signIn = page.locator("#login-error");
    await signIn.getByText("Details", { exact: true }).click();
    await expect(signIn.locator("details")).toHaveAttribute("open", "");
    await page.screenshot({
      path: `${process.env.ROUND2_SHOTS ?? "test-results"}/signin-${width}.png`,
    });
    await expectOnScreen(page, signIn);

    await page.getByLabel("Instance password").fill("e2e-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.route("**/api/auth/logout", (route) =>
      route.fulfill({
        status: 403,
        json: {
          code: "CSRF_INVALID",
          error: "Session token missing or invalid. Refresh and try again.",
        },
      }),
    );
    await page.getByRole("button", { name: /^Sign out/ }).click();
    const signOut = page.getByRole("alert").locator("..");
    await expect(page.getByRole("alert")).toContainText("Couldn’t sign out");
    await signOut.getByText("Details", { exact: true }).click();
    await expect(signOut.locator("details")).toHaveAttribute("open", "");
    await page.screenshot({
      path: `${process.env.ROUND2_SHOTS ?? "test-results"}/signout-${width}.png`,
    });
    await expectOnScreen(page, signOut);
  });
