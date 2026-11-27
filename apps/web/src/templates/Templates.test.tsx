// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyEmbed, type Template } from "@embed-dash/shared";
import { DraftProvider, useDraft } from "../compose/draft";
import { EditorStateProvider } from "../compose/editorState";
import { SaveTemplate } from "./SaveTemplate";
import { TemplatesView } from "./TemplatesView";

const template = (id: string, name: string, title: string): Template => ({
  id,
  name,
  updatedAt: "2026-11-20T09:30:00.000Z",
  message: {
    content: "",
    embeds: [{ ...emptyEmbed(), title }],
    attachments: [],
  },
  missingFiles: [],
});
const rules = template(
  "11111111-1111-4111-8111-111111111111",
  "Rules",
  "Server rules",
);
const digest = template(
  "22222222-2222-4222-8222-222222222222",
  "Weekly digest",
  "This week",
);

type Call = { url: string; method: string; body?: unknown };

/** A templates API in memory, or one that answers every list request with `listStatus`. */
function serve(initial: Template[], { listStatus = 200 } = {}) {
  let templates = [...initial];
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    if (url === "/api/bot")
      return Response.json({ id: "42", name: "Lamplighter", avatarUrl: null });
    if (url.startsWith("/api/uploads/")) return Response.json({});
    if (url === "/api/templates" && method === "GET")
      return listStatus === 200
        ? Response.json(templates)
        : Response.json({ error: "Request failed" }, { status: listStatus });
    if (url === "/api/templates" && method === "POST") {
      const created: Template = {
        ...template("33333333-3333-4333-8333-333333333333", body.name, ""),
        message: body.message,
        updatedAt: "2026-11-27T10:00:00.000Z",
      };
      templates = [created, ...templates];
      return Response.json(created, { status: 201 });
    }
    const id = url.split("/").pop();
    if (method === "PATCH") {
      const found = templates.find((t) => t.id === id)!;
      const changed = {
        ...found,
        ...body,
        updatedAt: "2026-11-27T11:00:00.000Z",
      };
      templates = [changed, ...templates.filter((t) => t.id !== id)];
      return Response.json(changed);
    }
    if (method === "DELETE") {
      templates = templates.filter((t) => t.id !== id);
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  return calls;
}

/** Stands in for Compose: what the draft holds and what the arrival said. */
function ComposeProbe() {
  const { draft } = useDraft();
  const location = useLocation();
  return (
    <div data-testid="compose">
      <p>Title: {draft.embeds[0]?.title}</p>
      <p>
        Started:{" "}
        {(location.state as { started?: { name: string } } | null)?.started
          ?.name ?? "none"}
      </p>
      <SaveTemplate className="" onSaved={() => {}} />
    </div>
  );
}

function renderTemplates(path = "/templates") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["session"], { csrfToken: "token" });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <DraftProvider>
          <EditorStateProvider>
            <Routes>
              <Route path="/templates" element={<TemplatesView />} />
              <Route path="/" element={<ComposeProbe />} />
            </Routes>
          </EditorStateProvider>
        </DraftProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const draftWith = (title: string) =>
  localStorage.setItem(
    "embed-dash:draft",
    JSON.stringify({
      content: "",
      embeds: [{ ...emptyEmbed(), title }],
      attachments: [],
    }),
  );
const row = (name: string) =>
  screen.getByRole("listitem", { name: new RegExp(`^${name}$`) });

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

test("shows a skeleton while the templates load", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  renderTemplates();
  expect(screen.getByText("Loading templates…")).toHaveAttribute(
    "role",
    "status",
  );
});

test("a failed load says why and retries", async () => {
  const calls = serve([rules], { listStatus: 500 });
  renderTemplates();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The templates couldn’t be loaded. Try again.",
  );
  serve([rules]);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Rules" })).toBeVisible();
  expect(calls[0]).toMatchObject({ url: "/api/templates", method: "GET" });
});

