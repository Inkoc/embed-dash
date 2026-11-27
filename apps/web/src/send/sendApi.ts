import {
  channelsUnavailableSchema,
  sendResultSchema,
  type SendResult,
} from "@embed-dash/shared";

/** How often a running send is asked how far it has got. */
export const pollIntervalMs = 1000;

/** A send that didn't produce results, with what the app should do about it besides saying so. */
export class SendFailure extends Error {
  constructor(
    message: string,
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
    super(message);
  }
}

const lost = () =>
  new SendFailure("The connection to embed-dash dropped.", { lost: true });

/** A random v4 id; `crypto.randomUUID` isn't there on plain-HTTP origins. */
export function newSendId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw lost();
  }
  if (response.ok) return response;
  const failure = (await response.json().catch(() => null)) as {
    code?: string;
    error?: unknown;
    missingFiles?: string[];
  } | null;
  // A proxy's error page is not an answer from the app: the request may still have run.
  if (response.status >= 500 && typeof failure?.error !== "string")
    throw lost();
  if (response.status === 401)
    throw new SendFailure(
      "Your session ended. Refresh the page and sign in again.",
    );
  if (response.status === 403)
    throw new SendFailure(
      "Your session changed. Refresh the page and try again.",
    );
  if (response.status === 404)
    throw new SendFailure("That send doesn’t exist.", { gone: true });
  const error =
    typeof failure?.error === "string"
      ? failure.error
      : "The send failed. Check the connection, then try again.";
  if (response.status === 409) {
    const refused = channelsUnavailableSchema.safeParse(failure);
    if (refused.success)
      throw new SendFailure(error, {
        unavailable: refused.data.channels.map((channel) => channel.id),
      });
  }
  if (response.status === 422 && Array.isArray(failure?.missingFiles))
    throw new SendFailure(error, { missingFiles: failure.missingFiles });
  throw new SendFailure(error);
}

/** Starts a send or a retry; the server answers once it has recorded it, and delivers on its own. */
export async function startSend(
  url: string,
  body: object,
  csrfToken: string,
): Promise<{ id: string }> {
  const response = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(body),
  });
  return (await response.json()) as { id: string };
}

export async function fetchSend(id: string): Promise<SendResult> {
  const response = await request(`/api/sends/${id}`, {});
  return sendResultSchema.parse(await response.json());
}
