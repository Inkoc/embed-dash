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
import { afterEach, expect, test, vi } from "vitest";
import type { SendTarget } from "@embed-dash/shared";
import { PublishOutcome, ForumReceipt } from "./SendPanel";
import { tally } from "./summary";

const target: SendTarget = {
  id: "copy",
  sendId: "send",
  guildId: "guild",
  guildName: "Community",
  channelId: "channel",
  channelName: "updates",
  status: "sent",
  messageId: "message",
  error: null,
  publishStatus: "failed",
  publishError: "Publishing was interrupted.",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const wrap = (copy: SendTarget) => {
  const client = new QueryClient();
  const invalidated = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <PublishOutcome target={copy} />
    </QueryClientProvider>,
  );
  return invalidated;
};
test.each(["failed", "unknown", "pending", "posting"] as const)(
  "a %s post never displays a publishing spinner",
  (status) => {
    wrap({ ...target, status, publishStatus: "pending" });
    expect(screen.queryByText(/Publishing to following/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  },
);
test("publish retry confirms success and refreshes History and edit queries", async () => {
  const invalidated = wrap(target);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        id: "send",
        status: "done",
        targets: [
          { ...target, publishStatus: "published", publishError: null },
        ],
      }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry publish" }));
  expect(
    await screen.findByText("Published to following servers"),
  ).toBeVisible();
  await waitFor(() =>
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ["history"] }),
  );
  expect(invalidated).toHaveBeenCalledWith({
    queryKey: ["history-detail", "send"],
  });
  expect(invalidated).toHaveBeenCalledWith({
    queryKey: ["edit-result", "send"],
  });
});
test("publish failures stay in the send summary and forum receipts name the original post", () => {
  expect(
    tally({ id: "send", status: "done", targets: [target] }).sentence,
  ).toContain("1 not published");
  render(
    <ForumReceipt
      target={{
        ...target,
        channelKind: "forum",
        forumTitle: "Weekly notes",
        forumTags: ["News"],
      }}
    />,
  );
  expect(screen.getByText("Weekly notes")).toBeVisible();
  expect(screen.getByText("Tags: News")).toBeVisible();
});
