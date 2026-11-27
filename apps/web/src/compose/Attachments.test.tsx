// @vitest-environment jsdom
import {
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
import { App } from "../App";

const stored = {
  id: "11111111-1111-4111-8111-111111111111",
  filename: "My_logo.png",
  size: 2048,
  contentType: "image/png",
};
let present = true;
let uploadResponse: (body: FormData) => Response | Promise<Response>;

beforeEach(() => {
  localStorage.clear();
  present = true;
  uploadResponse = () => Response.json(stored, { status: 201 });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads" && init?.method === "POST")
        return uploadResponse(init.body as FormData);
      if (url.startsWith("/api/uploads/") && !init?.method)
        return present
          ? Response.json(stored)
          : Response.json({ error: "File not found" }, { status: 404 });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ id: "1", name: "Test bot", avatarUrl: null });
    }),
  );
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

function renderApp(maxUploadMb = 10) {
  const client = new QueryClient();
  client.setQueryDefaults(["session"], { staleTime: Infinity });
  client.setQueryData(["session"], {
    authenticated: true,
    insecure: false,
    csrfToken: "fixture",
    maxUploadMb,
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const choose = (...files: File[]) =>
  fireEvent.change(screen.getByLabelText("Files to attach"), {
    target: { files },
  });
const png = (name = "My logo.png", size = 2048) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

test("an uploaded file is listed, offered as an image and can be removed", async () => {
  renderApp();
  choose(png());
  const list = await screen.findByRole("list", { name: "Attached files" });
  expect(await within(list).findByText("2 KB")).toBeTruthy();

  const call = vi
    .mocked(fetch)
    .mock.calls.find(([url]) => url === "/api/uploads");
  const headers = call![1]!.headers as Record<string, string>;
  expect(headers["x-csrf-token"]).toBe("fixture");
  expect((call![1]!.body as FormData).get("file")).toBeInstanceOf(File);

  const picker = screen.getAllByLabelText(
    /Use an uploaded image for thumbnail/,
  )[0]!;
  fireEvent.change(picker, { target: { value: "My_logo.png" } });
  expect(
    (
      screen.getByLabelText("Thumbnail link", {
        exact: false,
      }) as HTMLInputElement
    ).value,
  ).toBe("attachment://My_logo.png");
  expect(screen.getByAltText("Embed thumbnail").getAttribute("src")).toBe(
    `/api/uploads/${stored.id}/content`,
  );

  fireEvent.click(screen.getByRole("button", { name: /Remove\s+My_logo.png/ }));
  expect(screen.queryByRole("list", { name: "Attached files" })).toBeNull();
  await waitFor(() =>
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `/api/uploads/${stored.id}`,
      expect.objectContaining({ method: "DELETE" }),
    ),
  );
  // The link now names a file that is gone, which is a problem to fix.
  expect(
    screen.getAllByText(/No attached file is named My_logo.png/).length,
  ).toBeGreaterThan(0);
});

test("a file over the limit is refused in the browser without a request", () => {
  renderApp(1);
  choose(png("huge.png", 1024 * 1024 + 1));
  expect(screen.getByRole("alert").textContent).toContain("at most 1 MB");
  expect(
    vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/uploads"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a server refusal shows on the file's row", async () => {
  uploadResponse = () =>
    Response.json({ error: "Files can be at most 1 MB." }, { status: 413 });
  renderApp();
  choose(png());
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Files can be at most 1 MB.",
  );
});

test("with nothing uploaded, an image field points to Files", () => {
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: /^Images/ }));
  const go = screen.getAllByRole("button", {
    name: /Upload in Files\s+for the thumbnail/,
  })[0]!;
  expect(screen.queryByLabelText(/Use an uploaded image for/)).toBeNull();
  fireEvent.click(go);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Choose files" }),
  );
});

const deleted = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "DELETE")
    .map(([url]) => url);
const clearDraft = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Clear/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Clear draft" }));
};

test("clearing the draft deletes its files from the server", async () => {
  renderApp();
  choose(png());
  await screen.findByRole("list", { name: "Attached files" });
  await clearDraft();
  expect(deleted()).toEqual([`/api/uploads/${stored.id}`]);
  expect(screen.queryByRole("list", { name: "Attached files" })).toBeNull();
});

test("an upload that finishes after a clear is deleted, not attached to the new draft", async () => {
  let finish!: () => void;
  uploadResponse = () =>
    new Promise((resolve) => {
      finish = () => resolve(Response.json(stored, { status: 201 }));
    });
  renderApp();
  choose(png());
  expect(await screen.findByText(/Uploading/)).toBeTruthy();
  await clearDraft();
  expect(screen.queryByText(/Uploading/)).toBeNull();
  finish();
  await waitFor(() => expect(deleted()).toEqual([`/api/uploads/${stored.id}`]));
  expect(screen.queryByRole("list", { name: "Attached files" })).toBeNull();
  expect(localStorage.getItem("embed-dash:draft")).not.toContain(stored.id);
});

test("a generic server refusal is replaced by the reason its status gives", async () => {
  uploadResponse = () =>
    Response.json({ error: "Request failed" }, { status: 415 });
  renderApp();
  choose(png());
  expect((await screen.findByRole("alert")).textContent).toBe(
    "The server refused the upload's format.",
  );
});

test("a file the draft names but the server lost shows as missing, not as an error page", async () => {
  localStorage.setItem(
    "embed-dash:draft",
    JSON.stringify({
      content: "Hi",
      embeds: [],
      attachments: [stored],
    }),
  );
  present = false;
  renderApp();
  expect(await screen.findByText(/No longer on the server/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Remove\s+My_logo.png/ }),
  ).toBeTruthy();
});

test("two files with one name get distinct names", async () => {
  let n = 0;
  uploadResponse = (body) =>
    Response.json(
      {
        ...stored,
        id: `22222222-2222-4222-8222-22222222222${++n}`,
        filename: (body.get("file") as File).name,
      },
      { status: 201 },
    );
  renderApp();
  choose(png("a.png"));
  await screen.findByRole("button", { name: /Remove/ });
  choose(png("a.png"));
  await waitFor(() => expect(n).toBe(2));
  const sent = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => url === "/api/uploads")
    .map(([, init]) => ((init!.body as FormData).get("file") as File).name);
  expect(sent).toEqual(["a.png", "a-2.png"]);
});
