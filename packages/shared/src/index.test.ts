import { expect, test } from "vitest";
import { botIdentitySchema } from "./index.js";
test("validates the public bot identity", () => {
  expect(
    botIdentitySchema.parse({ id: "123", name: "Example bot", avatarUrl: null })
      .name,
  ).toBe("Example bot");
  expect(() => botIdentitySchema.parse({ id: "", name: "" })).toThrow();
});
