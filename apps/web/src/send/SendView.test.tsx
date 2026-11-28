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
import { SendingProvider } from "./sending";
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
            <SendingProvider>
              <SendView />
            </SendingProvider>
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
  localStorage.clear();
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
    "Discord is having problems on its side.",
  );
  // The heading names what failed, so the alert doesn't repeat it.
  expect(screen.getByRole("alert")).not.toHaveTextContent("Couldn’t load");
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

test("servers the bot couldn't read are named in an announced notice", async () => {
  stub([
    Response.json({
      ...listing([guild("1", "Lantern Hall", ["general", "news"])]),
      unavailable: [
        { id: "2", name: "Old Docks" },
        { id: "3", name: "Salt Flats" },
      ],
    }),
  ]);
  renderSend();
  const notice = await screen.findByText(/Couldn’t read 2 servers/);
  expect(notice.closest("[role='status']")).toHaveTextContent(
    "Old Docks, Salt Flats",
  );
  expect(screen.getByText("general")).toBeInTheDocument();
});

test("when no server could be read, the notice stands without the no-servers invite", async () => {
  stub([
    Response.json({
      ...listing([]),
      unavailable: [{ id: "2", name: "Old Docks" }],
    }),
  ]);
  renderSend();
  expect(
    await screen.findByText("None of the bot’s servers could be read"),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Couldn’t read 1 server the bot is listed in: Old Docks.",
  );
  expect(screen.queryByText("The bot isn’t in any servers yet")).toBeNull();
  expect(screen.queryByRole("link", { name: /Invite the bot/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
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

test("forum channels are listed with a reason and can't be ticked or quick-picked", async () => {
  const forum: Guild = {
    ...guild("1", "Lanternfall", ["general", "news"]),
    channels: [
      { id: "10", name: "general", kind: "text", missing: [] },
      { id: "11", name: "help", kind: "forum", missing: [] },
    ],
  };
  stub([Response.json(listing([forum]))]);
  renderSend();
  const help = await screen.findByRole("checkbox", { name: "help" });
  expect(help).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByText("Forum posting isn’t available yet")).toBeVisible();
  fireEvent.click(help);
  expect(help).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: /All postable/ }));
  const tray = screen.getByRole("complementary", { name: "Tray" });
  expect(tray).toHaveTextContent("1 channel in 1 server");
  // Only the postable channel counts toward the drawer's total.
  expect(screen.getByRole("region", { name: "Lanternfall" })).toHaveTextContent(
    "1 of 1 ticked",
  );
});

test("a refresh drops ticked channels the bot can no longer post in and says so", async () => {
  stub([
    Response.json(
      listing([guild("1", "Lanternfall", ["general", "news", "rules"])]),
    ),
    Response.json(
      listing([
        {
          ...guild("1", "Lanternfall", ["general", "news"]),
          channels: [
            { id: "10", name: "general", kind: "text", missing: [] },
            {
              id: "11",
              name: "news",
              kind: "announcement",
              missing: ["sendMessages"],
            },
          ],
        },
      ]),
    ),
  ]);
  renderSend();
  fireEvent.click(await screen.findByRole("button", { name: /All postable/ }));
  const tray = screen.getByRole("complementary", { name: "Tray" });
  expect(tray).toHaveTextContent("3 channels in 1 server");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "2 ticked channels are no longer available to the bot and were taken out of the tray.",
  );
  expect(tray).toHaveTextContent("1 channel in 1 server");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText(/no longer available to the bot/)).toBeNull();
});
