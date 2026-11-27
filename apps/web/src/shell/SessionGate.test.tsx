// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AccessWarning, SessionControls, SessionGate } from "./SessionGate";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Location() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}
interface Fixture {
  authenticated: boolean;
  insecure: boolean;
  csrfToken: string;
  authMode?: string;
  user?: { id: string; name: string; avatarUrl: string | null } | null;
  deniedUserId?: string | null;
}
function setup(
  fetcher: ReturnType<typeof vi.fn>,
  initial?: Fixture,
  path = "/",
) {
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (initial) client.setQueryData(["session"], initial);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Location />
        <SessionGate>
          <AccessWarning />
          <SessionControls />
          <p>Composer</p>
        </SessionGate>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const anonymous = {
  authenticated: false,
  insecure: false,
  csrfToken: "fixture",
};

test("local mode has a permanent warning without dismissal or sign out", () => {
  setup(vi.fn(), { ...anonymous, authenticated: true, insecure: true });
  expect(screen.getByRole("note").textContent).toContain(
    "open to anyone who can reach it",
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Composer")).toBeTruthy();
});
test("unauthenticated visitors reach login with password focus", async () => {
  setup(vi.fn(), anonymous);
  expect(screen.getByTestId("location").textContent).toBe("/login");
  expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  expect(screen.getByLabelText("Instance password")).toBe(
    document.activeElement,
  );
});
test.each([
  [401, "Incorrect password"],
  [429, "Too many attempts"],
  [403, "Your session changed"],
])(
  "login failure %s preserves password and restores focus",
  async (status, message) => {
    const fetcher = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url === "/api/session"
            ? Response.json(anonymous)
            : new Response("", { status }),
        ),
      );
    setup(fetcher, anonymous);
    const input = screen.getByLabelText(
      "Instance password",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "typed-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Sign in" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(input.value).toBe("typed-password");
    expect(document.activeElement).toBe(input);
  },
);
test("session check offers a retry after a network failure", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(Response.json(anonymous));
  setup(fetcher);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Unable to check your session",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByLabelText("Instance password")).toBeTruthy();
});
test("connection errors and empty-password validation explain how to recover", async () => {
  setup(vi.fn().mockRejectedValue(new Error("offline")), anonymous);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Enter the instance password",
  );
  fireEvent.change(screen.getByLabelText("Instance password"), {
    target: { value: "typed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Unable to connect",
  );
});

const discord = { ...anonymous, authMode: "discord" };
test("Discord mode offers sign in with Discord and explains the scope", () => {
  setup(vi.fn(), discord);
  expect(screen.queryByLabelText("Instance password")).toBeNull();
  const link = screen.getByRole("link", { name: "Sign in with Discord" });
  expect(link.getAttribute("href")).toBe("/api/auth/discord");
  expect(link).toBe(document.activeElement);
  expect(screen.getByText(/cannot post as you/)).toBeTruthy();
});
test.each([
  ["expired", "expired or was started in another browser"],
  ["cancelled", "cancelled on Discord"],
  ["failed", "did not complete"],
])("Discord sign-in %s is explained on the login screen", (reason, message) => {
  setup(vi.fn(), discord, `/login?auth=${reason}`);
  expect(screen.getByRole("alert").textContent).toContain(message);
});
test("an account that is not allowed sees its ID and can try another", () => {
  setup(vi.fn(), { ...discord, deniedUserId: "222222222222222222" });
  expect(screen.getByRole("heading", { name: "Not allowed" })).toBeTruthy();
  expect(screen.getByText("222222222222222222")).toBeTruthy();
  expect(screen.getByText(/not on the approved list/)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Sign in with another account" })
      .getAttribute("href"),
  ).toBe("/api/auth/discord");
  expect(
    screen.queryByRole("link", { name: "Sign in with Discord" }),
  ).toBeNull();
});
test("the signed-in Discord user shows by name and avatar until sign out", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/session"
          ? Response.json(discord)
          : Response.json({ ok: true }),
      ),
    );
  setup(fetcher, {
    ...discord,
    authenticated: true,
    user: {
      id: "111111111111111111",
      name: "Ada Lovelace",
      avatarUrl: "https://cdn.example/avatar.png",
    },
  });
  expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  const avatar = document.querySelector("img")!;
  expect(avatar.getAttribute("src")).toBe("https://cdn.example/avatar.png");
  fireEvent.error(avatar);
  expect(document.querySelector("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(await screen.findByText("Sign in with Discord")).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/auth/logout",
    expect.objectContaining({ method: "POST" }),
  );
});
