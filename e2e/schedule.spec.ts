import { expect, test } from "@playwright/test";

test.afterEach(async ({ request }) => {
  const session = (await request.get("/api/session").then((r) => r.json())) as {
    csrfToken: string;
  };
  await request.delete("/api/test/scheduler/advance", {
    headers: {
      "x-csrf-token": session.csrfToken,
      origin: "http://127.0.0.1:" + (process.env.E2E_PORT ?? 28742),
    },
  });
});

test("schedule a minute ahead, then deliver through history", async ({
  page,
}) => {
  const now = new Date();
  await page.clock.install({ time: now });
  await page.goto("/");
  await page.getByLabel("Title", { exact: true }).fill("Planned maintenance");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await page
    .getByRole("region", { name: "Lanternfall Cup EU", exact: true })
    .getByRole("checkbox", { name: "news", exact: true })
    .check();
  const tray = page.getByRole("complementary", { name: "Tray" });
  await tray.getByRole("button", { name: "Schedule", exact: true }).click();
  const due = new Date(now.getTime() + 60000);
  const local = new Date(due.getTime() - due.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel(/Send date and time/).fill(local);
  await page.getByRole("button", { name: "Review schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule to 1 channel?" });
  await expect(dialog).toContainText("Due");
  await dialog
    .getByRole("button", { name: "Schedule send", exact: true })
    .click();
  await expect(page).toHaveURL(/status=scheduled/);
  await expect(
    page.getByRole("link", { name: /Planned maintenance/ }),
  ).toContainText("Scheduled");
  await page.getByRole("link", { name: /Planned maintenance/ }).click();
  await page.evaluate(async () => {
    const session = (await fetch("/api/session").then((r) => r.json())) as {
      csrfToken: string;
    };
    await fetch("/api/test/scheduler/advance", {
      method: "POST",
      headers: { "x-csrf-token": session.csrfToken },
    });
  });
  await page.clock.fastForward(60000);
  await expect(page.getByText("All sent", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Open in Discord/ }),
  ).toBeVisible();
});
