// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { HistoryList } from "./HistoryView";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
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
    "History could not be loaded",
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
