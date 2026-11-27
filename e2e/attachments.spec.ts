import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// A valid 1×1 PNG, small enough to write out in the test itself.
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("an uploaded image becomes the thumbnail and the preview shows it, also after a reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/");
  await page.getByLabel("Title", { exact: true }).fill("With a logo");

  await page.getByLabel("Files to attach").setInputFiles({
    name: "Team logo.png",
    mimeType: "image/png",
    buffer: pixel,
  });
  const list = page.getByRole("list", { name: "Attached files" });
  await expect(list).toContainText("Team_logo.png");
  await expect(list).toContainText("1 KB");

  await page.getByRole("button", { name: /^Images/ }).click();
  await page
    .getByLabel("Use an uploaded image for thumbnail")
    .selectOption("Team_logo.png");
  await expect(page.getByLabel("Thumbnail link")).toHaveValue(
    "attachment://Team_logo.png",
  );
  const thumbnail = page.getByAltText("Embed thumbnail");
  await expect(thumbnail).toHaveAttribute(
    "src",
    /\/api\/uploads\/.+\/content$/,
  );
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);

  await page.reload();
  await expect(
    page.getByRole("list", { name: "Attached files" }),
  ).toContainText("Team_logo.png");
  await expect
    .poll(() =>
      page
        .getByAltText("Embed thumbnail")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: /Remove\s+Team_logo.png/ }).click();
  await expect(page.getByRole("list", { name: "Attached files" })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test("files can be added with the keyboard and a refused file says why", async ({
  page,
}) => {
  await page.goto("/");
  const choose = page.getByRole("button", { name: "Choose files" });
  const chooser = page.waitForEvent("filechooser");
  // Focus and key press in one step: the app may still move focus while it settles.
  await choose.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(0),
  });
  await expect(page.getByRole("alert")).toContainText("empty.txt is empty");
});
