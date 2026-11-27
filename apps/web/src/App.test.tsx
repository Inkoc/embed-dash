// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

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
  // jsdom has no modal dialogs; these stand in for the browser's.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
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
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const banner = () => within(screen.getByRole("banner"));
const embed = () => screen.getByTestId("preview-embed");

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
  stubBot(new Response("", { status: 502 }));
  renderApp();
  const alerts = await screen.findAllByRole("alert");
  expect(alerts[0]!.textContent).toContain("Not connected");
  expect(alerts[0]!.textContent).toContain("Unable to connect to Discord");
  fireEvent.click(banner().getByRole("button", { name: "Retry connection" }));
  expect(await banner().findByText("Test bot")).toBeTruthy();
});

test("editing title, description and colour updates the preview", () => {
  stubBot();
  renderApp();
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Server maintenance" },
  });
  expect(embed().textContent).toContain("Server maintenance");
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Back at 06:00." },
  });
  expect(embed().textContent).toContain("Back at 06:00.");
  fireEvent.change(screen.getByLabelText("Side colour"), {
    target: { value: "#3366ff" },
  });
  expect(embed().getAttribute("style")).toContain("#3366ff");
  expect(screen.getByText("#3366FF")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Message text (optional)"), {
    target: { value: "Heads up" },
  });
  expect(screen.getByRole("article").textContent).toContain("Heads up");
});

test("counts characters against Discord's limits", () => {
  stubBot();
  renderApp();
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "x".repeat(240) },
  });
  const count = document.getElementById("in-title-count")!;
  expect(count.textContent).toBe("240 /  of 256 characters");
  expect(count.dataset.level).toBe("near");
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "x".repeat(257) },
  });
  expect(count.dataset.level).toBe("over");
});

test("shortcuts move forward and back without browser-reserved keys", async () => {
  stubBot();
  renderApp();
  const title = screen.getByLabelText("Title");
  fireEvent.keyDown(title, { key: "2", altKey: true });
  expect(screen.getByRole("heading", { name: "Compose" })).toBeTruthy();
  fireEvent.keyDown(title, { key: "Enter", ctrlKey: true });
  expect(await screen.findByRole("heading", { name: "Send" })).toBeTruthy();
  expect(screen.getByText("Channels can’t be listed yet")).toBeTruthy();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(await screen.findByRole("heading", { name: "Compose" })).toBeTruthy();
  // The draft survives the round trip.
  expect(embed().textContent).toContain("The Saltmarsh Update");
});

test("? lists the shortcuts unless the operator is typing", () => {
  stubBot();
  renderApp();
  fireEvent.keyDown(screen.getByLabelText("Title"), { key: "?" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.keyDown(document.body, { key: "?" });
  const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
  expect(dialog.textContent).toContain("Go back: from Send to Compose");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(banner().getByRole("button", { name: /Shortcuts/ }));
  expect(screen.getByRole("dialog")).toBeTruthy();
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

test("the theme follows the system until the operator chooses, then is remembered", () => {
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
  expect(localStorage.getItem("embed-dash:theme")).toBe("dark");
  expect(screen.getByText("Discord dark")).toBeTruthy();
  act(() => mediaListeners.forEach((listener) => listener({ matches: false })));
  expect(html.dataset.theme).toBe("dark");
  act(() => vi.runAllTimers());
  expect(html.classList.contains("theme-fade")).toBe(false);
});

test("the preview width moves by keys and presets within its limits", () => {
  stubBot();
  renderApp();
  const handle = screen.getByRole("separator", { name: "Resize preview" });
  expect(handle.getAttribute("aria-valuenow")).toBe("640");
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle.getAttribute("aria-valuenow")).toBe("656");
  fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
  expect(handle.getAttribute("aria-valuenow")).toBe("592");
  fireEvent.keyDown(handle, { key: "Home" });
  expect(handle.getAttribute("aria-valuenow")).toBe("320");
  fireEvent.keyDown(handle, { key: "End" });
  expect(handle.getAttribute("aria-valuenow")).toBe("760");
  fireEvent.keyDown(handle, { key: "a" });
  expect(handle.getAttribute("aria-valuenow")).toBe("760");
  fireEvent.click(screen.getByRole("button", { name: "Phone" }));
  expect(handle.getAttribute("aria-valuenow")).toBe("360");
  expect(
    screen.getByRole("button", { name: "Phone" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.doubleClick(handle);
  expect(handle.getAttribute("aria-valuenow")).toBe("640");
});

test("dragging the handle left widens the preview", () => {
  stubBot();
  renderApp();
  const handle = screen.getByRole("separator", { name: "Resize preview" });
  handle.setPointerCapture = () => {};
  fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
  expect(handle.getAttribute("aria-valuenow")).toBe("740");
  fireEvent.pointerUp(handle, { pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
  expect(handle.getAttribute("aria-valuenow")).toBe("740");
});

test("phones switch between the editor and the preview, and Esc steps back", () => {
  stubBot();
  renderApp();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const compose = screen.getByRole("region", { name: "Compose" });
  fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
  expect(compose.dataset.pane).toBe("preview");
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(compose.dataset.pane).toBe("edit");
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Edit" }),
  );
});

test("unknown paths fall back to the composer", () => {
  stubBot();
  renderApp("/nowhere");
  expect(screen.getByRole("heading", { name: "Compose" })).toBeTruthy();
});

test("the theme wipe finishes on any press and passes the click on", async () => {
  stubBot();
  renderApp();
  let finish!: () => void;
  const skipTransition = vi.fn(() => finish());
  document.startViewTransition = ((callback: () => void) => {
    callback();
    return {
      skipTransition,
      finished: new Promise<void>((resolve) => (finish = resolve)),
    };
  }) as never;
  const html = document.documentElement;
  fireEvent.click(screen.getByRole("switch", { name: "Dark theme" }));
  expect(html.classList.contains("theme-wipe")).toBe(true);
  expect(html.dataset.theme).toBe("dark");
  // The overlay catches the press, so the click arrives on <html>.
  const send = banner().getByRole("link", { name: "Send" });
  document.elementFromPoint = () => send;
  fireEvent.pointerDown(html);
  expect(skipTransition).toHaveBeenCalled();
  fireEvent.click(html, { clientX: 10, clientY: 10 });
  expect(await screen.findByRole("heading", { name: "Send" })).toBeTruthy();
  await act(async () => {});
  expect(html.classList.contains("theme-wipe")).toBe(false);
  delete (document as { startViewTransition?: unknown }).startViewTransition;
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

test("the preview can take the editor's spare width, never more", () => {
  stubBot();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect() {}
    },
  );
  // The preview column measures 400 px; the editor 500 px.
  const offsetWidth = vi
    .spyOn(HTMLElement.prototype, "offsetWidth", "get")
    .mockImplementation(function (this: HTMLElement) {
      return this.closest("#preview") ? 400 : 500;
    });
  renderApp();
  const handle = screen.getByRole("separator", { name: "Resize preview" });
  expect(handle.getAttribute("aria-valuenow")).toBe("400");
  // 400 plus the 148 px the editor has above its 352 px minimum.
  expect(handle.getAttribute("aria-valuemax")).toBe("548");
  fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
  expect(
    screen
      .getByRole("button", { name: "Desktop" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  offsetWidth.mockRestore();
});
