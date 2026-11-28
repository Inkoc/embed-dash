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
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  deliveryErrors,
  type Guild,
  type GuildsResponse,
  type SendResult,
  type SendTarget,
} from "@embed-dash/shared";
import { DraftProvider, useDraft } from "../compose/draft";
import { SelectionProvider } from "./selection";
import { messageKey, SendingProvider } from "./sending";
import { SendView } from "./SendView";

vi.mock("./sendApi", async (original) => ({
  ...(await original<typeof import("./sendApi")>()),
  pollIntervalMs: 15,
}));

const guilds: GuildsResponse = {
  guilds: [
    {
      id: "1",
      name: "Lanternfall",
      iconUrl: null,
      mainChannelId: "10",
      channels: [
        { id: "10", name: "general", kind: "text", missing: [] },
        { id: "11", name: "news", kind: "announcement", missing: [] },
      ],
    } satisfies Guild,
    {
      id: "2",
      name: "Saltmarsh",
      iconUrl: null,
      mainChannelId: "20",
      channels: [{ id: "20", name: "edits", kind: "text", missing: [] }],
    } satisfies Guild,
  ],
  unavailable: [],
  fetchedAt: "2026-11-27T10:00:00.000Z",
};

const target = (
  id: string,
  guildId: string,
  channelId: string,
  channelName: string,
  status: SendTarget["status"] = "sent",
  code?: keyof typeof deliveryErrors,
): SendTarget => ({
  id,
  guildId,
  guildName: guildId === "1" ? "Lanternfall" : "Saltmarsh",
  channelId,
  channelName,
  status,
  messageId: status === "sent" ? `m${id}` : null,
  error: code ? { code, message: deliveryErrors[code] } : null,
});

const draftWith = (value: object) =>
  localStorage.setItem(
    "embed-dash:draft",
    JSON.stringify({ content: "", embeds: [], attachments: [], ...value }),
  );

type Handler = (url: string, init?: RequestInit) => Response | undefined;
let handlers: Handler[] = [];
const calls: { url: string; body?: unknown }[] = [];
let client: QueryClient;

beforeEach(() => {
  handlers = [];
  calls.length = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
  // jsdom has no modal dialogs; opening one only needs to set `open`.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      if (url === "/api/bot")
        return Promise.resolve(
          Response.json({ id: "42", name: "Lamplighter", avatarUrl: null }),
        );
      for (const handler of handlers) {
        const response = handler(url, init);
        if (response) return Promise.resolve(response);
      }
      if (url.startsWith("/api/guilds"))
        return Promise.resolve(Response.json(guilds));
      if (url === "/api/channel-groups")
        return Promise.resolve(Response.json([]));
      return Promise.resolve(Response.json({}, { status: 404 }));
    }),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

const sendRequests = () =>
  calls.filter((c) => c.url.startsWith("/api/sends") && c.body !== undefined);
const on =
  (url: string, respond: () => Response): Handler =>
  (u, init) =>
    u === url && init?.method === "POST" ? respond() : undefined;

/**
 * The server accepts the send, then answers each poll with the next result
 * (the last one repeats). `hold` keeps answering with the current one.
 */
function serve(...results: SendResult[]) {
  let at = 0;
  let held = false;
  handlers.push(
    on("/api/sends", () => Response.json({ id: "s1" }, { status: 202 })),
    on("/api/sends/s1/retry", () =>
      Response.json({ id: "s1" }, { status: 202 }),
    ),
    (url, init) => {
      // The first polls use the id the browser chose; after that the send's own.
      if (!/^\/api\/sends\/[0-9a-z-]+$/.test(url) || init?.method)
        return undefined;
      const answer = results[at];
      if (!held && at < results.length - 1) at++;
      return Response.json(answer);
    },
  );
  return {
    hold: () => (held = true),
    release: () => (held = false),
  };
}

/** Stands in for the composer: one edit to the message, from inside the providers. */
function EditText() {
  const { setDraft } = useDraft();
  return (
    <button
      type="button"
      onClick={() =>
        setDraft((draft) => ({ ...draft, content: `${draft.content}!` }))
      }
    >
      Edit the text
    </button>
  );
}

