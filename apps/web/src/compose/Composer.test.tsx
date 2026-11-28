// @vitest-environment jsdom
import { URL as NodeURL } from "node:url";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderApp({ example = true } = {}) {
  // Signed in already: the session gate is covered by the app's own tests.
  const client = new QueryClient();
  client.setQueryDefaults(["session"], { staleTime: Infinity });
  client.setQueryData(["session"], {
    authenticated: true,
    insecure: false,
    csrfToken: "fixture",
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const start = screen.queryByRole("button", { name: "Start from an example" });
  if (example && start) fireEvent.click(start);
  return view;
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

test("a first visit, or a stored draft that doesn't fit, starts blank with the example on offer", () => {
  renderApp({ example: false });
  expect(field("Title").value).toBe("");
  expect(screen.getByText("Nothing to send yet.")).toBeTruthy();
  expect(screen.queryByText(/to fix before sending/)).toBeNull();
  cleanup();
  localStorage.setItem("embed-dash:draft", JSON.stringify({ content: 1 }));
  renderApp({ example: false });
  expect(field("Title").value).toBe("");
  localStorage.setItem("embed-dash:draft", "{not json");
  cleanup();
  renderApp({ example: false });
  fireEvent.click(button("Start from an example"));
  expect(field("Title").value).toContain("Saltmarsh");
  // The example is text only: nothing points at media Discord can't reach.
  expect(screen.queryByAltText("Embed image")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Start from an example" }),
  ).toBeNull();
  expect(screen.getByText("Looks right?")).toBeTruthy();
});

test("a change that can't be saved says so, keeps the draft and saves again later", () => {
  renderApp();
  fireEvent.change(field("Title"), { target: { value: "persisted" } });
  const setItem = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
  fireEvent.change(field("Title"), { target: { value: "new unsaved work" } });
  expect(screen.getByRole("alert").textContent).toContain(
    "Your latest changes aren’t saved in this browser.",
  );
  expect(screen.getByText("Not saved")).toBeTruthy();
  expect(field("Title").value).toBe("new unsaved work");
  setItem.mockRestore();
  fireEvent.change(field("Title"), { target: { value: "saved again" } });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Saved in this browser")).toBeTruthy();
  expect(localStorage.getItem("embed-dash:draft")).toContain("saved again");
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
  // A blank draft can't be sent yet, and says so calmly.
  expect(screen.getByText("Nothing to send yet.")).toBeTruthy();
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
  const spoiler = within(toolbar).getByRole("button", { name: "Spoiler" });
  fireEvent.click(spoiler);
  expect(description.value).toBe("hello ||world||");
  // Pressed from the keyboard, focus stays on the toolbar for the next command.
  expect(document.activeElement).toBe(spoiler);
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

test("with several embeds each folds to one line, and problems unfold it", () => {
  renderApp();
  expect(screen.queryByRole("button", { name: /^Embed 1/ })).toBeNull();
  fireEvent.click(button("Add embed"));
  const foldOf = (n: number) =>
    screen
      .getAllByRole("button", { name: new RegExp(`^Embed\\s*${n}`) })
      .find((element) => element.hasAttribute("aria-expanded"))!;
  const fold = () => foldOf(1);
  expect(fold().getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(fold());
  expect(fold().getAttribute("aria-expanded")).toBe("false");
  expect(fold().textContent).toContain("Patch 0.9.4");
  expect(fold().textContent).toContain("4 fields");
  expect(screen.getAllByRole("textbox", { name: "Title" })).toHaveLength(1);
  // Reordering still works while folded.
  expect(button(/^Move down\s*embed 1$/)).toBeTruthy();

  fireEvent.click(foldOf(2));
  expect(foldOf(2).textContent).toContain("Nothing written yet");
  expect(foldOf(2).textContent).toContain("Needs a fix");
  fireEvent.click(
    screen.getAllByRole("button", { name: /Choose channels/ })[0]!,
  );
  expect(foldOf(2).getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement!.id).toMatch(/-head$/);
  expect(
    document.getElementById(
      document.activeElement!.id.replace(/-head$/, "-problem"),
    )!.textContent,
  ).toMatch(/This embed is empty/);
});

test("empty embeds can be dropped in one step from their problem", () => {
  renderApp();
  fireEvent.click(button("Add embed"));
  fireEvent.click(button("Add embed"));
  expect(screen.getAllByRole("textbox", { name: "Title" })).toHaveLength(3);
  // Going forward shows the first problem: an empty embed, with its way out.
  fireEvent.click(
    screen.getAllByRole("button", { name: /Choose channels/ })[0]!,
  );
  expect(
    document.getElementById(
      document.activeElement!.id.replace(/-head$/, "-problem"),
    )!.textContent,
  ).toMatch(/This embed is empty/);
  fireEvent.click(button("Remove all 2 empty embeds"));
  expect(screen.getAllByRole("textbox", { name: "Title" })).toHaveLength(1);
  expect(screen.queryByText(/This embed is empty/)).toBeNull();
  expect(screen.queryByRole("button", { name: /^Embed 2/ })).toBeNull();
  // Focus lands on what is left, never on nothing.
  expect(document.activeElement).not.toBe(document.body);
});

test("JSON import errors leave the draft and stored draft untouched; success lists unsupported fields", () => {
  renderApp();
  const original = localStorage.getItem("embed-dash:draft");
  fireEvent.click(button("Import JSON"));
  const dialog = screen.getByRole("dialog", { name: "Import message JSON" });
  const input = within(dialog).getByLabelText("Message JSON");
  const submit = within(dialog).getByRole("button", { name: "Replace draft" });
  for (const value of [
    "{",
    '{"content":3}',
    JSON.stringify({ content: "x".repeat(2001) }),
  ]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(submit);
    expect(within(dialog).getByRole("alert").textContent).toBeTruthy();
    expect(localStorage.getItem("embed-dash:draft")).toBe(original);
  }
  fireEvent.change(input, {
    target: {
      value: JSON.stringify({
        content: "Imported announcement",
        components: [{ type: 1 }],
      }),
    },
  });
  fireEvent.click(submit);
  const confirmation = screen.getByRole("dialog", {
    name: "Replace the current draft?",
  });
  expect(localStorage.getItem("embed-dash:draft")).toBe(original);
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  expect(localStorage.getItem("embed-dash:draft")).toBe(original);
  fireEvent.click(submit);
  fireEvent.click(
    within(confirmation).getByRole("button", { name: "Replace draft" }),
  );
  expect(
    screen.queryByRole("dialog", { name: "Import message JSON" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Replace draft" })).toBeNull();
  expect(screen.getByText("Unsupported field: components.")).toBeTruthy();
  expect(document.activeElement).toBe(document.getElementById("json-result"));
  expect(field(/^Message text/).value).toBe("Imported announcement");
  expect(preview().textContent).toContain("Imported announcement");
});

test("JSON file import reads locally and export provides copy feedback and a download", async () => {
  renderApp({ example: false });
  fireEvent.click(button("Import JSON"));
  const file = new File(['{"content":"From file"}'], "message.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", {
    value: async () => '{"content":"From file"}',
  });
  fireEvent.change(screen.getByLabelText("JSON file"), {
    target: { files: [file] },
  });
  await screen.findByText("File ready to import.");
  fireEvent.click(button("Replace draft"));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(button("Export JSON"));
  expect(
    (screen.getByLabelText("Message JSON") as HTMLTextAreaElement).value,
  ).toContain('"content": "From file"');
  const clipboard = { writeText: async () => {} };
  vi.stubGlobal(
    "navigator",
    Object.create(navigator, { clipboard: { value: clipboard } }),
  );
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  fireEvent.click(button("Copy JSON"));
  await screen.findByText("JSON copied.");
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("From file"));
  writeText.mockRejectedValue(new Error("denied"));
  fireEvent.click(button("Copy JSON"));
  await screen.findByText(/Could not copy JSON/);
  vi.stubGlobal("URL", NodeURL);
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  fireEvent.click(button("Download JSON"));
  expect(create).toHaveBeenCalled();
  expect(click).toHaveBeenCalled();
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:test"));
});

test("oversized JSON files are rejected before reading and leave the draft unchanged", () => {
  renderApp();
  const original = localStorage.getItem("embed-dash:draft");
  fireEvent.click(button("Import JSON"));
  const file = new File([""], "large.json");
  const read = vi.fn();
  Object.defineProperties(file, {
    size: { value: 1024 * 1024 + 1 },
    text: { value: read },
  });
  fireEvent.change(screen.getByLabelText("JSON file"), {
    target: { files: [file] },
  });
  expect(screen.getByRole("alert").textContent).toContain("1 MB or smaller");
  expect(read).not.toHaveBeenCalled();
  expect(localStorage.getItem("embed-dash:draft")).toBe(original);
});
