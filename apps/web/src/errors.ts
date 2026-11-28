import {
  channelGroupLimits,
  channelGroupNameMax,
  templateNameMax,
} from "@embed-dash/shared";

/**
 * Every failure the app shows goes through here, so the copy stays specific
 * and the same everywhere. The summary is what a person reads; the detail is
 * the status, code and server wording for whoever has to fix it, shown only
 * behind "Details", and never the raw response body.
 */

export type Action =
  | "connect-bot"
  | "load-servers"
  | "load-history"
  | "load-templates"
  | "save-template"
  | "change-template"
  | "delete-template"
  | "load-groups"
  | "save-group"
  | "change-group"
  | "delete-group"
  | "schedule"
  | "send"
  | "retry"
  | "follow"
  | "edit"
  | "retry-edit"
  | "follow-edit"
  | "upload"
  | "sign-in"
  | "sign-out";

const lead: Record<Action, string> = {
  "connect-bot": "Not connected",
  "load-servers": "Couldn’t load servers",
  "load-history": "Couldn’t load history",
  "load-templates": "Couldn’t load templates",
  "save-template": "Couldn’t save the template",
  "change-template": "Couldn’t change the template",
  "delete-template": "Couldn’t delete the template",
  "load-groups": "Couldn’t load channel groups",
  "save-group": "Couldn’t save the group",
  "change-group": "Couldn’t change the group",
  "delete-group": "Couldn’t delete the group",
  schedule: "Couldn’t save the schedule",
  send: "Couldn’t send",
  retry: "Couldn’t retry",
  follow: "Couldn’t check on the send",
  edit: "Couldn’t update the message",
  "retry-edit": "Couldn’t retry the update",
  "follow-edit": "Couldn’t check on the update",
  upload: "Couldn’t upload the file",
  "sign-in": "Couldn’t sign in",
  "sign-out": "Couldn’t sign out",
};

/** A failure in words for the operator, with the technical detail kept apart. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly detail: string | null = null,
    /** The server's error code, when it sent one. */
    readonly code: string | null = null,
    /** The cause and next step without the opening, for notices that name the action themselves. */
    readonly reason: string = message,
  ) {
    super(message);
  }
}

/** Causes by server code. The ones about the message itself say nothing was sent. */
const byCode: Record<string, string> = {
  SCHEDULE_PAST: "choose a future date and time.",
  SCHEDULE_STARTED:
    "this schedule has already started or was cancelled. Refresh History to see its current state.",
  DISCORD_UNREACHABLE:
    "the app can’t reach Discord. Check the server’s network connection and DNS, then retry.",
  DISCORD_UNAVAILABLE:
    "Discord is having problems on its side. Try again in a few minutes.",
  DISCORD_RATE_LIMITED:
    "Discord asked the bot to slow down. Wait a minute, then retry.",
  DISCORD_INVALID_TOKEN:
    "Discord rejected the bot token. Copy the token from the Bot page of your application in the Discord developer portal (not the client secret or application ID), save it as the token secret and restart the app.",
  DISCORD_REQUEST_FAILED:
    "Discord refused the bot’s request. Check the bot’s access, then retry.",
  CHANNELS_UNAVAILABLE:
    "some ticked channels can’t be posted to any more, so nothing was sent. They were taken out of the tray.",
  UPLOAD_MISSING:
    "a file in this message is no longer on the server, so nothing was sent. Remove it in Compose and add it again.",
  INVALID_MESSAGE:
    "the server found a problem with the message, so nothing was sent. Check it in Compose.",
  INVALID_REQUEST:
    "the app sent a request the server couldn’t read. Refresh the page and try again.",
  SEND_IN_PROGRESS:
    "this send is still being delivered. Wait for every channel to answer.",
  EDIT_BLOCKED:
    "this message can’t be updated yet. Wait for the current delivery or update to finish, then try again.",
  EDIT_IN_PROGRESS:
    "a delivery or update is still running. Wait for every copy to answer, then try again.",
  NO_EDITABLE_COPIES:
    "there are no confirmed copies left to update. Compose a new message if you need to send it again.",
  EDIT_CONFLICT:
    "this update belongs to another message. Close the editor and open the message from History again.",
  NOTHING_TO_RETRY: "no channel is waiting for a retry.",
  NOT_FOUND: "the server has no record of this send.",
  SIGNED_OUT: "your session ended. Refresh the page and sign in again.",
  CSRF_INVALID: "your session changed. Refresh the page and try again.",
  ORIGIN_REFUSED:
    "the request didn’t come from this app’s own address. Open embed-dash at its usual address and try again.",
  PROXY_NOT_TRUSTED:
    "this page was opened through an HTTPS proxy that embed-dash isn’t set up for. Set TRUST_PROXY to the address the proxy connects from, or PUBLIC_URL to the address in your browser’s address bar, then restart the app.",
  LOCAL_ONLY:
    "this instance runs without sign-in, so it only answers on 127.0.0.1 or localhost.",
  WRONG_PASSWORD:
    "the password is incorrect. Check it and try again; it’s the instance password the server was started with.",
  TOO_MANY_ATTEMPTS:
    "too many attempts, so sign-in is paused. Wait a minute, then try again.",
  EMPTY_FILE: "the file is empty. Choose one with something in it.",
  TEMPLATE_NOT_FOUND:
    "the template no longer exists. Someone may have deleted it; refresh the list.",
  INVALID_TEMPLATE_NAME: `give it a name of 1 to ${templateNameMax} characters.`,
  INVALID_TEMPLATE_MESSAGE:
    "the server couldn’t read the message. Refresh the page and try again.",
  GROUP_NOT_FOUND:
    "the group no longer exists. Someone may have deleted it; refresh the page.",
  INVALID_GROUP_NAME: `give it a name of 1 to ${channelGroupNameMax} characters.`,
  INVALID_GROUP_CHANNELS: "tick at least one channel first.",
  TOO_MANY_GROUP_CHANNELS: `a group holds at most ${channelGroupLimits.channels} channels. Untick some, then try again.`,
  GROUP_NAME_TAKEN:
    "another group already has this name. Choose a different one.",
  GROUP_LIMIT_REACHED: `there are already ${channelGroupLimits.groups} groups. Delete one you no longer need, then save again.`,
  GROUP_CHANNELS_UNAVAILABLE:
    "some ticked channels can’t be posted to any more. Refresh the list, then try again.",
};

