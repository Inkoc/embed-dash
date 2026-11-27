// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { HistoryList } from "./HistoryView";
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
  fireEvent.change(screen.getByLabelText("From (UTC)"), {
    target: { value: "2026-12-20" },
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText("To (UTC)"), {
    target: { value: "2026-11-01" },
  });
  const to = screen.getByLabelText("To (UTC)");
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
  expect(screen.getByLabelText("To (UTC)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByRole("button", { name: /Filters/ })).toHaveAttribute(
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