function renderSend() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/send"]}>
        <DraftProvider>
          <SelectionProvider>
            <SendingProvider>
              <Routes>
                <Route
                  path="/send"
                  element={
                    <>
                      <SendView />
                      <EditText />
                    </>
                  }
                />
                <Route
                  path="/"
                  element={
                    <>
                      <p>Compose view</p>
                      <Link to="/send">Back to Send</Link>
                    </>
                  }
                />
              </Routes>
            </SendingProvider>
          </SelectionProvider>
        </DraftProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const tray = () => screen.getByRole("complementary", { name: "Tray" });
async function tickAll() {
  fireEvent.click(await screen.findByRole("button", { name: /All postable/ }));
}

test("Send stays disabled, with the reason, until channels are ticked and the message is valid", async () => {
  renderSend();
  await tickAll();
  const send = within(tray()).getByRole("button", {
    name: /^Send to 3 channels/,
  });
  // A blank draft has nothing to send.
  expect(send).toBeDisabled();
  expect(tray()).toHaveTextContent(
    "Nothing to send yet. Write a message in Compose.",
  );
  cleanup();

  draftWith({ content: "x".repeat(2001) });
  renderSend();
  await tickAll();
  expect(
    within(tray()).getByRole("button", { name: /^Send to 3 channels/ }),
  ).toBeDisabled();
  expect(tray()).toHaveTextContent("1 problem to fix before sending.");
  expect(tray()).toHaveTextContent(
    "Message text: 1 character over the 2,000 limit.",
  );
  // A link goes to the field in Compose.
  fireEvent.click(
    within(tray()).getByRole("link", { name: /Go to the field/ }),
  );
  expect(await screen.findByText("Compose view")).toBeInTheDocument();
});

test("with nothing ticked the button says Send and the note says what to do", async () => {
  draftWith({ content: "Hello" });
  renderSend();
  await screen.findByRole("button", { name: /All postable/ });
  expect(within(tray()).getByRole("button", { name: "Send" })).toBeDisabled();
  expect(tray()).toHaveTextContent("Tick channels in the catalogue");
});

test("confirms with the message summary and channel count, then shows a result per channel", async () => {
  draftWith({
    content: "Patch day",
    embeds: [
      {
        color: "#0d9488",
        title: "Patch 0.9.4",
        url: "",
        description: "",
        author: { name: "", url: "", iconUrl: "" },
        fields: [],
        image: "",
        thumbnail: "",
        footer: { text: "", iconUrl: "" },
        timestamp: "",
      },
    ],
  });
  const result: SendResult = {
    id: "s1",
    status: "partial",
    targets: [
      target("t1", "1", "10", "general"),
      target("t2", "1", "11", "news", "failed", "MISSING_PERMISSION"),
      target("t3", "2", "20", "edits", "unknown", "UNKNOWN_OUTCOME"),
    ],
  };
  // The first answer shows two copies still in flight, the next every outcome.
  const feed = serve(
    {
      ...result,
      status: "sending",
      targets: [
        result.targets[0],
        { ...result.targets[1], status: "pending", error: null },
        { ...result.targets[2], status: "pending", error: null },
      ],
    },
    result,
  );
  feed.hold();
  renderSend();
  await tickAll();

  const open = within(tray()).getByRole("button", {
    name: "Send to 3 channels",
  });
  expect(open).toBeEnabled();
  fireEvent.click(open);
  const dialog = await screen.findByRole("dialog", {
    name: "Send to 3 channels?",
  });
  expect(dialog).toHaveTextContent("Patch 0.9.4");
  expect(dialog).toHaveTextContent("text · 1 embed");
  expect(dialog).toHaveTextContent("This posts to 3 channels in 2 servers.");
  expect(
    within(dialog).getByRole("list", { name: "Destinations" }),
  ).toHaveTextContent("Lanternfall#general, #news");
  expect(dialog).toHaveTextContent("Mentions won’t notify anyone.");
  // Nothing goes out before the answer.
  expect(sendRequests()).toEqual([]);
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Send to 3 channels" }),
  );

  // The tray shows how far the send has got while the rest is still in flight.
  expect(await within(tray()).findByText("1 of 3 sent.")).toBeInTheDocument();
  expect(
    within(tray()).getByRole("button", { name: /Sending 1 of 3…/ }),
  ).toBeDisabled();
  expect(tray()).toHaveTextContent("Mentions notify nobody.");
  feed.release();
  // The last poll draws the verdicts a moment before the send is marked
  // finished, so wait for the finished summary, which only then replaces the
  // in-flight note, rather than for a verdict.
  const summary = await within(tray()).findByText(
    /Retry sends only to the failed channels\./,
  );
  expect(sendRequests()).toEqual([
    {
      url: "/api/sends",
      body: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        payload: expect.objectContaining({
          content: "Patch day",
          pings: [],
          silent: false,
        }),
        channelIds: ["10", "11", "20"],
      },
    },
  ]);
  const link = within(tray()).getByRole("link", { name: /Open in Discord/ });
  expect(link).toHaveAttribute("href", "https://discord.com/channels/1/10/mt1");
  const failed = within(tray()).getByText("Failed");
  expect(failed).toBeVisible();
  expect(tray()).toHaveTextContent(deliveryErrors.MISSING_PERMISSION);
  expect(tray()).toHaveTextContent(deliveryErrors.UNKNOWN_OUTCOME);
  expect(
    within(tray()).getByRole("link", { name: /Open the channel/ }),
  ).toHaveAttribute("href", "https://discord.com/channels/2/20");
  // Every verdict is an icon and a word.
  expect(within(tray()).getByText("Unconfirmed")).toBeVisible();
  expect(summary).toHaveTextContent("1 sent, 1 failed, 1 unconfirmed.");
  // The summary has focus so the outcome is read out.
  expect(summary).toHaveFocus();
});

