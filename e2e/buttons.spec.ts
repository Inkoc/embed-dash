import { expect, test } from "@playwright/test";

test("link button appears in preview and the fake Discord receives its components", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByLabel("Title", { exact: true }).fill("Community links");
  await page
    .getByRole("button", { name: "Add button row", exact: true })
    .click();
  await page
    .getByLabel("Button label", { exact: true })
    .fill("Community guide");
  await page
    .getByLabel("Button URL", { exact: true })
    .fill("https://example.com/guide");
  await expect(
    page
      .getByRole("article", { name: "Message preview" })
      .getByRole("link", { name: /Community guide/ }),
  ).toHaveAttribute("href", "https://example.com/guide");
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await page
    .getByRole("region", { name: "Lanternfall Modding Guild", exact: true })
    .getByRole("checkbox", { name: "release-notes" })
    .check();
  await page
    .getByRole("complementary", { name: "Tray" })
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send to 1 channel", exact: true })
    .click();
  await expect
    .poll(async () => {
      const messages = (await (
        await page.request.get("/__test/messages")
      ).json()) as { payload: { components?: unknown } }[];
      return messages.some((message) =>
        (JSON.stringify(message.payload.components) ?? "").includes(
          "https://example.com/guide",
        ),
      );
    })
    .toBe(true);
});
