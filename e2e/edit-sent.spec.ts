import AxeBuilder from "@axe-core/playwright";
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
    page.getByRole("heading", { name: "Edit sent message" }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Send", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save as template", exact: true }),
  ).toHaveCount(0);
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
  await expect(page.getByText("Updated", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  // The failed copy's reason and Retry sit on the results' deep ink in both themes.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      colorScheme,
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search history" })
    .fill(`${title} revised`);
  const entry = page.getByRole("link", { name: new RegExp(title) });
  await expect(entry).toContainText("1 copy not updated");
  await expect(entry).toContainText("All sent");
  await entry.click();
  await expect(page.getByText(/Last edited/)).toBeVisible();
  const failedCopy = page
    .getByRole("listitem")
    .filter({ has: page.getByText("#news", { exact: true }) });
  await expect(failedCopy).toContainText("Delivery: Sent");
  await expect(failedCopy).toContainText("Not updated to the latest version");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(page.getByText("Updated", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search history" }).fill(title);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await failedCopy
    .getByRole("button", { name: "Retry update to #news" })
    .click();
  await expect(failedCopy).toContainText("Latest update: Updated");
  await expect(
    failedCopy.getByRole("button", { name: /Retry update/ }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Back to history/ }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(title) }),
  ).not.toContainText("copy not updated");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(
    page.getByRole("article", { name: "Message preview" }),
  ).toContainText(`${title} revised`);
});