/** Causes by HTTP status, for answers that carry no code. */
function byStatus(action: Action, status: number): string {
  if (status === 401)
    return action === "sign-in" ? byCode.WRONG_PASSWORD! : byCode.SIGNED_OUT!;
  if (status === 403) return byCode.CSRF_INVALID!;
  if (status === 413) return "the server refused the file as too large.";
  if (status === 415) return "the server doesn’t accept this file format.";
  if (status === 429)
    return action === "sign-in"
      ? byCode.TOO_MANY_ATTEMPTS!
      : "too many requests. Wait a minute, then try again.";
  if (status >= 500)
    return "the server had a problem. Try again; if it keeps happening, check the server’s log.";
  return "the server refused the request. Try again.";
}

/** A cause standing on its own starts with a capital. */
const sentence = (cause: string) => cause[0]!.toUpperCase() + cause.slice(1);

/** The parts of an error body worth reading; anything else in it is ignored. */
export interface FailureBody {
  code?: unknown;
  error?: unknown;
}

/** Turns a refused request into a friendly error, whatever the body held. */
export function describeFailure(
  action: Action,
  status: number,
  body: FailureBody | null,
): AppError {
  const code = typeof body?.code === "string" ? body.code : null;
  const said = typeof body?.error === "string" ? body.error : null;
  // An error page from a proxy or a crashed server is not the app answering.
  const fromApp = said !== null || code !== null;
  const editing = action === "edit" || action === "retry-edit";
  const editMessageCause =
    editing && (code === "UPLOAD_MISSING" || code === "INVALID_MESSAGE")
      ? code === "UPLOAD_MISSING"
        ? "a file needed for this update is no longer on the server, so nothing was changed. Remove or replace it in the editor."
        : "the server found a problem with the message, so nothing was changed. Check it in the editor."
      : null;
  const cause =
    editMessageCause ||
    (code && byCode[code]) ||
    (status >= 500 && !fromApp
      ? "embed-dash didn’t answer. It may be offline or restarting; check that it’s running, then retry."
      : byStatus(action, status));
  // Sign-in's server wording only restates the message above it, so its
  // Details keep to the status and code.
  const signIn = action === "sign-in";
  const detail = [
    `HTTP ${status}`,
    code,
    signIn
      ? null
      : said
        ? `Server said: “${said}”`
        : fromApp
          ? null
          : "Not an answer from the app",
  ]
    .filter(Boolean)
    .join(" · ");
  return new AppError(
    `${lead[action]}: ${cause}`,
    detail,
    code,
    sentence(cause),
  );
}

/** Reads a failed response's body (when it is JSON) and describes it. */
export async function failureFrom(
  action: Action,
  response: Response,
): Promise<AppError> {
  const body = (await response.json().catch(() => null)) as FailureBody | null;
  return describeFailure(
    action,
    response.status,
    body && typeof body === "object" ? body : null,
  );
}

const unreachable =
  "embed-dash can’t be reached. Check your connection and that the app is running, then retry.";

/** No answer at all: the network, or the app is down. */
export const connectionFailure = (action: Action) =>
  new AppError(
    `${lead[action]}: ${unreachable}`,
    "No response (network error)",
    null,
    sentence(unreachable),
  );

const unexpected = "something went wrong in the app. Try again.";
// A send may have reached some channels before it went wrong, so trying again blindly could post twice.
const unexpectedSend =
  "something went wrong in the app. Look at the channels in Discord before trying again.";

/** Anything thrown that isn't already described gets a plain fallback, never its own message. */
export function asAppError(action: Action, error: unknown) {
  if (error instanceof AppError) return error;
  const cause =
    action === "send" || action === "retry" ? unexpectedSend : unexpected;
  return new AppError(
    `${lead[action]}: ${cause}`,
    error instanceof Error ? error.name : null,
    null,
    sentence(cause),
  );
}
