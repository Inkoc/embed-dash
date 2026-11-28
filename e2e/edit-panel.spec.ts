import { expect, test, type Page } from "@playwright/test";

/** Sends a message to one channel and opens it for editing from History. */
async function editSentMessage(page: Page) {
  const title = `Tablet edit ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await page
    .getByRole("region", { name: "Lanternfall Cup EU", exact: true })
    .getByRole("checkbox", { name: "match-schedule", exact: true })
    .check();
  const tray = page.getByRole("complementary", { name: "Tray" });
  await tray
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  await expect(tray.getByText("Sent", { exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search history" }).fill(title);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(`${title} revised`);
  return title;
}

/** Waits until a box has stopped moving (smooth scrolling), then returns it. */
async function settledBox(page: Page, selector: string) {
  let last = "";
  await expect
    .poll(async () => {
      const box = JSON.stringify(
        await page.locator(selector).first().boundingBox(),
      );
      const still = box === last;
      last = box;
      return still;
    })
    .toBe(true);
  return (await page.locator(selector).first().boundingBox())!;
}

/** The outcome sits fully between the sticky top bar and the pinned Save bar. */
async function expectClearOfBars(page: Page, selector: string) {
  const box = await settledBox(page, selector);
  const header = (await page.getByRole("banner").boundingBox())!;
  const pinned = (await page
    .locator("[data-edit-save]")
    .filter({ visible: true })
    .first()
    .boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(box.y + box.height).toBeLessThanOrEqual(pinned.y);
}

test.describe("on a tablet, Save updates is pinned to the bottom", () => {
  test.use({ viewport: { width: 768, height: 800 } });

  test("a refused save brings its reason into view below the top bar", async ({
    page,
  }) => {
    await editSentMessage(page);
    await page.route("**/api/sends/*", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 409,
            json: { code: "EDIT_BLOCKED", error: "Blocked for the test." },
          })
        : route.fallback(),
    );
    await page.evaluate(() =>
      scrollTo({ top: document.documentElement.scrollHeight }),
    );
    await page
      .locator("[data-edit-save]")
      .filter({ visible: true })
      .first()
      .click();
    const alert = page.getByRole("alert").filter({
      hasText: "Couldn’t update the message",
    });
    await expect(alert).toBeVisible();
    await expectClearOfBars(
      page,
      "section[aria-labelledby='edit-heading'] [role='alert']",
    );
  });

  test("a save brings the update results into view below the top bar", async ({
    page,
  }) => {
    await editSentMessage(page);
    await page.evaluate(() =>
      scrollTo({ top: document.documentElement.scrollHeight }),
    );
    await page
      .locator("[data-edit-save]")
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByText("Updated", { exact: true })).toBeVisible();
    await expectClearOfBars(
      page,
      "section[aria-labelledby='edit-heading'] h3:text-is('Update results')",
    );
  });
});
