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
import { createMemoryRouter, RouterProvider, Link } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { connectionFailure, describeFailure } from "../errors";
import type { HistoryDetail } from "@embed-dash/shared";
import { DraftProvider, useDraft } from "./draft";
import {
  EditGuard,
  ReadOnlyChannels,
  EditPanel,
  EditProvider,
  SaveUpdatesAction,
} from "./EditPanel";

const send: HistoryDetail = {
  id: "send",
  status: "done",
  createdAt: 1,
  payload: {
    content: "Original",
    embeds: [],
    attachments: [],
    pings: [],
    silent: false,
  },
  targets: [
    {
      id: "copy",
      channelId: "channel",
      channelName: "news",
      guildId: "guild",
      guildName: "Observatory",
      status: "sent",
      messageId: "message",
      error: null,
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
test("original channels are readable without selection controls", () => {
  render(<ReadOnlyChannels send={send} />);
  expect(
    screen.getByRole("list", { name: "Original channels" }),
  ).toHaveTextContent("newsObservatory");
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
function Editor() {
  const { editing, beginEdit, setDraft, markEdited } = useDraft();
  return (
    <>
      {editing && <EditGuard />}
      <button onClick={() => beginEdit(send)}>Edit</button>
      <button onClick={() => setDraft((d) => ({ ...d, content: "Changed" }))}>
        Change
      </button>
      <button
        onClick={() => markEdited({ ...send.payload, content: "Changed" })}
      >
        Mark saved
      </button>
      <Link to="/history">History</Link>
    </>
  );
}
test("unsaved route navigation can be cancelled and confirmed; unload is guarded", async () => {
  vi.stubGlobal("fetch", vi.fn());
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const router = createMemoryRouter([
    { path: "/", element: <Editor /> },
    { path: "/history", element: <p>History destination</p> },
  ]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DraftProvider>
        <RouterProvider router={router} />
      </DraftProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("link", { name: "History" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Leave unsaved edits?",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  fireEvent.click(screen.getByRole("link", { name: "History" }));
  fireEvent.click(await screen.findByRole("button", { name: "Discard edits" }));
  expect(await screen.findByText("History destination")).toBeVisible();
});

test("saving resets the guard even when the payload includes delivery options", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const router = createMemoryRouter([
    { path: "/", element: <Editor /> },
    { path: "/history", element: <p>Saved history</p> },
  ]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DraftProvider>
        <RouterProvider router={router} />
      </DraftProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  fireEvent.click(screen.getByRole("button", { name: "Mark saved" }));
  fireEvent.click(screen.getByRole("link", { name: "History" }));
  expect(await screen.findByText("Saved history")).toBeVisible();
});

function FullEditor({ initial = send }: { initial?: HistoryDetail }) {
  const { editing, beginEdit, draft, setDraft } = useDraft();
  return (
    <>
      <h2 id="compose-title" tabIndex={-1}>
        Compose
      </h2>
      <button onClick={() => beginEdit(initial)}>Open editor</button>
      <output aria-label="Current draft">{draft.content}</output>
      {editing && (
        <EditProvider key={editing.id}>
          <EditPanel />
          <label>
            Message
            <input
              value={draft.content}
              onChange={(e) =>
                setDraft((d) => ({ ...d, content: e.target.value }))
              }
            />
          </label>
          <SaveUpdatesAction />
        </EditProvider>
      )}
    </>
  );
}
function showEditor(initial = send) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(["session"], { csrfToken: "test-csrf" });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const router = createMemoryRouter([
    { path: "/", element: <FullEditor initial={initial} /> },
  ]);
  render(
    <QueryClientProvider client={client}>
      <DraftProvider>
        <RouterProvider router={router} />
      </DraftProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
  return client;
}
const updated = (
  overrides: Partial<
    NonNullable<HistoryDetail["edit"]>["targets"][number]
  > = {},
) => ({
  ...send.targets[0]!,
  ...overrides,
});
test("editor identifies the message, focuses its heading, hides earlier run results and restores the local draft", async () => {
  localStorage.setItem(
    "embed-dash:draft",
    JSON.stringify({
      content: "My earlier draft",
      embeds: [],
      attachments: [],
    }),
  );
  vi.stubGlobal("fetch", vi.fn());
  showEditor({
    ...send,
    edit: { id: "old-run", status: "done", targets: [updated()] },
  });
  expect(
    screen.getByRole("heading", { name: "Edit sent message" }),
  ).toHaveFocus();
  expect(screen.getByText("Original", { selector: "p" })).toBeVisible();
  expect(screen.getByText(/1 copy to update/)).toBeVisible();
  expect(screen.getByText(/Your earlier draft comes back/)).toBeVisible();
  expect(screen.queryByText("Updated", { exact: true })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Unsaved changes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Discard unsaved edits?",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Close editor" })).toHaveFocus(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard edits" }));
  expect(screen.getByLabelText("Current draft")).toHaveTextContent(
    "My earlier draft",
  );
  expect(JSON.parse(localStorage.getItem("embed-dash:draft")!).content).toBe(
    "My earlier draft",
  );
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: "Compose" })).toHaveFocus(),
  );
});

test("saving uses the original mention settings and shows only this run's confirmed results", async () => {
  let result: HistoryDetail = { ...send, edit: null };
  let put: { id: string; payload: object } | undefined;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PUT") {
      put = JSON.parse(options.body as string);
      result = {
        ...send,
        edit: { id: put!.id, status: "done", targets: [updated()] },
      };
      return Response.json({ id: send.id }, { status: 202 });
    }
    return Response.json(result);
  });
  vi.stubGlobal("fetch", fetcher);
  showEditor();
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Revised" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
  expect(await screen.findByText("Updated", { exact: true })).toBeVisible();
  expect(put!.payload).toEqual({ ...send.payload, content: "Revised" });
  expect(
    fetcher.mock.calls.find(([, options]) => options?.method === "PUT")![1]!
      .headers,
  ).toEqual({
    "content-type": "application/json",
    "x-csrf-token": "test-csrf",
  });
  fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("failed edits retry through the edit route; deleted copies have no retry action", async () => {
  let result: HistoryDetail = { ...send, edit: null };
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "PUT") {
      const { id } = JSON.parse(options.body as string);
      result = {
        ...send,
        edit: {
          id,
          status: "done",
          targets: [
            updated({
              status: "failed",
              error: {
                code: "EDIT_UNCONFIRMED",
                message: "Retry this update safely.",
              },
            }),
            updated({
              id: "deleted",
              channelName: "archive",
              status: "failed",
              error: { code: "MESSAGE_DELETED", message: "Deleted in Discord" },
            }),
          ],
        },
      };
      return Response.json({ id: send.id }, { status: 202 });
    }
    if (url.endsWith("/edits/retry")) {
      result = {
        ...result,
        edit: {
          ...result.edit!,
          targets: [updated(), result.edit!.targets[1]!],
        },
      };
      return Response.json({ id: send.id }, { status: 202 });
    }
    return Response.json(result);
  });
  vi.stubGlobal("fetch", fetcher);
  showEditor();
  fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
  expect(await screen.findByText("Deleted in Discord")).toBeVisible();
  const retries = screen.getAllByRole("button", { name: /Retry/ });
  expect(retries).toHaveLength(1);
  fireEvent.click(retries[0]!);
  expect(await screen.findByText("Updated", { exact: true })).toBeVisible();
  expect(
    fetcher.mock.calls.some(([url]) => url === "/api/sends/send/edits/retry"),
  ).toBe(true);
});