test("with no templates, the empty state leads to Compose or saves the composer's message", async () => {
  serve([]);
  renderTemplates();
  expect(await screen.findByText("No templates yet")).toBeVisible();
  expect(
    screen.getByRole("link", { name: /Write a message in Compose/ }),
  ).toHaveAttribute("href", "/");
  cleanup();

  draftWith("Raid night");
  const calls = serve([]);
  renderTemplates();
  fireEvent.click(
    await screen.findByRole("button", { name: "Save the composer’s message" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Save as template" });
  expect(within(dialog).getByLabelText("Template name")).toHaveValue(
    "Raid night",
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Save template" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Raid night" }),
  ).toBeVisible();
  expect(screen.getByText(/Saved as template/)).toHaveTextContent(
    "Saved as template Raid night.",
  );
  const post = calls.find((call) => call.method === "POST")!;
  expect(post.body).toMatchObject({
    name: "Raid night",
    message: { embeds: [{ title: "Raid night" }] },
  });
});

test("lists templates with a summary, the date and a flag for lost files", async () => {
  serve([
    rules,
    {
      ...digest,
      message: {
        ...digest.message,
        attachments: [
          { id: "f1", filename: "map.png", size: 10, contentType: "image/png" },
        ],
      },
      missingFiles: ["f1"],
    },
  ]);
  renderTemplates();
  await screen.findByRole("heading", { name: "Rules" });
  expect(row("Rules")).toHaveTextContent("1 embed · Updated");
  expect(within(row("Rules")).getByText(/2026/)).toHaveAttribute(
    "datetime",
    rules.updatedAt,
  );
  expect(row("Weekly digest")).toHaveTextContent(
    "1 file is no longer on the server: map.png.",
  );
  // A blank composer has nothing to overwrite a template with.
  expect(
    screen.queryByRole("button", { name: "Overwrite with Compose" }),
  ).toBeNull();
});

test("starting from a template with a blank composer loads it straight away", async () => {
  serve([rules]);
  renderTemplates();
  await screen.findByRole("heading", { name: "Rules" });
  fireEvent.click(screen.getByRole("button", { name: "Start a message" }));
  expect(await screen.findByText("Title: Server rules")).toBeVisible();
  expect(screen.getByText("Started: Rules")).toBeVisible();
});

test("starting from a template asks before replacing a message in Compose", async () => {
  draftWith("Unsaved work");
  serve([rules]);
  renderTemplates();
  await screen.findByRole("heading", { name: "Rules" });
  fireEvent.click(screen.getByRole("button", { name: "Start a message" }));
  const dialog = screen.getByRole("dialog", {
    name: "Replace the message in Compose?",
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByTestId("compose")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Start a message" }));
  fireEvent.click(screen.getByRole("button", { name: "Replace message" }));
  expect(await screen.findByText("Title: Server rules")).toBeVisible();
});

test("renames a template, checking the name on the way", async () => {
  const calls = serve([rules, digest]);
  renderTemplates();
  await screen.findByRole("heading", { name: "Rules" });
  fireEvent.click(
    within(row("Weekly digest")).getByRole("button", { name: "Rename" }),
  );
  const name = screen.getByLabelText("Template name");
  expect(name).toHaveValue("Weekly digest");
  fireEvent.change(name, { target: { value: "   " } });
  fireEvent.blur(name);
  expect(screen.getByText("Give the template a name.")).toBeVisible();
  expect(name).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(name, { target: { value: "Monday digest" } });
  fireEvent.submit(name.closest("form")!);
  expect(
    await screen.findByRole("heading", { name: "Monday digest" }),
  ).toBeVisible();
  expect(calls.filter((call) => call.method === "PATCH")).toEqual([
    {
      url: `/api/templates/${digest.id}`,
      method: "PATCH",
      body: { name: "Monday digest" },
    },
  ]);
  // The renamed template moves to the top, as the most recently updated.
  expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent(
    "Monday digest",
  );
});

test("overwrites a template with the composer's message after confirming", async () => {
  draftWith("Week 48");
  const calls = serve([rules]);
  renderTemplates();
  await screen.findByRole("heading", { name: "Rules" });
  fireEvent.click(
    screen.getByRole("button", { name: "Overwrite with Compose" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Overwrite “Rules”?" });
  expect(dialog).toHaveTextContent("(1 embed)");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Overwrite template" }),
  );
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
      message: { embeds: [{ title: "Week 48" }] },
    }),
  );
});

test("deletes a template only after confirming", async () => {
  const calls = serve([rules, digest]);
  renderTemplates();
  await screen.findByRole("heading", { name: "Rules" });
  fireEvent.click(within(row("Rules")).getByRole("button", { name: "Delete" }));
  const dialog = screen.getByRole("dialog", { name: "Delete “Rules”?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(calls.some((call) => call.method === "DELETE")).toBe(false);

  fireEvent.click(within(row("Rules")).getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Rules" })).toBeNull(),
  );
  expect(calls.find((call) => call.method === "DELETE")?.url).toBe(
    `/api/templates/${rules.id}`,
  );
  expect(screen.getByRole("heading", { name: "Templates" })).toHaveFocus();
});

test("a refused change is reported with the template's name", async () => {
  serve([rules]);
  renderTemplates();
  await screen.findByRole("heading", { name: "Rules" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: "That template no longer exists." },
        { status: 404 },
      ),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "“Rules” wasn’t deleted. That template no longer exists.",
  );
});

test("saving from Compose suggests a name and shows the server's refusal in the dialog", async () => {
  draftWith("Patch notes");
  serve([]);
  renderTemplates("/");
  fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
  expect(screen.getByLabelText("Template name")).toHaveValue("Patch notes");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: "Give the template a name of 1 to 100 characters." },
        { status: 400 },
      ),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Give the template a name of 1 to 100 characters.",
  );
});
