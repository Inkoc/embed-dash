import { expect, test } from "@playwright/test";

test("edit a history message across two channels", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const title = `Observatory update ${Date.now()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("link", { name: "Send", exact: true }).click();
  const region = page.getByRole("region", {
    name: "Lanternfall Cup EU",
    exact: true,
  });
  await region.getByRole("checkbox", { name: "news", exact: true }).check();
  await region
    .getByRole("checkbox", { name: "match-schedule", exact: true })
    .check();
  await page
    .getByRole("complementary", { name: "Tray" })
    .getByRole("button", { name: "Send to 2 channels", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 2 channels", exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Tray" })
      .getByText("Sent", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search history" }).fill(title);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Original channels" }),
  ).toContainText("#news");
  await expect(
    page.getByRole("list", { name: "Original channels" }),
  ).toContainText("#match-schedule");
  await page.getByLabel("Title", { exact: true }).fill(`${title} revised`);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Leave unsaved edits?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Save updates", exact: true }).click();
  await expect(page.getByText("Updated", { exact: true })).toHaveCount(2);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search history" })
    .fill(`${title} revised`);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByText(/Last edited/)).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Message preview" }),
  ).toContainText(`${title} revised`);
});
