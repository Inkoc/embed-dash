import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("message JSON imports into the preview and dialogs fit both themes and widths", async ({
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
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start from an example" }).click();
  const trigger = page.getByRole("button", {
    name: "Import JSON",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Import message JSON" });
  const json = dialog.getByLabel("Message JSON");
  await expect(json).toBeFocused();
  await page.keyboard.type("{");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Invalid JSON");
  await json.fill(
    JSON.stringify({
      messages: [
        {
          data: {
            content: "Community evening",
            embeds: [
              { title: "Doors at six", description: "Everyone is welcome." },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Visit",
                    url: "https://example.com",
                  },
                ],
              },
            ],
          },
        },
      ],
    }),
  );
  await dialog.getByRole("button", { name: "Replace draft" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Replace the current draft?",
  });
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(confirmation).toBeHidden();
  const result = page.locator("#json-result");
  await expect(result).toBeFocused();
  await expect(page.getByLabel("Button label", { exact: true })).toHaveValue(
    "Visit",
  );
  await expect(result).not.toContainText("Unsupported");
  await expect(page.getByRole("button", { name: "Replace draft" })).toHaveCount(
    0,
  );
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await expect(result).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByTestId("preview-embed")).toContainText("Doors at six");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const exported = page.getByRole("dialog", { name: "Export message JSON" });
  await expect(exported.getByLabel("Message JSON")).toHaveValue(
    /Community evening/,
  );
  const download = page.waitForEvent("download");
  await exported.getByRole("button", { name: "Download JSON" }).click();
  expect((await download).suggestedFilename()).toBe("message.json");
  expect(errors).toEqual([]);
});