test("Retry failed re-sends to the failed channels only and updates the slips", async () => {
  draftWith({ content: "Patch day" });
  const first: SendResult = {
    id: "s1",
    status: "partial",
    targets: [
      target("t1", "1", "10", "general"),
      target("t2", "1", "11", "news", "failed", "RATE_LIMITED"),
      target("t3", "2", "20", "edits", "failed", "CHANNEL_GONE"),
    ],
  };
  const second: SendResult = {
    ...first,
    status: "partial",
    targets: [
      first.targets[0],
      target("t2", "1", "11", "news"),
      first.targets[2],
    ],
  };
  const third: SendResult = {
    ...first,
    status: "done",
    targets: [
      first.targets[0],
      second.targets[1],
      target("t3", "2", "20", "edits"),
    ],
  };
  serve(first, second, third);
  renderSend();
  await tickAll();
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Send to 3 channels" }),
  );
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Send to 3 channels",
    }),
  );
  await within(tray()).findByRole("button", { name: "Retry 2 failed" });

  // One slip's own Retry sends just that target.
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Retry #news in Lanternfall" }),
  );
  await waitFor(() => expect(tray()).toHaveTextContent("1 failed"));
  expect(sendRequests().at(-1)).toEqual({
    url: "/api/sends/s1/retry",
    body: { targetIds: ["t2"] },
  });
  expect(tray()).toHaveTextContent("2 sent, 1 failed.");

  // The batch button sends no ids: the server retries every failed copy.
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Retry 1 failed" }),
  );
  await waitFor(() => expect(tray()).toHaveTextContent("3 sent."));
  expect(sendRequests().at(-1)).toEqual({
    url: "/api/sends/s1/retry",
    body: {},
  });
  expect(tray()).toHaveTextContent("Every copy arrived.");
  expect(within(tray()).queryByRole("button", { name: /Retry/ })).toBeNull();

  // Keeping the draft goes back to choosing channels; the ones that have it are
  // unticked and marked, so sending there again takes a deliberate tick.
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Keep this draft" }),
  );
  expect(tray()).toHaveTextContent("Nothing ticked yet");
  const general = screen.getByRole("checkbox", { name: "general" });
  expect(general).not.toBeChecked();
  expect(general).toHaveAccessibleDescription(/Already has this message/);
  fireEvent.click(general);
  expect(tray()).toHaveTextContent("Already has this message");
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Send to 1 channel" }),
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "1 of these channels already has this message: #general. They’ll get a second copy.",
  );
});

