// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import { exampleDraft } from "./compose/draft";
import { DiscordPreview } from "./preview/DiscordPreview";

let systemDark = false;
const mediaListeners: ((event: { matches: boolean }) => void)[] = [];

beforeEach(() => {
  systemDark = false;
  mediaListeners.length = 0;
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark") ? systemDark : false,
    addEventListener: (_: string, listener: (typeof mediaListeners)[0]) =>
      mediaListeners.push(listener),
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const bot = { id: "123", name: "Test bot", avatarUrl: null };
function stubBot(...responses: Response[]) {
  const fetcher = vi.fn();
  for (const response of responses) fetcher.mockResolvedValueOnce(response);
  fetcher.mockResolvedValue(Response.json(bot));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function renderApp(path = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryDefaults(["session"], { staleTime: Infinity });
  client.setQueryData(["session"], {
    authenticated: true,
    insecure: false,
    csrfToken: "fixture",
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const banner = () => within(screen.getByRole("banner"));

test("shows connection progress followed by the bot in the bar and preview", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
  );
  renderApp();
  expect(banner().getByRole("status").textContent).toContain(
    "Connecting to Discord",
  );
  expect(screen.getByText("Loading the bot's name")).toBeTruthy();
  await act(async () => finish(Response.json(bot)));
  expect(await banner().findByText("Test bot")).toBeTruthy();
  expect(
    within(screen.getByRole("article", { name: "Message preview" })).getByText(
      "Test bot",
    ),
  ).toBeTruthy();
});

test("provides a working retry after a failed connection", async () => {
  stubBot(
    Response.json(
      { code: "DISCORD_UNREACHABLE", error: "Unable to reach Discord." },
      { status: 502 },
    ),
  );
  renderApp();
  const alerts = await screen.findAllByRole("alert");
  expect(alerts[0]!.textContent).toContain("Discord unreachable");
  expect(alerts[0]!.textContent).toContain("Not connected");
  expect(alerts[0]!.textContent).toContain("app can’t reach Discord");
  fireEvent.click(banner().getByRole("button", { name: "Retry connection" }));
  expect(await banner().findByText("Test bot")).toBeTruthy();
});

test("the preview shows every part of the embed in Discord's order", () => {
  const example = exampleDraft();
  render(
    <DiscordPreview
      draft={{
        ...example,
        attachments: [
          {
            id: "u1",
            filename: "mark.png",
            size: 10,
            contentType: "image/png",
          },
        ],
        embeds: [
          {
            ...example.embeds[0]!,
            image: "https://example.com/banner.png",
            thumbnail: "attachment://mark.png",
          },
        ],
      }}
      bot={undefined}
      botPending={false}
      time="Today at 18:00"
    />,
  );
  const message = screen.getByRole("article", { name: "Message preview" });
  const text = message.textContent!;
  const order = [
    "Your bot",
    "Patch 0.9.4 lands on Thursday",
    "Lanternfall Dev Team",
    "The Saltmarsh Update",
    "The marsh is open",
    "Goes live",
    "Save files",
    "Lanternfall · Patch notes",
  ].map((part) => text.indexOf(part));
  expect(
    order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]!)),
  ).toBe(true);
  expect(text).toContain("•Today at 18:00");
  expect(screen.getByAltText("Embed image")).toBeTruthy();
  expect(screen.getByAltText("Embed thumbnail").getAttribute("src")).toBe(
    "/api/uploads/u1/content",
  );
  expect(screen.getByTestId("preview-embed").getAttribute("style")).toContain(
    "#e8a33d",
  );
});

test("/ focuses a view's search when it has one", () => {
  stubBot();
  renderApp();
  const search = document.createElement("input");
  search.dataset.shortcut = "search";
  document.body.append(search);
  fireEvent.keyDown(document.body, { key: "/" });
  expect(document.activeElement).toBe(search);
  search.remove();
});

test("the theme follows the system until the operator chooses", () => {
  vi.useFakeTimers();
  systemDark = true;
  stubBot();
  renderApp();
  const html = document.documentElement;
  const toggle = screen.getByRole("switch", { name: "Dark theme" });
  expect(html.dataset.theme).toBe("dark");
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText("Discord dark")).toBeTruthy();
  act(() => mediaListeners.forEach((listener) => listener({ matches: false })));
  expect(html.dataset.theme).toBe("light");
  fireEvent.click(toggle);
  expect(html.dataset.theme).toBe("dark");
  expect(screen.getByText("Discord dark")).toBeTruthy();
  act(() => mediaListeners.forEach((listener) => listener({ matches: false })));
  expect(html.dataset.theme).toBe("dark");
  act(() => vi.advanceTimersByTime(1000));
  expect(html.classList.contains("theme-fade")).toBe(false);
});

test("reduced motion swaps the theme without a wipe", () => {
  stubBot();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  renderApp();
  fireEvent.click(screen.getByRole("switch", { name: "Dark theme" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.className).toBe("");
});

test("unknown paths fall back to the composer", () => {
  stubBot();
  renderApp("/nowhere");
  expect(screen.getByRole("heading", { name: "Compose" })).toBeTruthy();
});

test("the composer keeps its elements and focus when the session check settles again", async () => {
  let csrfToken = "first";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/session"
        ? Response.json({
            authMode: "password",
            authenticated: true,
            insecure: false,
            csrfToken,
            user: null,
            deniedUserId: null,
            maxUploadMb: 10,
          })
        : Response.json(bot),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const choose = await screen.findByRole("button", { name: "Choose files" });
  choose.focus();
  csrfToken = "rotated";
  await act(() => client.refetchQueries({ queryKey: ["session"] }));
  expect(
    client.getQueryData<{ csrfToken: string }>(["session"])?.csrfToken,
  ).toBe("rotated");
  expect(screen.getByRole("button", { name: "Choose files" })).toBe(choose);
  expect(document.activeElement).toBe(choose);
});

test("History loads behind a skeleton, at its list and its detail addresses", async () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  renderApp("/history/send-1");
  const loading = screen.getByText("Loading history…");
  expect(loading.getAttribute("role")).toBe("status");
  expect(loading.closest("[aria-busy='true']")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Compose" })).toBeNull();
  await waitFor(() =>
    expect(document.querySelector("[aria-busy='true']")).toBeNull(),
  );
  expect(screen.queryByRole("heading", { name: "Compose" })).toBeNull();
  cleanup();
  renderApp("/history");
  await screen.findByRole("heading", { name: "History" });
  expect(screen.queryByRole("heading", { name: "Compose" })).toBeNull();
});
