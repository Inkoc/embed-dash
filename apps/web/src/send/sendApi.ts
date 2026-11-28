import {
  channelsUnavailableSchema,
  historyDetailSchema,
  type HistoryDetail,
  sendResultSchema,
  type SendResult,
} from "@embed-dash/shared";
import {
  AppError,
  connectionFailure,
  describeFailure,
  type Action,
  type FailureBody,
} from "../errors";

/** How often a running send is asked how far it has got. */
export const pollIntervalMs = 1000;

/** A send that didn't produce results, with what the app should do about it besides saying so. */
export class SendFailure extends AppError {
  constructor(
    error: AppError,
    readonly details: {
      /** Channel IDs the server refused; nothing was sent anywhere. */
      unavailable?: string[];
      /** Upload IDs the server no longer has. */
      missingFiles?: string[];
      /** No usable answer came back, so the request may or may not have taken effect. */
      lost?: boolean;
      /** The server has no such send. */
      gone?: boolean;
    } = {},
  ) {
    super(error.message, error.detail, error.code);
  }
}

const lost = (action: Action) =>
  new SendFailure(connectionFailure(action), { lost: true });

/** A random v4 id; `crypto.randomUUID` isn't there on plain-HTTP origins. */
export function newSendId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function request(
  action: Action,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw lost(action);
  }
  if (response.ok) return response;
  const body = (await response.json().catch(() => null)) as
    (FailureBody & { missingFiles?: unknown }) | null;
  // A proxy's error page is not an answer from the app: the request may still have run.
  if (response.status >= 500 && typeof body?.error !== "string")
    throw lost(action);
  const error = describeFailure(action, response.status, body);
  if (response.status === 404) throw new SendFailure(error, { gone: true });
  if (response.status === 409) {
    const refused = channelsUnavailableSchema.safeParse(body);
    if (refused.success)
      throw new SendFailure(error, {
        unavailable: refused.data.channels.map((channel) => channel.id),
      });
  }
  if (response.status === 422 && Array.isArray(body?.missingFiles))
    throw new SendFailure(error, {
      missingFiles: body.missingFiles.filter(
        (id): id is string => typeof id === "string",
      ),
    });
  throw new SendFailure(error);
}

/** Starts a send or a retry; the server answers once it has recorded it, and delivers on its own. */
export async function startSend(
  action: "send" | "retry" | "edit" | "retry-edit",
  url: string,
  body: object,
  csrfToken: string,
  method: "POST" | "PUT" = "POST",
): Promise<{ id: string }> {
  const response = await request(action, url, {
    method,
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(body),
  });
  return (await response.json()) as { id: string };
}

export async function fetchSend(id: string): Promise<SendResult> {
  const response = await request("follow", `/api/sends/${id}`, {});
  return sendResultSchema.parse(await response.json());
}

export async function fetchEdit(id: string): Promise<HistoryDetail> {
  const response = await request("follow-edit", `/api/sends/${id}`, {});
  return historyDetailSchema.parse(await response.json());
}
