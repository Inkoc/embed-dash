import { date } from "./presentation";
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { DraftProvider } from "../compose/draft";
import type { HistoryDetail } from "@embed-dash/shared";
import HistoryView, { HistoryList } from "./HistoryView";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show(path = "/history") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <HistoryList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
test("history has a loading skeleton", () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  show();
  expect(screen.getByRole("status")).toHaveTextContent("Loading history");
});
test("empty history offers a first composition", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ entries: [], hasMore: false, destinations: [] }),
  );
  show();
  expect(
    await screen.findByRole("link", { name: "Compose your first message" }),
  ).toHaveAttribute("href", "/");
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "absent" },
  });
  expect(await screen.findByText("No matching sends")).toBeVisible();
});
test("failed history can be retried", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValue(
      Response.json({ entries: [], hasMore: false, destinations: [] }),
    );
  vi.stubGlobal("fetch", fetcher);
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t load history: embed-dash didn’t answer.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Your history starts here")).toBeVisible();
});
test("history rows show title, date, channels and result", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      entries: [
        {
          id: "send",
          title: "Release notes",
          color: "#0d9488",
          createdAt: 1,
          channelCount: 2,
          status: "partial",
        },
      ],
      hasMore: true,
      destinations: [],
    }),
  );
  show();
  const link = await screen.findByRole("link", { name: /Release notes/ });
  expect(link).toHaveTextContent("2 channels");
  expect(link).toHaveTextContent("Partial");
  screen.getByRole("searchbox").focus();
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "ArrowDown" });
  expect(link).toHaveFocus();
  fireEvent.keyDown(link, { key: "ArrowUp" });
  expect(screen.getByRole("searchbox")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("invalid date ranges stay beside To and never reach the server", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ entries: [], hasMore: false, destinations: [] }),
  );
  vi.stubGlobal("fetch", fetcher);
  show();
  await screen.findByText("Your history starts here");
  fireEvent.change(screen.getByLabelText(/^From \(/), {
    target: { value: "2026-12-20" },
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText(/^Through \(/), {
    target: { value: "2026-11-01" },
  });
  const to = screen.getByLabelText(/^Through \(/);
  expect(to).toHaveAttribute("aria-invalid", "true");
  expect(to).toHaveAccessibleDescription(
    "✗ The start date must be on or before the end date.",
  );
  expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
  fireEvent.change(to, { target: { value: "2026-12-21" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(to).not.toHaveAttribute("aria-invalid");
});

test("an invalid date range in the URL does not fetch", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  show("/history?from=2026-12-20&to=2026-11-01");
  expect(screen.getByLabelText(/^Through \(/)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByRole("button", { name: /Hide filters/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(fetcher).not.toHaveBeenCalled();
});

test("secondary filters disclose their active count", () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  show("/history?status=failed&q=release");
  const toggle = screen.getByRole("button", { name: "Filters 1 active" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test.each([1, 2])(
  "pagination only appears when needed on page %i",
  async (page) => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        entries: [
          {
            id: "send",
            title: "Release notes",
            color: "",
            createdAt: 1,
            channelCount: 1,
            status: "done",
          },
        ],
        hasMore: false,
        destinations: [],
      }),
    );
    show(`/history?page=${page}`);
    await screen.findByRole("link", { name: /Release notes/ });
    const pagination = screen.queryByRole("navigation", {
      name: "History pages",
    });
    if (page === 1) expect(pagination).not.toBeInTheDocument();
    else expect(pagination).toBeInTheDocument();
  },
);

test("history list flags update failures independently of successful delivery", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      entries: [
        {
          id: "entry",
          title: "Evening bulletin",
          color: "",
          createdAt: 1,
          channelCount: 2,
          status: "done",
          updateFailureCount: 1,
        },
      ],
      hasMore: false,
      destinations: [],
    }),
  );
  show();
  const entry = await screen.findByRole("link", { name: /Evening bulletin/ });
  expect(entry).toHaveTextContent("All sent");
  expect(entry).toHaveTextContent("1 copy not updated");
});

const delivery = (id: string, channelName: string) => ({
  id,
  guildId: "guild",
  guildName: "Observatory",
  channelId: id,
  channelName,
  status: "sent" as const,
  messageId: id + "-message",
  error: null,
});
const historyDetail: HistoryDetail = {
  id: "entry",
  status: "done",
  createdAt: 1,
  lastEditedAt: 2,
  payload: {
    content: "Latest saved edition",
    embeds: [],
    attachments: [],
    pings: [],
    silent: false,
  },
  targets: [
    delivery("one", "news"),
    delivery("two", "schedule"),
    delivery("three", "archive"),
    delivery("four", "general"),
  ],
  edit: {
    id: "run",
    status: "done",
    targets: [
      {
        ...delivery("one", "news"),
        status: "failed",
        error: {
          code: "MISSING_PERMISSION",
          message: "Check the bot’s access, then retry.",
        },
      },
      {
        ...delivery("two", "schedule"),
        status: "failed",
        error: {
          code: "EDIT_UNCONFIRMED",
          message: "The update was not confirmed. Retry safely.",
        },
      },
      {
        ...delivery("three", "archive"),
        status: "failed",
        error: { code: "MESSAGE_DELETED", message: "This copy was deleted." },
      },
      delivery("four", "general"),
    ],
  },
};
function showDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["session"], { csrfToken: "history-csrf" });
  render(
    <QueryClientProvider client={client}>
      <DraftProvider>
        <MemoryRouter initialEntries={["/history/entry"]}>
          <Routes>
            <Route
              path="/history/:id"
              element={<HistoryView theme="light" />}
            />
          </Routes>
        </MemoryRouter>
      </DraftProvider>
    </QueryClientProvider>,
  );
}
test("history preserves delivery outcomes, shows failed/unconfirmed/deleted updates, and retries only an eligible copy", async () => {
  const detail = structuredClone(historyDetail);
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/bot")
      return Response.json({
        id: "123456789012345678",
        name: "Observatory Bot",
        avatarUrl: null,
      });
    if (options?.method === "POST") {
      detail.edit!.targets[0] = delivery("one", "news");
      return Response.json({ id: detail.id }, { status: 202 });
    }
    return Response.json(detail);
  });
  vi.stubGlobal("fetch", fetcher);
  showDetail();
  const news = (await screen.findByText("#news")).closest("li")!;
  expect(within(news).getByText("Sent", { exact: true })).toBeVisible();
  expect(
    within(news).getByText("Not updated to the latest version"),
  ).toBeVisible();
  expect(screen.getByText("Unconfirmed", { exact: true })).toBeVisible();
  const deleted = screen.getByText("#archive").closest("li")!;
  expect(within(deleted).getByText("Deleted in Discord")).toBeVisible();
  expect(
    within(deleted).queryByRole("button", { name: /Retry update/ }),
  ).toBeNull();
  expect(screen.getAllByRole("button", { name: /Retry update/ })).toHaveLength(
    2,
  );
  expect(screen.getByText(/This is the latest saved version/)).toBeVisible();
  fireEvent.click(within(news).getByRole("button", { name: /Retry update/ }));
  expect(
    await within(news).findByText("Updated", { exact: true }),
  ).toBeVisible();
  await waitFor(() =>
    expect(news.querySelector("[id^=update-]")).toHaveFocus(),
  );
  expect(within(news).getByText("Sent", { exact: true })).toBeVisible();
  expect(
    within(news).queryByRole("button", { name: /Retry update/ }),
  ).toBeNull();
  const retry = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(retry[0]).toBe("/api/sends/entry/edits/retry");
  expect(JSON.parse(retry[1]!.body as string)).toEqual({ targetIds: ["one"] });
  expect(retry[1]!.headers).toEqual({
    "content-type": "application/json",
    "x-csrf-token": "history-csrf",
  });
});