test("editing the message after a send clears the already-received marks", async () => {
  draftWith({ content: "Patch day" });
  serve({
    id: "s1",
    status: "done",
    targets: [target("t1", "1", "10", "general")],
  });
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  await startSending("Send to 1 channel");
  fireEvent.click(
    await within(tray()).findByRole("button", { name: "Keep this draft" }),
  );
  const general = screen.getByRole("checkbox", { name: "general" });
  expect(general).toHaveAccessibleDescription(/Already has this message/);
  fireEvent.click(screen.getByRole("button", { name: "Edit the text" }));
  expect(general).not.toHaveAccessibleDescription(/Already has this message/);
});

test("Compose a new message asks first, then clears the draft, the selection and the delivery options", async () => {
  draftWith({ content: "Patch day" });
  serve({
    id: "s1",
    status: "done",
    targets: [target("t1", "1", "10", "general")],
  });
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Send silently/ }));
  await startSending("Send to 1 channel");
  const next = await within(tray()).findByRole("button", {
    name: "Compose a new message",
  });
  // Cancelling keeps everything as it was.
  fireEvent.click(next);
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Start a new message?");
  expect(dialog).toHaveTextContent(
    "This clears the composer and takes the 1 channel out of the tray. The copies already posted stay in Discord.",
  );
  expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(tray()).toHaveTextContent("1 sent.");
  expect(localStorage.getItem("embed-dash:draft")).toContain("Patch day");

  fireEvent.click(next);
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Clear and compose",
    }),
  );
  expect(await screen.findByText("Compose view")).toBeInTheDocument();
  await waitFor(() =>
    expect(localStorage.getItem("embed-dash:draft")).not.toContain("Patch day"),
  );
  // Back on Send: nothing ticked, no results, nothing marked, and the options start off again.
  fireEvent.click(screen.getByRole("link", { name: "Back to Send" }));
  const general = await screen.findByRole("checkbox", { name: "general" });
  expect(general).not.toBeChecked();
  expect(general).not.toHaveAccessibleDescription(/Already has this message/);
  expect(tray()).toHaveTextContent("Nothing ticked yet");
  fireEvent.click(general);
  expect(
    screen.getByRole("checkbox", { name: /Send silently/ }),
  ).not.toBeChecked();
});

test("a refused bot token reads as such in the summary", async () => {
  draftWith({ content: "Patch day" });
  serve({
    id: "s1",
    status: "failed",
    targets: [
      target("t1", "1", "10", "general", "failed", "INVALID_TOKEN"),
      target("t2", "1", "11", "news", "failed", "NOT_ATTEMPTED"),
    ],
  });
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "news" }));
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Send to 2 channels" }),
  );
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Send to 2 channels",
    }),
  );
  await waitFor(() =>
    expect(tray()).toHaveTextContent(
      "Discord rejected the bot token, so the send stopped.",
    ),
  );
  expect(tray()).toHaveTextContent(deliveryErrors.NOT_ATTEMPTED);
});

test("pings need an explicit choice and are warned about before and in the confirmation", async () => {
  draftWith({ content: "Hi @everyone" });
  serve({
    id: "s1",
    status: "done",
    targets: [target("t1", "1", "10", "general")],
  });
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  expect(tray()).toHaveTextContent(
    "Off: mentions in the text appear but notify nobody.",
  );
  fireEvent.click(within(tray()).getByRole("checkbox", { name: /Everyone/ }));
  fireEvent.click(within(tray()).getByRole("checkbox", { name: /Roles/ }));
  fireEvent.click(within(tray()).getByRole("checkbox", { name: /Roles/ }));
  expect(within(tray()).getByRole("status")).toHaveTextContent(
    "Pings are on. Everyone mentioned will be notified in 1 channel",
  );
  fireEvent.click(
    within(tray()).getByRole("checkbox", { name: /Send silently/ }),
  );
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Send to 1 channel" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Pings are on for everyone");
  expect(dialog).toHaveTextContent("Sent silently");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Send to 1 channel" }),
  );
  await waitFor(() => expect(sendRequests()).toHaveLength(1));
  expect(sendRequests()[0].body).toMatchObject({
    payload: { pings: ["everyone"], silent: true },
  });
});