test("a lost save answer keeps an unchanged request id but changed content gets a new id", async () => {
  const requests: { id: string; payload: { content: string } }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        requests.push(JSON.parse(options.body as string));
        throw new TypeError("Failed to fetch");
      }
      return Response.json({ ...send, edit: null });
    }),
  );
  showEditor();
  fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
  expect(
    (await screen.findAllByText(connectionFailure("edit").message)).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByText("Failed to fetch")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]!.id).toBe(requests[0]!.id);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Save updates/ })).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "New text" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[2]!.id).not.toBe(requests[0]!.id);
  expect(requests[2]!.payload.content).toBe("New text");
});

test("a refused save shows the server's reason and clears the attempt for a corrected message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === "PUT"
        ? Response.json(
            { code: "EDIT_BLOCKED", error: "Wait for delivery to finish." },
            { status: 409 },
          )
        : Response.json(send),
    ),
  );
  showEditor();
  fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
  expect(
    await screen.findByText(
      describeFailure("edit", 409, {
        code: "EDIT_BLOCKED",
        error: "Wait for delivery to finish.",
      }).message,
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: /Save updates/ })).toBeEnabled();
});

test("update result loading errors offer a refresh and the save action follows validation", async () => {
  let shouldFail = true;
  let run = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        run = (JSON.parse(options.body as string) as { id: string }).id;
        return Response.json({ id: send.id }, { status: 202 });
      }
      if (shouldFail) throw new TypeError("Failed to fetch");
      return Response.json({
        ...send,
        edit: { id: run, status: "done", targets: [updated()] },
      });
    }),
  );
  showEditor();
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "" },
  });
  expect(screen.getByRole("button", { name: /Save updates/ })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Valid message" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Save updates/ }));
  expect(
    await screen.findByRole("button", { name: "Try again" }),
  ).toBeVisible();
  shouldFail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Updated", { exact: true })).toBeVisible();
});
