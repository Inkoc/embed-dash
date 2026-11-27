import { expect, test } from "@playwright/test";
test("shows the connected bot from Discord through the real server", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toContainText(
    "Bot Walking Skeleton Bot",
  );
});