test("channels the server refuses leave the tray and nothing is marked sent", async () => {
  draftWith({ content: "Patch day" });
  handlers.push(
    on("/api/sends", () =>
      Response.json(
        {
          code: "CHANNELS_UNAVAILABLE",
          error:
            "Some channels can’t be posted to right now. Nothing was sent.",
          channels: [{ id: "11", reason: "permission" }],
        },
        { status: 409 },
      ),
    ),
  );
  renderSend();
  await tickAll();
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Send to 3 channels" }),
  );
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Send to 3 channels",
    }),
  );
  expect(await within(tray()).findByRole("alert")).toHaveTextContent(
    "nothing was sent",
  );
  expect(tray()).toHaveTextContent("2 channels in 2 servers");
  expect(screen.getByRole("checkbox", { name: "news" })).not.toBeChecked();
  // The list was refreshed so the picker shows what the server sees.
  expect(calls.filter((c) => c.url === "/api/guilds?refresh=1")).toHaveLength(
    1,
  );
});

test("the confirmation lists the files and every delivery setting", async () => {
  draftWith({
    content: "Patch day",
    attachments: [
      {
        id: "u1",
        filename: "notes.pdf",
        size: 1_572_864,
        contentType: "application/pdf",
      },
    ],
  });
  handlers.push((url, init) =>
    url === "/api/uploads/u1" && !init?.method ? Response.json({}) : undefined,
  );
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  const send = within(tray()).getByRole("button", {
    name: "Send to 1 channel",
  });
  await waitFor(() => expect(send).toBeEnabled());
  fireEvent.click(send);
  let dialog = await screen.findByRole("dialog");
  const files = within(dialog).getByRole("list", { name: "Files" });
  expect(files).toHaveTextContent("notes.pdf");
  expect(files).toHaveTextContent("1.5 MB");
  expect(dialog).toHaveTextContent("Mentions won’t notify anyone.");
  expect(dialog).toHaveTextContent(
    "Sent with the usual push and desktop notification.",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  fireEvent.click(screen.getByRole("checkbox", { name: /Roles/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Send silently/ }));
  fireEvent.click(send);
  dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("Pings are on for roles");
  expect(dialog).toHaveTextContent(
    "Sent silently: no push or desktop notification.",
  );
});

test("a file the server lost blocks the send and is marked on the draft", async () => {
  const file = {
    id: "u1",
    filename: "banner.png",
    size: 10,
    contentType: "image/png",
  };
  draftWith({
    content: "Hi",
    attachments: [file],
    embeds: [
      {
        color: "#0d9488",
        title: "T",
        url: "",
        description: "",
        author: { name: "", url: "", iconUrl: "" },
        fields: [],
        image: "attachment://banner.png",
        thumbnail: "",
        footer: { text: "", iconUrl: "" },
        timestamp: "",
      },
    ],
  });
  handlers.push((url, init) =>
    url === "/api/uploads/u1" && !init?.method ? Response.json({}) : undefined,
  );
  handlers.push(
    on("/api/sends", () =>
      Response.json(
        {
          code: "UPLOAD_MISSING",
          error:
            "A file in this message is no longer on the server. Nothing was sent.",
          missingFiles: ["u1"],
          issues: [],
        },
        { status: 422 },
      ),
    ),
  );
  renderSend();
  await tickAll();
  const send = within(tray()).getByRole("button", {
    name: "Send to 3 channels",
  });
  await waitFor(() => expect(send).toBeEnabled());
  fireEvent.click(send);
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Send to 3 channels",
    }),
  );
  expect(await within(tray()).findByRole("alert")).toHaveTextContent(
    "no longer on the server",
  );
  // The draft now carries the problem on the file and on the image that uses it.
  await waitFor(() =>
    expect(
      within(tray()).getByRole("button", { name: /Send to 3 channels/ }),
    ).toBeDisabled(),
  );
  expect(tray()).toHaveTextContent("2 problems to fix before sending.");
  expect(tray()).toHaveTextContent(
    "Embed 1 image: banner.png is no longer on the server.",
  );
});

