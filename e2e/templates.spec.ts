import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("a template saved from Compose survives a cleared draft and loads back with its file", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  // A name no other spec uses, since specs share one server.
  const name = `Event night ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Title", { exact: true }).fill("Event night");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Doors open at 20:00 UTC.");
  await page.getByLabel("Files to attach").setInputFiles({
    name: "poster.png",
    mimeType: "image/png",
    buffer: pixel,
  });
  await expect(
    page.getByRole("list", { name: "Attached files" }),
  ).toContainText("poster.png");

  await page.getByRole("button", { name: "Save as template" }).click();
  const save = page.getByRole("dialog", { name: "Save as template" });
  await expect(save.getByLabel("Template name")).toHaveValue("Event night");
  await save.getByLabel("Template name").fill(name);
  await save.getByLabel("Template name").press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Saved as template" }),
  ).toContainText(name);

  // Clearing lets go of the draft's files, but the template keeps its own.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Clear draft" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Templates" })
    .click();
  const row = page.getByRole("listitem", { name });
  await expect(row).toContainText("1 embed · 1 file · Updated");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await row.getByRole("button", { name: "Start a message" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Compose", exact: true }),
  ).toBeFocused();
  await expect(page.getByText(`Started from template ${name}.`)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Event night",
  );
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Doors open at 20:00 UTC.",
  );
  const files = page.getByRole("list", { name: "Attached files" });
  await expect(files).toContainText("poster.png");
  await expect(files).not.toContainText("No longer on the server");
  expect(errors).toEqual([]);
});
