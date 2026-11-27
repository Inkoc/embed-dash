// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test } from "vitest";
import { blankDraft, exampleDraft, type Draft } from "../compose/draft";
import { MessageSlip } from "./MessageSlip";

afterEach(cleanup);

const show = (draft: Draft) =>
  render(
    <MemoryRouter>
      <MessageSlip draft={draft} />
    </MemoryRouter>,
  );

test("names the message by its title and counts its parts", () => {
  const draft = exampleDraft();
  draft.embeds.push({ ...draft.embeds[0]!, id: "copy" });
  draft.attachments = [
    { id: "u1", filename: "a.png", size: 1, contentType: "image/png" },
    { id: "u2", filename: "b.pdf", size: 1, contentType: "application/pdf" },
  ];
  const { container } = show(draft);
  expect(container).toHaveTextContent(
    "Sending Patch 0.9.4 — The Saltmarsh Update text · 2 embeds · 2 files",
  );
  expect(screen.getByRole("link", { name: "Edit in Compose" })).toHaveAttribute(
    "href",
    "/",
  );
});

test("falls back to the first line of the text, and counts one embed and no files", () => {
  const draft = blankDraft();
  draft.content = "Server maintenance tonight\nDetails below";
  draft.embeds[0]!.description = "Body";
  const { container } = show(draft);
  expect(container).toHaveTextContent(
    "Sending Server maintenance tonight text · 1 embed",
  );
  expect(container).not.toHaveTextContent("file");
});

test("a blank draft says so and points to Compose", () => {
  const { container } = show(blankDraft());
  expect(container).toHaveTextContent("Sending Nothing written yet");
  expect(
    screen.getByRole("link", { name: "Write it in Compose" }),
  ).toBeInTheDocument();
});