test("connection and session failures are explained without losing the tray", async () => {
  draftWith({ content: "Hi" });
  const answers = [
    () => Response.json({}, { status: 401 }),
    () => Response.json({}, { status: 403 }),
    () =>
      Response.json(
        {
          code: "DISCORD_UNAVAILABLE",
          error: "Discord is temporarily unavailable.",
        },
        { status: 502 },
      ),
  ];
  handlers.push((url, init) => {
    if (url !== "/api/sends" || init?.method !== "POST") return undefined;
    return answers.shift()!();
  });
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  const attempt = async () => {
    fireEvent.click(
      within(tray()).getByRole("button", { name: "Send to 1 channel" }),
    );
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Send to 1 channel",
      }),
    );
    return within(tray()).findByRole("alert");
  };
  expect(await attempt()).toHaveTextContent(
    "Couldn’t send: your session ended",
  );
  expect(await attempt()).toHaveTextContent(
    "Couldn’t send: your session changed",
  );
  const last = await attempt();
  expect(last).toHaveTextContent(
    "Couldn’t send: Discord is having problems on its side. Try again in a few minutes.",
  );
  // The server's own words and the status are kept for Details, folded away
  // and outside the alert, so opening it isn't announced again.
  expect(last.querySelector("details")).toBeNull();
  const details = last.parentElement!.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details).toHaveTextContent(
    "HTTP 502 · DISCORD_UNAVAILABLE · Server said: “Discord is temporarily unavailable.”",
  );
  expect(screen.getByRole("checkbox", { name: "general" })).toBeChecked();
});

test("a long result list keeps failures in view when it folds the sent ones", async () => {
  draftWith({ content: "Hi" });
  const many = Array.from({ length: 14 }, (_, i) =>
    target(
      `t${i}`,
      "1",
      `c${i}`,
      `ch-${i}`,
      i === 13 ? "failed" : "sent",
      i === 13 ? "CHANNEL_GONE" : undefined,
    ),
  );
  serve({ id: "s1", status: "partial", targets: many });
  handlers.push((url) =>
    url.startsWith("/api/guilds")
      ? Response.json({
          ...guilds,
          guilds: [
            {
              ...guilds.guilds[0],
              channels: many.map((t) => ({
                id: t.channelId,
                name: t.channelName,
                kind: "text" as const,
                missing: [],
              })),
            },
          ],
        })
      : undefined,
  );
  renderSend();
  await tickAll();
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Send to 14 channels" }),
  );
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Send to 14 channels",
    }),
  );
  await within(tray()).findByRole("button", { name: "Retry 1 failed" });
  // 12 sent slips stay, the last sent one folds, and the failed one is still listed.
  expect(within(tray()).getByText("#ch-13")).toBeVisible();
  expect(within(tray()).queryByText("#ch-12")).toBeNull();
  fireEvent.click(
    within(tray()).getByRole("button", { name: "+ 1 more · Show" }),
  );
  expect(within(tray()).getByText("#ch-12")).toBeVisible();
});

const startSending = async (count: string) => {
  fireEvent.click(within(tray()).getByRole("button", { name: count }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: count,
    }),
  );
};

test("a request that is dropped is followed by its id, never sent again", async () => {
  draftWith({ content: "Patch day" });
  const done: SendResult = {
    id: "s1",
    status: "done",
    targets: [target("t1", "1", "10", "general")],
  };
  let attempts = 0;
  let polls = 0;
  handlers.push((url, init) => {
    if (url === "/api/sends" && init?.method === "POST") {
      attempts++;
      throw new TypeError("network");
    }
    if (/^\/api\/sends\/[0-9a-z-]+$/.test(url) && !init?.method) {
      // The first poll can't reach the server either.
      if (polls++ === 0) throw new TypeError("network");
      return Response.json(done);
    }
    return undefined;
  });
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  await startSending("Send to 1 channel");
  expect(await within(tray()).findByText("Sent")).toBeInTheDocument();
  expect(attempts).toBe(1);
  expect(within(tray()).queryByRole("alert")).toBeNull();
  expect(tray()).toHaveTextContent("1 sent.");
  // The one id the browser chose went out and was polled.
  const polled = calls.filter((c) => /^\/api\/sends\/[0-9a-z-]+$/.test(c.url));
  expect(new Set(polled.map((c) => c.url)).size).toBe(1);
  expect(polled[0].url).toBe(
    `/api/sends/${(sendRequests()[0].body as { id: string }).id}`,
  );
});

