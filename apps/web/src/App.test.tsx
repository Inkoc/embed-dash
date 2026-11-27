// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function renderApp() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App />
    </QueryClientProvider>,
  );
}
test("shows connection progress followed by bot identity", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  renderApp();
  expect(screen.getByRole("status").textContent).toContain("Connecting");
  finish(
    Response.json({
      id: "123",
      name: "Test bot",
      avatarUrl: "https://cdn.discordapp.com/test.png",
    }),
  );
  expect((await screen.findByText("Test bot")).textContent).toBe("Test bot");
  expect(screen.getByText("Bot ID: 123")).toBeTruthy();
});
test("provides a working retry after a failed connection", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("", { status: 502 }))
    .mockResolvedValueOnce(
      Response.json({ id: "123", name: "Recovered bot", avatarUrl: null }),
    );
  vi.stubGlobal("fetch", fetcher);
  renderApp();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Unable to connect",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
  expect(await screen.findByText("Recovered bot")).toBeTruthy();
});
