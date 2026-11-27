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
import type { HistoryDetail } from "@embed-dash/shared";
import { DraftProvider, useDraft } from "./draft";
import { EditGuard, ReadOnlyChannels } from "./EditPanel";

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
  localStorage.clear();
});
test("original channels are readable without selection controls", () => {
  render(<ReadOnlyChannels send={send} />);
  expect(
    screen.getByRole("list", { name: "Original channels" }),
  ).toHaveTextContent("#news · Observatory");
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