test("while the server can't be reached the tray says the send carries on", async () => {
  draftWith({ content: "Patch day" });
  const pending: SendResult = {
    id: "s1",
    status: "sending",
    targets: [{ ...target("t1", "1", "10", "general"), status: "pending" }],
  };
  let down = false;
  const finished: SendResult = {
    ...pending,
    status: "done",
    targets: [target("t1", "1", "10", "general")],
  };
  let answer = pending;
  handlers.push(
    on("/api/sends", () => Response.json({ id: "s1" }, { status: 202 })),
    (url, init) => {
      if (!/^\/api\/sends\/[0-9a-z-]+$/.test(url) || init?.method)
        return undefined;
      if (down) throw new TypeError("network");
      return Response.json(answer);
    },
  );
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  await startSending("Send to 1 channel");
  await within(tray()).findByText("0 of 1 sent.");
  down = true;
  expect(
    await within(tray()).findByText(
      "Lost contact with the server; still checking.",
    ),
  ).toBeInTheDocument();
  expect(tray()).toHaveTextContent("Nothing is sent twice.");
  // Send can't be pressed again meanwhile.
  expect(within(tray()).queryByRole("button", { name: /^Send to/ })).toBeNull();
  down = false;
  answer = finished;
  expect(await within(tray()).findByText("Sent")).toBeInTheDocument();
});

test("the selection is locked while the send is delivered, and says so", async () => {
  draftWith({ content: "Patch day" });
  const pending: SendResult = {
    id: "s1",
    status: "sending",
    targets: [
      { ...target("t1", "1", "10", "general"), status: "pending" },
      { ...target("t2", "1", "11", "news"), status: "pending" },
    ],
  };
  const done: SendResult = {
    id: "s1",
    status: "done",
    targets: [
      target("t1", "1", "10", "general"),
      target("t2", "1", "11", "news"),
    ],
  };
  const feed = serve(pending, done);
  feed.hold();
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "news" }));
  await startSending("Send to 2 channels");
  // What a reload needs to pick the send up again, including which message it is.
  expect(
    JSON.parse(sessionStorage.getItem("embed-dash:send-in-flight")!),
  ).toMatchObject({
    message: messageKey({ content: "Patch day", embeds: [], attachments: [] }),
  });
  expect(
    await screen.findByText(/The selection is locked/),
  ).toBeInTheDocument();
  const edits = screen.getByRole("checkbox", { name: "edits" });
  expect(edits).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(edits);
  fireEvent.click(screen.getByRole("checkbox", { name: "general" }));
  expect(edits).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "general" })).toBeChecked();
  const picks = within(screen.getByRole("group", { name: "Quick picks" }));
  for (const name of [/Main channel/, /All postable/, /Clear/])
    expect(picks.getByRole("button", { name })).toBeDisabled();
  expect(tray()).toHaveTextContent("2 channels in 1 server");
  // The note sits in the sticky search bar, so scrolling the catalogue keeps it in view.
  expect(
    screen
      .getByLabelText("Find channels")
      .closest("[class*='lookup']")!
      .contains(screen.getByText(/The selection is locked/)),
  ).toBe(true);
  expect(tray()).toHaveTextContent("Channels stay locked");
  expect(
    await within(tray()).findByRole("button", { name: "Keep this draft" }),
  ).toBeDisabled();
  expect(
    within(tray()).getByRole("button", { name: "Compose a new message" }),
  ).toBeDisabled();
  feed.release();
  await within(tray()).findByText("Every copy arrived.");
  expect(screen.queryByText(/The selection is locked/)).toBeNull();
  expect(screen.getByRole("checkbox", { name: "edits" })).not.toHaveAttribute(
    "aria-disabled",
  );
});

test("a send dropped before the server stored it is asked for again under the same id, never reported as unposted", async () => {
  draftWith({ content: "Patch day" });
  const done: SendResult = {
    id: "s1",
    status: "done",
    targets: [target("t1", "1", "10", "general")],
  };
  const posts: { id: string }[] = [];
  let stored = false;
  handlers.push((url, init) => {
    if (url === "/api/sends" && init?.method === "POST") {
      posts.push(JSON.parse(init.body as string));
      // The first request dies on the way; the second is stored.
      if (posts.length === 1) throw new TypeError("network");
      stored = true;
      return Response.json({ id: posts[0].id }, { status: 202 });
    }
    if (/^\/api\/sends\/[0-9a-z-]+$/.test(url) && !init?.method)
      return stored
        ? Response.json(done)
        : Response.json({ code: "NOT_FOUND", error: "No." }, { status: 404 });
    return undefined;
  });
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  await startSending("Send to 1 channel");
  expect(await within(tray()).findByText("Sent")).toBeInTheDocument();
  expect(posts).toHaveLength(2);
  expect(posts[1].id).toBe(posts[0].id);
  expect(within(tray()).queryByRole("alert")).toBeNull();
  expect(tray()).not.toHaveTextContent("nothing was posted");
});

