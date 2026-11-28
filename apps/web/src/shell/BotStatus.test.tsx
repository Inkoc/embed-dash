// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { BotStatus } from "./BotStatus";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(variant: "bar" | "notice", answer: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(answer));
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <BotStatus variant={variant} />
    </QueryClientProvider>,
  );
}

const refused = (code: string) => () =>
  Promise.resolve(
    Response.json({ code, error: "Fixed server wording." }, { status: 502 }),
  );

test.each([
  [
    "DISCORD_INVALID_TOKEN",
    "Not connected: token refused",
    "copy the token from the Bot page",
  ],
  [
    "DISCORD_UNREACHABLE",
    "Not connected: Discord unreachable",
    "network connection and DNS",
  ],
  [
    "DISCORD_UNAVAILABLE",
    "Not connected: Discord unavailable",
    "Discord is having problems",
  ],
])("the bar names the cause of %s", async (code, label, hint) => {
  show("bar", refused(code));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(label);
  expect(alert.textContent?.toLowerCase()).toContain(hint.toLowerCase());
  expect(alert.querySelector("p")?.title.toLowerCase()).toContain(
    hint.toLowerCase(),
  );
});

test("the notice gives the whole reason and its fix", async () => {
  show("notice", refused("DISCORD_INVALID_TOKEN"));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(
    "Not connected: Discord rejected the bot token. Copy the token from the Bot page of your application in the Discord developer portal (not the client secret or application ID)",
  );
});

test("other failures say not connected without a guessed cause", async () => {
  show("bar", () =>
    Promise.resolve(new Response("Bad gateway", { status: 502 })),
  );
  const alert = await screen.findByRole("alert");
  expect(alert.querySelector("p")?.firstChild?.textContent).toBe(
    "Not connected",
  );
  expect(alert.textContent).toContain("mbed-dash didn’t answer");
});

test("no answer at all says the app can't be reached", async () => {
  show("notice", () => Promise.reject(new TypeError("Failed to fetch")));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Not connected: embed-dash can’t be reached",
  );
});
