import { expect, test } from "vitest";
import {
  AppError,
  asAppError,
  connectionFailure,
  describeFailure,
  failureFrom,
} from "./errors";

test.each([
  [
    "DISCORD_UNREACHABLE",
    "Couldn’t load servers: the bot may be offline, or the app can’t reach Discord.",
  ],
  [
    "DISCORD_INVALID_TOKEN",
    "Couldn’t load servers: Discord rejected the bot token.",
  ],
  [
    "DISCORD_RATE_LIMITED",
    "Couldn’t load servers: Discord asked the bot to slow down.",
  ],
  ["DISCORD_UNAVAILABLE", "Couldn’t load servers: Discord is having problems"],
])("a server code %s reads as its own cause", (code, words) => {
  const error = describeFailure("load-servers", 502, {
    code,
    error: "Fixed server wording.",
  });
  expect(error).toBeInstanceOf(AppError);
  expect(error.message).toContain(words);
  expect(error.message).not.toContain("Fixed server wording");
  expect(error.code).toBe(code);
  expect(error.detail).toBe(
    `HTTP 502 · ${code} · Server said: “Fixed server wording.”`,
  );
});

test("the proxy refusal names both settings and nothing else about the instance", () => {
  const error = describeFailure("sign-in", 403, {
    code: "PROXY_NOT_TRUSTED",
    error: "x",
  });
  expect(error.message).toMatch(/^Couldn’t sign in: /);
  expect(error.message).toContain("TRUST_PROXY");
  expect(error.message).toContain("PUBLIC_URL");
});

test("sign-in details show only the status and code", () => {
  expect(
    describeFailure("sign-in", 401, {
      code: "BAD_PASSWORD",
      error: "Wrong password.",
    }).detail,
  ).toBe("HTTP 401 · BAD_PASSWORD");
  expect(describeFailure("sign-in", 502, null).detail).toBe("HTTP 502");
});

test.each([
  ["sign-in", 401, "Couldn’t sign in: the password is incorrect."],
  ["send", 401, "Couldn’t send: your session ended."],
  ["send", 403, "Couldn’t send: your session changed."],
  ["sign-in", 429, "Couldn’t sign in: too many attempts."],
  ["upload", 429, "Couldn’t upload the file: too many requests."],
  [
    "upload",
    413,
    "Couldn’t upload the file: the server refused the file as too large.",
  ],
  ["upload", 415, "Couldn’t upload the file: the server doesn’t accept"],
  ["retry", 400, "Couldn’t retry: the server refused the request."],
  ["follow", 500, "Couldn’t check on the send: the server had a problem."],
] as const)(
  "without a code, %s answered %i still says what happened",
  (action, status, words) => {
    expect(describeFailure(action, status, { error: "s" }).message).toContain(
      words,
    );
  },
);

test("an unknown code falls back to what the status says", () => {
  expect(
    describeFailure("send", 409, { code: "SOMETHING_NEW", error: "s" }).message,
  ).toBe("Couldn’t send: the server refused the request. Try again.");
});

test("an error page that isn't from the app says the app didn't answer, and never shows the page", () => {
  const error = describeFailure("load-servers", 502, null);
  expect(error.message).toBe(
    "Couldn’t load servers: embed-dash didn’t answer. It may be offline or restarting; check that it’s running, then retry.",
  );
  expect(error.detail).toBe("HTTP 502 · Not an answer from the app");
});

test("failureFrom reads JSON bodies and ignores anything else", async () => {
  const json = await failureFrom(
    "send",
    Response.json(
      { code: "UPLOAD_MISSING", error: "Gone.", secret: { a: 1 } },
      { status: 422 },
    ),
  );
  expect(json.message).toContain("a file in this message is no longer");
  expect(json.detail).not.toContain("{");
  const html = await failureFrom(
    "send",
    new Response("<html>Bad gateway</html>", { status: 502 }),
  );
  expect(html.message).toContain("embed-dash didn’t answer");
  expect(html.detail).not.toContain("html");
  const list = await failureFrom(
    "send",
    new Response("[1,2]", { status: 400 }),
  );
  expect(list.detail).toBe("HTTP 400 · Not an answer from the app");
});

test("a dropped connection and an unexpected throw get plain words", () => {
  expect(connectionFailure("upload").message).toBe(
    "Couldn’t upload the file: embed-dash can’t be reached. Check your connection and that the app is running, then retry.",
  );
  const known = new AppError("Known.");
  expect(asAppError("send", known)).toBe(known);
  const odd = asAppError("load-servers", new TypeError("x is undefined"));
  expect(odd.message).toBe(
    "Couldn’t load servers: something went wrong in the app. Try again.",
  );
  expect(odd.detail).toBe("TypeError");
  expect(asAppError("send", "boom").detail).toBeNull();
});

test.each(["edit", "retry-edit"] as const)(
  "%s failures describe updates and keep technical text in Details",
  (action) => {
    const missing = describeFailure(action, 422, {
      code: "UPLOAD_MISSING",
      error: "Stored upload missing",
    });
    expect(missing.message).toContain("nothing was changed");
    expect(missing.message).not.toContain("nothing was sent");
    expect(missing.message).not.toContain("Stored upload missing");
    expect(missing.detail).toContain("Stored upload missing");
    expect(
      describeFailure(action, 409, { code: "EDIT_IN_PROGRESS" }).message,
    ).toContain("Wait for every copy to answer");
    expect(
      describeFailure(action, 409, { code: "NO_EDITABLE_COPIES" }).message,
    ).toContain("Compose a new message");
  },
);
