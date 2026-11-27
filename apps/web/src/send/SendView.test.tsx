// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Guild, GuildsResponse } from "@embed-dash/shared";
import { DraftProvider } from "../compose/draft";
import { SelectionProvider } from "./selection";
import { SendView } from "./SendView";

const bot = { id: "42", name: "Lamplighter", avatarUrl: null };
const guild = (id: string, name: string, channels: string[]): Guild => ({
  id,
  name,
  iconUrl: null,
  mainChannelId: `${id}0`,
  channels: channels.map((channel, i) => ({
    id: `${id}${i}`,
    name: channel,
    kind: i === 1 ? "announcement" : "text",
    missing: channel === "staff" ? ["viewChannel"] : [],
  })),
});
const listing = (guilds: Guild[]): GuildsResponse => ({
  guilds,
  unavailable: [],
  fetchedAt: "2026-11-27T10:00:00.000Z",
});

function stub(guilds: Response[]) {
  const fetcher = vi.fn((url: string) => {
    if (url === "/api/bot") return Promise.resolve(Response.json(bot));
    const next = guilds.shift();
    return next ? Promise.resolve(next) : new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function renderSend() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <DraftProvider>
          <SelectionProvider>
            <SendView />
          </SelectionProvider>
        </DraftProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows a skeleton while the servers load", () => {
  stub([]);
  renderSend();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Listing the bot’s servers and channels…",
  );
});

test("a failed listing explains itself and retries with a fresh list", async () => {
  const fetcher = stub([
    Response.json(
      {
        code: "DISCORD_UNAVAILABLE",
        error: "Discord is temporarily unavailable.",
      },
      { status: 502 },
    ),
    Response.json(listing([guild("1", "Lanternfall", ["general"])])),
  ]);
  renderSend();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Discord is temporarily unavailable.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("checkbox", { name: "general" }),
  ).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith("/api/guilds?refresh=1");
});

test("a bot in no servers offers its invite link", async () => {
  stub([Response.json(listing([]))]);
  renderSend();
  await screen.findByText("The bot isn’t in any servers yet");
  expect(
    await screen.findByRole("link", { name: /Invite the bot/ }),
  ).toHaveAttribute(
    "href",
    "https://discord.com/oauth2/authorize?client_id=42&scope=bot&permissions=52224",
  );
});

test("ticks, selects all in a server, and keeps keyboard focus in the list", async () => {
  stub([
    Response.json(
      listing([
        guild("1", "Lanternfall", ["general", "news", "staff"]),
        guild("2", "Saltmarsh", ["edits"]),
      ]),
    ),
  ]);
  renderSend();
  const general = await screen.findByRole("checkbox", { name: "general" });
  const tray = screen.getByRole("complementary", { name: "Tray" });
  expect(tray).toHaveTextContent("Nothing ticked yet");

  // Only one entry is in the tab order; arrows move between entries.
  expect(general).toHaveAttribute("tabindex", "0");
  general.focus();
  fireEvent.keyDown(general, { key: "ArrowDown" });
  const news = screen.getByRole("checkbox", { name: "news" });
  expect(news).toHaveFocus();
  fireEvent.keyDown(news, { key: "Enter" });
  expect(news).toBeChecked();
  expect(tray).toHaveTextContent("1 channel in 1 server");

  // Select all skips the channel the bot can't post in, then turns into Clear.
  const drawer = screen.getByRole("region", { name: "Lanternfall" });
  fireEvent.click(
    within(drawer).getByRole("button", { name: "Select all in Lanternfall" }),
  );
  expect(tray).toHaveTextContent("2 channels in 1 server");
  expect(screen.getByRole("checkbox", { name: "staff" })).not.toBeChecked();
  fireEvent.click(
    within(drawer).getByRole("button", { name: "Clear in Lanternfall" }),
  );
  expect(tray).toHaveTextContent("Nothing ticked yet");

  fireEvent.click(screen.getByRole("button", { name: /All postable/ }));
  expect(tray).toHaveTextContent("3 channels in 2 servers");

  // Collapsing a drawer hides its entries.
  const toggle = within(drawer).getByRole("button", {
    name: /Lanternfall/,
    expanded: true,
  });
  fireEvent.click(toggle);
  expect(screen.queryByRole("checkbox", { name: "general" })).toBeNull();
});

test("no search hits says so and clears in one step", async () => {
  stub([Response.json(listing([guild("1", "Lanternfall", ["general"])]))]);
  renderSend();
  const search = await screen.findByLabelText("Find channels");
  fireEvent.change(search, { target: { value: "zzz" } });
  expect(
    await screen.findByText(/No channel or server matches/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Clear search" })[0]);
  expect(
    await screen.findByRole("checkbox", { name: "general" }),
  ).toBeInTheDocument();
});

test("a full tray groups slips by server, folds the overflow, and takes slips out", async () => {
  const names = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);
  stub([
    Response.json(
      listing([
        guild("1", "Lanternfall", names("story", 9)),
        guild("2", "Saltmarsh", names("edit", 5)),
      ]),
    ),
  ]);
  renderSend();
  fireEvent.click(await screen.findByRole("button", { name: /All postable/ }));
  const tray = screen.getByRole("complementary", { name: "Tray" });
  expect(tray).toHaveTextContent("14 channels in 2 servers");
  expect(within(tray).getAllByRole("heading", { level: 4 })).toHaveLength(2);
  expect(within(tray).getAllByRole("listitem")).toHaveLength(12);
  fireEvent.click(
    within(tray).getByRole("button", { name: "+ 2 more · Show" }),
  );
  expect(within(tray).getAllByRole("listitem")).toHaveLength(14);

  fireEvent.click(
    within(tray).getByRole("button", {
      name: "Take #story-1 (Lanternfall) out of the tray",
    }),
  );
  expect(tray).toHaveTextContent("13 channels in 2 servers");
  expect(screen.getByRole("checkbox", { name: "story-1" })).not.toBeChecked();
  // Focus moves to the next slip instead of falling back to the page.
  expect(
    within(tray).getByRole("button", {
      name: "Take #story-2 (Lanternfall) out of the tray",
    }),
  ).toHaveFocus();
});
