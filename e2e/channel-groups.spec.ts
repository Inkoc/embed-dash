import { expect, test } from "@playwright/test";

test("a saved channel group ticks its channels again after the selection is cleared", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  // A name no other spec uses, since specs share one server.
  const name = `Cup desk ${Date.now()}`;
  await page.goto("/send");
  const cup = page.getByRole("region", {
    name: "Lanternfall Cup EU",
    exact: true,
  });
  await cup.getByRole("checkbox", { name: "news" }).check();
  await cup.getByRole("checkbox", { name: "match-schedule" }).check();
  const tray = page.getByRole("complementary", { name: "Tray" });
  await expect(tray).toContainText("2 channels in 1 server");

  await page.getByRole("button", { name: "Save as group" }).click();
  const save = page.getByRole("dialog", {
    name: "Save the ticked channels as a group",
  });
  await expect(save.getByLabel("Group name")).toHaveValue("Lanternfall Cup EU");
  await save.getByLabel("Group name").fill(name);
  await save.getByRole("button", { name: "Save group" }).click();
  await expect(save).toBeHidden();
  await expect(page.getByText(`Saved ${name} with 2 channels.`)).toBeVisible();

  await page.getByRole("button", { name: /^Clear/ }).click();
  await expect(tray).toContainText("Nothing ticked yet");

  // Saved on the server: a reload still offers it.
  await page.reload();
  await page
    .getByRole("button", { name: new RegExp(`^${name}\\s*\\(2 channels\\)$`) })
    .click();
  await expect(tray).toContainText("2 channels in 1 server");
  await expect(cup.getByRole("checkbox", { name: "news" })).toBeChecked();
  await expect(
    cup.getByRole("checkbox", { name: "match-schedule" }),
  ).toBeChecked();
  await expect(page.getByText(`Added 2 channels from ${name}.`)).toBeVisible();
  expect(errors).toEqual([]);
});
