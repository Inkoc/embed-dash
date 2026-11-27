import { expect, test } from "@playwright/test";
test("shows the connected bot from Discord through the real server", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText(
    "Bot Walking Skeleton Bot",
  );
});

let authCookies: Awaited<
  ReturnType<import("@playwright/test").APIRequestContext["storageState"]>
>["cookies"] = [];
test.beforeAll(async ({ request }) => {
  const session = await request.get("/api/session");
  const { csrfToken, authMode } = await session.json();
  if (authMode === "password") {
    const login = await request.post("/api/auth/login", {
      headers: { "x-csrf-token": csrfToken },
      data: { password: "e2e-password" },
    });
    expect(login.ok()).toBe(true);
  }
  authCookies = (await request.storageState()).cookies;
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(authCookies);
});