test("reloading mid-send shows the progress again and keeps the lock", async () => {
  draftWith({ content: "Patch day" });
  const pending: SendResult = {
    id: "s1",
    status: "sending",
    targets: [
      target("t1", "1", "10", "general"),
      { ...target("t2", "1", "11", "news"), status: "posting" },
    ],
  };
  const done: SendResult = {
    id: "s1",
    status: "done",
    targets: [
      target("t1", "1", "10", "general"),
      target("t2", "1", "11", "news"),
    ],
  };
  const feed = serve(pending, done);
  feed.hold();
  renderSend();
  fireEvent.click(await screen.findByRole("checkbox", { name: "general" }));
  await startSending("Send to 1 channel");
  await within(tray()).findByText("1 of 2 sent.");
  const kept = JSON.parse(sessionStorage.getItem("embed-dash:send-in-flight")!);
  expect(kept.id).toBe((sendRequests()[0].body as { id: string }).id);
  // The page goes away mid-send and comes back.
  cleanup();
  calls.length = 0;
  renderSend();
  await screen.findByRole("complementary", { name: "Tray" });
  expect(await within(tray()).findByText("1 of 2 sent.")).toBeInTheDocument();
  expect(
    await screen.findByText(/The selection is locked/),
  ).toBeInTheDocument();
  // The same send, asked for again under its own id, not a new one.
  expect(sendRequests().map((c) => (c.body as { id: string }).id)).toEqual([
    kept.id,
  ]);
  feed.release();
  await within(tray()).findByText("Every copy arrived.");
  expect(sessionStorage.getItem("embed-dash:send-in-flight")).toBeNull();
  expect(screen.queryByText(/The selection is locked/)).toBeNull();
});

test("reloading mid-retry follows the send without asking for the retry again, and still knows which channels have the message", async () => {
  draftWith({ content: "Patch day" });
  sessionStorage.setItem(
    "embed-dash:send-in-flight",
    JSON.stringify({
      url: "/api/sends/s1/retry",
      body: {},
      id: "s1",
      retrying: ["t2"],
      message: messageKey({
        content: "Patch day",
        embeds: [],
        attachments: [],
      }),
    }),
  );
  serve(
    {
      id: "s1",
      status: "sending",
      targets: [
        target("t1", "1", "10", "general"),
        { ...target("t2", "1", "11", "news"), status: "pending" },
        target("t3", "2", "20", "edits", "failed", "MISSING_PERMISSION"),
      ],
    },
    {
      id: "s1",
      status: "partial",
      targets: [
        target("t1", "1", "10", "general"),
        target("t2", "1", "11", "news"),
        target("t3", "2", "20", "edits", "failed", "MISSING_PERMISSION"),
      ],
    },
  );
  renderSend();
  await screen.findByRole("complementary", { name: "Tray" });
  await within(tray()).findByText("2 sent, 1 failed.");
  expect(sendRequests()).toEqual([]);
  expect(sessionStorage.getItem("embed-dash:send-in-flight")).toBeNull();

  fireEvent.click(
    within(tray()).getByRole("button", { name: "Keep this draft" }),
  );
  for (const name of ["general", "news"])
    expect(screen.getByRole("checkbox", { name })).toHaveAccessibleDescription(
      /Already has this message/,
    );
  // The channel that failed never got it, so it isn't marked.
  expect(
    screen.getByRole("checkbox", { name: "edits" }),
  ).not.toHaveAccessibleDescription(/Already has this message/);
  fireEvent.click(screen.getByRole("checkbox", { name: "news" }));
  fireEvent.click(
    within(tray()).getByRole("button", { name: "Send to 1 channel" }),
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "1 of these channels already has this message: #news. They’ll get a second copy.",
  );
});