test("history waits for a pause in typing before searching", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ entries: [], hasMore: false, destinations: [] }),
  );
  vi.stubGlobal("fetch", fetcher);
  show();
  await screen.findByText("Your history starts here");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "re" } });
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "release" },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[1]).toEqual(["/api/sends?q=release"]);
});

const row = (id: string, title: string) => ({
  id,
  title,
  color: "",
  createdAt: 1,
  channelCount: 1,
  status: "done",
});
const listing = (entries: ReturnType<typeof row>[]) => ({
  entries,
  hasMore: false,
  destinations: [],
});
test("a disappearing cursor row falls back to the first result for Tab", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", async (url: string) =>
    Response.json(
      listing(
        url.includes("q=patch")
          ? [row("patch", "Patch")]
          : [row("one", "First"), row("two", "Second")],
      ),
    ),
  );
  show();
  await screen.findByRole("link", { name: /Second/ });
  const search = screen.getByRole("searchbox");
  search.focus();
  await user.keyboard("{ArrowDown}{ArrowDown}");
  expect(screen.getByRole("link", { name: /Second/ })).toHaveFocus();
  search.focus();
  await user.type(search, "patch");
  const patch = await screen.findByRole("link", { name: /Patch/ });
  expect(patch).toHaveAttribute("tabindex", "0");
  for (let n = 0; n < 12 && document.activeElement !== patch; n++)
    await user.tab();
  expect(patch).toHaveFocus();
});
test("ArrowDown during debounce waits for matching results before focusing", async () => {
  const user = userEvent.setup();
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", (url: string) =>
    url.includes("q=patch")
      ? new Promise<Response>((done) => {
          resolve = done;
        })
      : Promise.resolve(Response.json(listing([row("old", "Old result")]))),
  );
  show();
  await screen.findByRole("link", { name: /Old result/ });
  const search = screen.getByRole("searchbox");
  await user.type(search, "patch");
  await user.keyboard("{ArrowDown}");
  expect(search).toHaveFocus();
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  resolve(Response.json(listing([row("patch", "Patch")])));
  expect(await screen.findByRole("link", { name: /Patch/ })).toHaveFocus();
});

