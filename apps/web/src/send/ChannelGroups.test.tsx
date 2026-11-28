// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ChannelGroup, GuildsResponse } from "@embed-dash/shared";
import { ChannelGroups } from "./ChannelGroups";

const cup = { id: "1219034477380055040", name: "Lanternfall Cup EU" };
const community = { id: "1103482915562045440", name: "Lanternfall Community" };
const listing: GuildsResponse = {
  fetchedAt: "2026-11-28T10:00:00.000Z",
  unavailable: [],
  guilds: [
    {
      ...community,
      iconUrl: null,
      mainChannelId: "201",
      channels: [
        { id: "201", name: "announcements", kind: "announcement", missing: [] },
        {
          id: "202",
          name: "moderators",
          kind: "text",
          missing: ["sendMessages"],
        },
      ],
    },
    {
      ...cup,
      iconUrl: null,
      mainChannelId: "101",
      channels: [
        { id: "101", name: "news", kind: "text", missing: [] },
        { id: "102", name: "results", kind: "text", missing: [] },
      ],
    },
  ],
};
const entry = (
  id: string,
  name: string,
  guild: { id: string; name: string },
) => ({ id, name, guildId: guild.id, guildName: guild.name });
const cupGroup: ChannelGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Cup EU",
  updatedAt: "2026-11-27T10:00:00.000Z",
  channels: [
    entry("101", "news", cup),
    entry("102", "results", cup),
    entry("103", "brackets", cup),
    entry("202", "moderators", community),
  ],
};

type Call = { url: string; method: string; body?: unknown };

function serve(
  initial: ChannelGroup[],
  { listStatus = 200 }: { listStatus?: number } = {},
) {
  let groups = [...initial];
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (method === "GET")
        return listStatus === 200
          ? Response.json(groups)
          : Response.json({ error: "Request failed" }, { status: listStatus });
      const all = listing.guilds.flatMap((g) =>
        g.channels.map((c) => entry(c.id, c.name, g)),
      );
      const channels = (ids: string[]) =>
        ids.map((id) => all.find((c) => c.id === id)!);
      if (method === "POST") {
        const created: ChannelGroup = {
          id: "22222222-2222-4222-8222-222222222222",
          name: body.name,
          updatedAt: "2026-11-28T10:00:00.000Z",
          channels: channels(body.channelIds),
        };
        groups = [...groups, created];
        return Response.json(created, { status: 201 });
      }
      const id = url.split("/").pop();
      if (method === "PATCH") {
        const found = groups.find((g) => g.id === id)!;
        const changed = {
          ...found,
          ...(body.name && { name: body.name }),
          ...(body.channelIds && { channels: channels(body.channelIds) }),
        };
        groups = groups.map((g) => (g.id === id ? changed : g));
        return Response.json(changed);
      }
      groups = groups.filter((g) => g.id !== id);
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

function Harness({ initial }: { initial: string[] }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    new Set(initial),
  );
  const ticked = listing.guilds.flatMap((g) =>
    g.channels
      .filter((c) => selected.has(c.id))
      .map((c) => ({ id: c.id, guildId: g.id, guildName: g.name })),
  );
  return (
    <>
      <p data-testid="selected">{[...selected].sort().join(",")}</p>
      <ChannelGroups
        listing={listing}
        ticked={ticked}
        selected={selected}
        locked={false}
        setSelected={setSelected}
      />
    </>
  );
}

function renderGroups(initial: string[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["session"], { csrfToken: "token" });
  return render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

const selected = () => screen.getByTestId("selected").textContent;

beforeEach(() => {
  // jsdom has no modal dialogs; these stand in, including the close event the app listens for.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows a still placeholder while the groups load", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  renderGroups();
  expect(screen.getByText("Loading channel groups…")).toHaveAttribute(
    "role",
    "status",
  );
});

test("a failed load says why and retries", async () => {
  const calls = serve([cupGroup], { listStatus: 500 });
  renderGroups();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t load channel groups: the server had a problem.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
});

test("with no groups it explains them, and saving waits for a ticked channel", async () => {
  serve([]);
  renderGroups();
  expect(
    await screen.findByText(
      "Tick channels, then save them as a group to tick them again in one step.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save as group" })).toBeDisabled();
});

