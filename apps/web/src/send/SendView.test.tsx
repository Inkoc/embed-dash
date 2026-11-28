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
import type { ChannelGroup, Guild, GuildsResponse } from "@embed-dash/shared";
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

/** What the groups API answers with; most tests have none saved. */
let savedGroups: ChannelGroup[] = [];

function stub(guilds: Response[]) {
  const fetcher = vi.fn((url: string) => {
    if (url === "/api/bot") return Promise.resolve(Response.json(bot));
    if (url === "/api/channel-groups")
      return Promise.resolve(Response.json(savedGroups));
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
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  savedGroups = [];
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
  expect(
    screen.getByText(/Couldn’t read 1 server/).closest("[role='status']"),
  ).toHaveTextContent(
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

test("forum selection exposes a required title before sending", async () => {
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
  expect(help).not.toHaveAttribute("aria-disabled");
  fireEvent.click(help);
  expect(help).toBeChecked();
  expect(screen.getByLabelText("Post title (required)")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /All postable/ }));
  const tray = screen.getByRole("complementary", { name: "Tray" });
  expect(tray).toHaveTextContent("2 channels in 1 server");
  // Only the postable channel counts toward the drawer's total.
  expect(screen.getByRole("region", { name: "Lanternfall" })).toHaveTextContent(
    "2 of 2 ticked",
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
  const dropped = await screen.findByText(/ticked channels are no longer/);
  expect(dropped.closest("[role=status]")).toHaveTextContent(
    "2 ticked channels are no longer available to the bot and were taken out of the tray.",
  );
  expect(tray).toHaveTextContent("1 channel in 1 server");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText(/no longer available to the bot/)).toBeNull();
});

const lanternGroup: ChannelGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Lantern news",
  updatedAt: "2026-11-27T10:00:00.000Z",
  channels: [
    { id: "10", name: "general", guildId: "1", guildName: "Lantern Hall" },
    { id: "11", name: "news", guildId: "1", guildName: "Lantern Hall" },
  ],
};

test("when a refresh finds no readable server, saved groups stay to inspect, with every channel unavailable", async () => {
  savedGroups = [lanternGroup];
  stub([
    Response.json(listing([guild("1", "Lantern Hall", ["general", "news"])])),
    Response.json({
      ...listing([]),
      unavailable: [{ id: "1", name: "Lantern Hall" }],
    }),
  ]);
  renderSend();
  const pick = await screen.findByRole("button", {
    name: /^Lantern news\s*\(2 channels\)$/,
  });
  expect(pick).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Save as group" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("None of the bot’s servers could be read");
  const closed = screen.getByRole("button", {
    name: /^Lantern news\s*\(2 channels, all unavailable\)$/,
  });
  expect(closed).toBeDisabled();
  expect(
    screen.getByText(
      "None of the groups’ channels can be posted to right now. Open a group with ⋯ to see why, rename it or delete it.",
    ),
  ).toBeInTheDocument();
  // Nothing to tick, so nothing to save.
  expect(screen.queryByRole("button", { name: "Save as group" })).toBeNull();

  fireEvent.click(
    screen.getByRole("button", { name: "Open group Lantern news" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Lantern news" });
  expect(dialog).toHaveTextContent(
    "2 channels in 1 server; 2 are unavailable and will be skipped.",
  );
  expect(
    within(dialog).getAllByText("The bot couldn’t read this server"),
  ).toHaveLength(2);
  expect(within(dialog).getByRole("button", { name: "Rename" })).toBeEnabled();
  expect(within(dialog).getByRole("button", { name: "Delete" })).toBeEnabled();
  expect(
    within(dialog).getByRole("button", {
      name: "Add 0 channels to the selection",
    }),
  ).toBeDisabled();
});

test("a bot in no servers still lists saved groups, each channel marked as out of reach", async () => {
  savedGroups = [lanternGroup];
  stub([Response.json(listing([]))]);
  renderSend();
  await screen.findByText("The bot isn’t in any servers yet");
  expect(
    await screen.findByRole("button", {
      name: /^Lantern news\s*\(2 channels, all unavailable\)$/,
    }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Open group Lantern news" }),
  );
  expect(
    within(screen.getByRole("dialog", { name: "Lantern news" })).getAllByText(
      "The bot is no longer in this server",
    ),
  ).toHaveLength(2);
  // The invite stays the way forward.
  expect(
    screen.getByRole("link", { name: /Invite the bot/ }),
  ).toBeInTheDocument();
});

test("with no groups saved, an empty listing shows only the closed catalogue", async () => {
  stub([Response.json(listing([]))]);
  renderSend();
  await screen.findByText("The bot isn’t in any servers yet");
  await vi.waitFor(() =>
    expect(screen.queryByRole("group", { name: "Groups" })).toBeNull(),
  );
});

test("forum tags and announcement publishing are labelled and editable", async () => {
  const destinations: Guild = {
    ...guild("1", "Lanternfall", []),
    channels: [
      {
        id: "10",
        name: "reports",
        kind: "forum",
        missing: [],
        requireTag: true,
        availableTags: [{ id: "123456789012345679", name: "Bug" }],
      },
      { id: "11", name: "updates", kind: "announcement", missing: [] },
    ],
  };
  stub([Response.json(listing([destinations]))]);
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "reports" }));
  const title = screen.getByLabelText("Post title (required)");
  fireEvent.blur(title);
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a post title");
  fireEvent.change(title, { target: { value: "Release report" } });
  const tag = screen.getByLabelText("Bug");
  fireEvent.click(tag);
  expect(tag).toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "updates" }));
  const publish = screen.getByLabelText(/Publish to following servers/);
  expect(publish).not.toBeChecked();
  fireEvent.click(publish);
  expect(publish).toBeChecked();
});

test("a required moderated tag explains the permission needed rather than hiding every tag", async () => {
  stub([
    Response.json(
      listing([
        {
          ...guild("1", "Lanternfall", []),
          channels: [
            {
              id: "10",
              name: "staff-posts",
              kind: "forum",
              missing: [],
              requireTag: true,
              availableTags: [
                {
                  id: "123456789012345679",
                  name: "Staff",
                  unavailable: "Requires Manage Threads",
                },
              ],
            },
          ],
        },
      ]),
    ),
  ]);
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "staff-posts" }));
  expect(
    screen.getByRole("checkbox", { name: /Staff Requires Manage Threads/ }),
  ).toBeDisabled();
  expect(
    screen.getByText(/This forum requires a tag, but none can be applied/),
  ).toBeVisible();
  expect(
    screen.getByText("Forums need a post title and may require tags."),
  ).toBeVisible();
});
