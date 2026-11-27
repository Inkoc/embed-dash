// @vitest-environment jsdom
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
import { App } from "../App";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ id: "1", name: "Test bot", avatarUrl: null }),
    ),
  );
  // jsdom has no modal dialogs; opening one only needs to set `open`.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const field = (name: string | RegExp) =>
  screen.getByLabelText(name, { exact: true }) as
    HTMLInputElement | HTMLTextAreaElement;
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const preview = () => screen.getByRole("article", { name: "Message preview" });

test("the draft is saved in the browser and comes back after a reload", () => {
  const { unmount } = renderApp();
  fireEvent.change(field("Title"), { target: { value: "Server maintenance" } });
  unmount();
  renderApp();
  expect(field("Title").value).toBe("Server maintenance");
  expect(screen.getByText("Saved in this browser")).toBeTruthy();
});

test("a stored draft that doesn't fit the schema is replaced by the example", () => {
  localStorage.setItem("embed-dash:draft", JSON.stringify({ content: 1 }));
  renderApp();
  expect(field("Title").value).toContain("Saltmarsh");
  localStorage.setItem("embed-dash:draft", "{not json");
  cleanup();
  renderApp();
  expect(field("Title").value).toContain("Saltmarsh");
});

test("Clear asks first, then empties the draft", () => {
  renderApp();
  fireEvent.click(button("Clear"));
  const dialog = screen.getByRole("dialog", { name: "Clear the draft?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(field("Title").value).toContain("Saltmarsh");
  fireEvent.click(button("Clear"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Clear draft" }));
  expect(field("Title").value).toBe("");
  expect(field(/^Message text/).value).toBe("");
  expect(document.activeElement).toBe(field(/^Message text/));
  // A blank embed can't be sent yet, and the summary says why.
  expect(screen.getByText("1 problem to fix before sending")).toBeTruthy();
  expect(
    screen
      .getAllByRole("button", { name: /Choose channels/ })[0]!
      .getAttribute("aria-disabled"),
  ).toBe("true");
});

test("problems show on blur, and the summary leads to the field", () => {
  renderApp();
  const title = field("Title");
  fireEvent.change(title, { target: { value: "x".repeat(260) } });
  const problem = () => document.getElementById(`${title.id}-problem`);
  expect(problem()).toBeNull();
  fireEvent.blur(title);
  expect(problem()!.textContent).toBe("4 characters over the 256 limit.");
  expect(title.getAttribute("aria-invalid")).toBe("true");

  // A problem hidden in a closed row: the row says so, and the summary opens it.
  fireEvent.click(button(/^Author/));
  fireEvent.change(field(/^Author icon link/), {
    target: { value: "icon.png" },
  });
  fireEvent.click(button(/^Author/));
  expect(button(/^Author/).textContent).toContain("Needs a fix");
  fireEvent.click(screen.getByRole("button", { name: /Embed 1 author icon:/ }));
  expect(button(/^Author/).getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(field(/^Author icon link/));
  expect(field(/^Author icon link/).getAttribute("aria-invalid")).toBe("true");

  // The disabled forward action goes to the first problem.
  fireEvent.click(
    screen.getAllByRole("button", { name: /Choose channels/ })[0]!,
  );
  expect(document.activeElement).toBe(title);
});

test("embeds are added, duplicated, reordered and removed with buttons", () => {
  renderApp();
  fireEvent.click(button("Add embed"));
  expect(document.activeElement).toBe(
    screen.getAllByLabelText("Title", { exact: true })[1],
  );
  fireEvent.change(document.activeElement!, { target: { value: "Second" } });
  expect(screen.getByText("2 of 10")).toBeTruthy();
  fireEvent.click(button(/^Move up\s*embed 2$/));
  const titles = () =>
    screen
      .getAllByLabelText("Title", { exact: true })
      .map((input) => (input as HTMLInputElement).value.slice(0, 6));
  expect(titles()).toEqual(["Second", "Patch "]);
  expect(document.activeElement).toBe(button(/^Move down\s*embed 1$/));
  fireEvent.click(screen.getAllByRole("button", { name: "Duplicate" })[0]!);
  expect(titles()).toEqual(["Second", "Second", "Patch "]);
  expect(within(preview()).getAllByTestId("preview-embed")).toHaveLength(3);
  fireEvent.click(button(/^Remove\s*embed 1$/));
  fireEvent.click(button(/^Remove\s*embed 1$/));
  expect(titles()).toEqual(["Patch "]);
  fireEvent.click(button(/^Remove\s*embed 1$/));
  expect(screen.queryAllByLabelText("Title", { exact: true })).toHaveLength(0);
  expect(document.activeElement).toBe(button("Add embed"));
});

test("fields are added, edited, reordered and removed", () => {
  renderApp();
  fireEvent.click(button("Add field"));
  const name = document.activeElement as HTMLInputElement;
  expect(name.id).toMatch(/-name$/);
  fireEvent.change(name, { target: { value: "Region" } });
  fireEvent.change(screen.getAllByLabelText("Value", { exact: true }).at(-1)!, {
    target: { value: "EU" },
  });
  expect(screen.getByText("5 of 25")).toBeTruthy();
  expect(within(preview()).getByText("Region")).toBeTruthy();
  fireEvent.click(screen.getAllByLabelText(/^Inline:/).at(-1)!);
  fireEvent.click(button(/^Up\s*field 5$/));
  expect(button(/^Field\s*4/).textContent).toContain("Region");
  expect(button(/^Field\s*4/).textContent).toContain("Full width");
  fireEvent.click(button(/^Remove\s*field 4$/));
  expect(screen.getByText("4 of 25")).toBeTruthy();
});

test("the footer time can be none, the time of sending or a set time", () => {
  renderApp();
  fireEvent.click(button(/^Footer and time/));
  fireEvent.click(screen.getByLabelText("No time"));
  expect(button(/^Footer and time/).textContent).not.toContain(
    "time of sending",
  );
  fireEvent.click(screen.getByLabelText("A set time"));
  fireEvent.change(field("Date and time"), {
    target: { value: "2026-12-03T18:00" },
  });
  expect(button(/^Footer and time/).textContent).toMatch(/2026/);
  fireEvent.change(field("Date and time"), { target: { value: "" } });
  expect(button(/^Footer and time/).textContent).toMatch(/2026/);
});

test("side colour takes a picked or typed hex", () => {
  renderApp();
  const hex = field("Side colour") as HTMLInputElement;
  fireEvent.change(hex, { target: { value: "36f" } });
  fireEvent.blur(hex);
  expect(hex.value).toBe("#3366FF");
  fireEvent.change(hex, { target: { value: "#12" } });
  fireEvent.blur(hex);
  expect(document.getElementById(`${hex.id}-problem`)!.textContent).toMatch(
    /six-digit hex colour/,
  );
  fireEvent.change(screen.getByLabelText("Pick the side colour"), {
    target: { value: "#00ff00" },
  });
  expect(hex.value).toBe("#00FF00");
});

test("the formatting toolbar and shortcuts write Discord markdown", () => {
  renderApp();
  const description = field("Description") as HTMLTextAreaElement;
  fireEvent.change(description, { target: { value: "hello world" } });
  description.setSelectionRange(0, 5);
  fireEvent.keyDown(description, { key: "b", ctrlKey: true });
  expect(description.value).toBe("**hello** world");
  description.setSelectionRange(2, 7);
  fireEvent.keyDown(description, { key: "B", metaKey: true });
  expect(description.value).toBe("hello world");
  const toolbar = screen.getByRole("toolbar", { name: "Format Description" });
  description.setSelectionRange(6, 11);
  fireEvent.click(within(toolbar).getByRole("button", { name: "Spoiler" }));
  expect(description.value).toBe("hello ||world||");
  // Arrow keys move along the toolbar, which is a single tab stop.
  const bold = within(toolbar).getByRole("button", { name: "Bold" });
  bold.focus();
  fireEvent.keyDown(toolbar, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(
    within(toolbar).getByRole("button", { name: "Timestamp" }),
  );
  fireEvent.keyDown(toolbar, { key: "Home" });
  expect(document.activeElement).toBe(bold);
  // Other key combinations are left to the browser.
  fireEvent.keyDown(description, { key: "b", ctrlKey: true, shiftKey: true });
  fireEvent.keyDown(description, { key: "q", ctrlKey: true });
  expect(description.value).toBe("hello ||world||");
});

test("mentions and timestamps are inserted from small forms", () => {
  renderApp();
  const content = field(/^Message text/) as HTMLTextAreaElement;
  fireEvent.change(content, { target: { value: "Hi " } });
  content.setSelectionRange(3, 3);
  const toolbar = screen.getByRole("toolbar", { name: "Format Message text" });
  fireEvent.click(within(toolbar).getByRole("button", { name: "Mention" }));
  const panel = screen.getByRole("group", { name: "Insert a mention" });
  fireEvent.click(within(panel).getByLabelText("Role"));
  const id = within(panel).getByLabelText("ID");
  fireEvent.change(id, { target: { value: "123" } });
  fireEvent.keyDown(id, { key: "Enter" });
  expect(
    within(panel).getByText("Discord IDs are 17 to 20 digits."),
  ).toBeTruthy();
  fireEvent.change(id, { target: { value: "110349001187655271" } });
  fireEvent.click(within(panel).getByRole("button", { name: "Insert" }));
  expect(content.value).toBe("Hi <@&110349001187655271>");

  fireEvent.click(within(toolbar).getByRole("button", { name: "Timestamp" }));
  const times = screen.getByRole("group", { name: "Insert a timestamp" });
  fireEvent.change(within(times).getByLabelText("Date and time"), {
    target: { value: "2026-12-03T18:00" },
  });
  fireEvent.change(within(times).getByLabelText("Shown as"), {
    target: { value: "R" },
  });
  fireEvent.click(within(times).getByRole("button", { name: "Insert" }));
  expect(content.value).toMatch(/^Hi <@&110349001187655271><t:\d+:R>$/);

  fireEvent.click(within(toolbar).getByRole("button", { name: "Mention" }));
  fireEvent.keyDown(screen.getByRole("group", { name: "Insert a mention" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("group", { name: "Insert a mention" })).toBeNull();
  expect(document.activeElement).toBe(content);
});

test("the title link folds into one line under the title", () => {
  renderApp();
  const toggle = button(/Title links to/);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  fireEvent.change(field(/^Title link/), { target: { value: "" } });
  expect(button(/^Title link/).textContent).toContain("Add");
});
