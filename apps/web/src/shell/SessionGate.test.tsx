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
function setup(
  fetcher: ReturnType<typeof vi.fn>,
  initial?: { authenticated: boolean; insecure: boolean; csrfToken: string },
) {
  vi.stubGlobal("fetch", fetcher);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (initial) client.setQueryData(["session"], initial);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
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