test("Scheduled filter requests scheduled entries and shows their due time", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      entries: [
        {
          id: "scheduled",
          title: "Planned update",
          color: "",
          status: "scheduled",
          createdAt: 1,
          scheduledAt: 1900000000000,
          channelCount: 1,
        },
      ],
      hasMore: false,
      destinations: [],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  show();
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "scheduled" },
  });
  expect(await screen.findByText("Planned update")).toBeVisible();
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some((call) =>
        String((call as unknown[])[0]).includes("status=scheduled"),
      ),
    ).toBe(true),
  );
  expect(screen.getByText(/^Due /)).toBeVisible();
});

test("cancelling a schedule confirms its due time, defaults to Keep it and restores focus", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
  let detail: HistoryDetail = {
    ...historyDetail,
    edit: null,
    lastEditedAt: null,
    status: "scheduled",
    scheduledAt: Date.now() + 3600000,
    targets: historyDetail.targets.map((t) => ({
      ...t,
      status: "pending",
      messageId: null,
    })),
  };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/bot")
      return Response.json({ id: "bot", name: "Bot", avatarUrl: null });
    if (options?.method === "DELETE") {
      detail = { ...detail, status: "cancelled" };
      return new Response(null, { status: 204 });
    }
    return Response.json(detail);
  });
  vi.stubGlobal("fetch", fetcher);
  showDetail();
  expect(
    await screen.findByRole("article", { name: "Message preview" }),
  ).toHaveTextContent(date(detail.scheduledAt!));
  const trigger = await screen.findByRole("button", {
    name: "Cancel scheduled send",
  });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", {
    name: "Cancel this scheduled send?",
  });
  expect(within(dialog).getByRole("button", { name: "Keep it" })).toHaveFocus();
  expect(dialog).toHaveTextContent("will not be delivered");
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
  expect(trigger).toHaveFocus();
  expect(
    fetcher.mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(trigger);
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Cancel scheduled send" }),
  );
  expect(await screen.findByText("Cancelled before delivery.")).toBeVisible();
  expect(screen.queryByText(/^Due /)).toBeNull();
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "DELETE"),
  ).toHaveLength(1);
});

test.each([
  { postFailed: true, publishFailed: true, label: "Partial" },
  { postFailed: true, publishFailed: false, label: "Partial" },
  { postFailed: false, publishFailed: true, label: "All sent" },
])(
  "History keeps delivery primary for $postFailed / $publishFailed",
  async ({ postFailed, publishFailed, label }) => {
    const detail: HistoryDetail = {
      ...historyDetail,
      edit: null,
      lastEditedAt: null,
      status: postFailed ? "partial" : "done",
      targets: [
        {
          ...delivery("one", "announcements"),
          publishStatus: publishFailed ? "failed" : "published",
          publishError: publishFailed ? "Publication refused." : null,
        },
        {
          ...delivery("two", "general"),
          status: postFailed ? "failed" : "sent",
          messageId: postFailed ? null : "message-two",
          error: postFailed
            ? { code: "MISSING_PERMISSION", message: "Posting refused." }
            : null,
        },
      ],
    };
    vi.stubGlobal("fetch", async (url: string) => {
      if (url === "/api/bot")
        return Response.json({ id: "bot", name: "Test bot", avatarUrl: null });
      if (url.startsWith("/api/sends/entry")) return Response.json(detail);
      return Response.json({
        entries: [
          {
            id: "entry",
            title: "Mixed outcomes",
            color: "",
            createdAt: 1,
            channelCount: 2,
            status: detail.status,
            publishFailureCount: publishFailed ? 1 : 0,
          },
        ],
        hasMore: false,
        destinations: [],
      });
    });
    show();
    const entry = await screen.findByRole("link", { name: /Mixed outcomes/ });
    expect(entry).toHaveTextContent(label);
    expect(entry).not.toHaveTextContent("Sent · publish failed");
    expect(entry.textContent?.includes("1 not published")).toBe(publishFailed);
    cleanup();
    showDetail();
    const heading = await screen.findByRole("heading", {
      name: "Channel results",
    });
    expect(heading.parentElement).toHaveTextContent(`${label} · 2 channels`);
    const results = heading.closest("section")!;
    expect(
      within(results).queryByText(/Some announcements were not published/) !==
        null,
    ).toBe(publishFailed);
    expect(within(results).queryByText("Posting refused.") !== null).toBe(
      postFailed,
    );
  },
);