test("saves the ticked channels under a name, suggesting the server's when there is one", async () => {
  const calls = serve([]);
  renderGroups(["101", "102"]);
  fireEvent.click(await screen.findByRole("button", { name: "Save as group" }));
  const dialog = screen.getByRole("dialog", {
    name: "Save the ticked channels as a group",
  });
  expect(dialog).toHaveTextContent("2 channels in 1 server.");
  const name = within(dialog).getByLabelText("Group name");
  expect(name).toHaveValue("Lanternfall Cup EU");
  fireEvent.change(name, { target: { value: "" } });
  fireEvent.blur(name);
  expect(dialog).toHaveTextContent("Give the group a name.");
  fireEvent.change(name, { target: { value: "Cup results" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save group" }));
  expect(
    await screen.findByText("Saved Cup results with 2 channels."),
  ).toBeInTheDocument();
  expect(calls.find((c) => c.method === "POST")).toEqual({
    url: "/api/channel-groups",
    method: "POST",
    body: { name: "Cup results", channelIds: ["101", "102"] },
  });
  expect(
    screen.getByRole("button", { name: /^Cup results\s*\(2 channels\)$/ }),
  ).toBeInTheDocument();
});

test("selecting a group adds its available channels, says what it skipped, and can be undone", async () => {
  serve([cupGroup]);
  renderGroups(["201", "101"]);
  const pick = await screen.findByRole("button", {
    // jsdom and browsers space the hidden part differently.
    name: /^Cup EU\s*\(2 channels, 2 unavailable\)$/,
  });
  fireEvent.click(pick);
  expect(selected()).toBe("101,102,201");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Added 1 channel from Cup EU. 1 was already ticked. 2 unavailable channels were skipped.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(selected()).toBe("101,201");
  expect(screen.getByRole("status")).toHaveTextContent(
    "The selection is back to what it was.",
  );
  fireEvent.click(pick);
  fireEvent.click(pick);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Every available channel in Cup EU was already ticked. 2 unavailable channels were skipped.",
  );
});

test("a group's dialog names its unavailable channels with the reason, and adds the rest", async () => {
  serve([cupGroup]);
  renderGroups();
  fireEvent.click(
    await screen.findByRole("button", { name: "Open group Cup EU" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Cup EU" });
  expect(dialog).toHaveTextContent(
    "4 channels in 2 servers; 2 are unavailable and will be skipped.",
  );
  const list = within(dialog).getByRole("list", {
    name: "Channels in Cup EU",
  });
  const rows = within(list).getAllByRole("listitem");
  expect(rows.map((row) => row.textContent)).toEqual([
    "#newsLanternfall Cup EU",
    "#resultsLanternfall Cup EU",
    "#bracketsLanternfall Cup EUUnavailable: Channel no longer exists",
    "#moderatorsLanternfall CommunityUnavailable: Bot is missing Send Messages here",
  ]);
  // Nothing ticked: there is nothing to update the group from.
  expect(
    within(dialog).getByRole("button", { name: /Update from selection/ }),
  ).toBeDisabled();
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Add 2 channels to the selection",
    }),
  );
  expect(selected()).toBe("101,102");
  expect(screen.queryByRole("dialog", { name: "Cup EU" })).toBeNull();
});

test("renames a group, updates it from the selection after asking, and deletes it after asking", async () => {
  const calls = serve([cupGroup]);
  renderGroups(["201"]);
  fireEvent.click(
    await screen.findByRole("button", { name: "Open group Cup EU" }),
  );
  let dialog = screen.getByRole("dialog", { name: "Cup EU" });

  fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
  const rename = screen.getByRole("dialog", { name: "Rename Cup EU" });
  fireEvent.change(within(rename).getByLabelText("Group name"), {
    target: { value: "Cup EU news" },
  });
  fireEvent.click(within(rename).getByRole("button", { name: "Rename" }));
  dialog = await screen.findByRole("dialog", { name: "Cup EU news" });
  expect(calls.at(-1)).toMatchObject({
    method: "PATCH",
    url: `/api/channel-groups/${cupGroup.id}`,
    body: { name: "Cup EU news" },
  });

  fireEvent.click(
    within(dialog).getByRole("button", { name: /Update from selection/ }),
  );
  const replace = screen.getByRole("dialog", {
    name: "Update Cup EU news from the selection?",
  });
  expect(replace).toHaveTextContent(
    "It will hold the 1 channel ticked now, in 1 server, instead of its 4 channels.",
  );
  fireEvent.click(
    within(replace).getByRole("button", { name: "Update group" }),
  );
  expect(
    await screen.findByText("Updated Cup EU news: it now holds 1 channel."),
  ).toBeInTheDocument();
  expect(calls.at(-1)).toMatchObject({
    method: "PATCH",
    body: { channelIds: ["201"] },
  });
  expect(dialog).toHaveTextContent("1 channel in 1 server.");

  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  const confirm = screen.getByRole("dialog", { name: "Delete Cup EU news?" });
  // Cancel is the safe answer and comes first.
  fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
  expect(calls.at(-1)?.method).toBe("PATCH");
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  fireEvent.click(
    within(
      screen.getByRole("dialog", { name: "Delete Cup EU news?" }),
    ).getByRole("button", { name: "Delete group" }),
  );
  expect(
    await screen.findByText("Deleted the group Cup EU news."),
  ).toBeInTheDocument();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
  expect(screen.getByRole("button", { name: "Save as group" })).toHaveFocus();
  expect(screen.queryByRole("button", { name: /Open group/ })).toBeNull();
  expect(selected()).toBe("201");
});
