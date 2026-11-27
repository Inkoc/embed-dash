import {
  channelsUnavailableSchema,
  sendResultSchema,
  type SendResult,
} from "@embed-dash/shared";

/** A send that didn't produce results, with what the app should do about it besides saying so. */
export class SendFailure extends Error {
  constructor(
    message: string,
    readonly details: {
      /** Channel IDs the server refused; nothing was sent anywhere. */
      unavailable?: string[];
      /** Upload IDs the server no longer has. */
      missingFiles?: string[];
    } = {},
  ) {
    super(message);
  }
}

const fallback = "The send failed. Check the connection, then try again.";

/** POSTs JSON to a send route and turns every kind of refusal into a `SendFailure`. */
export async function postSend(
  url: string,
  body: object,
  csrfToken: string,
): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // The request may have reached the server before the connection dropped.
    throw new SendFailure(
      "The connection dropped before an answer came back, so the message may already have been posted. Look in the channels before sending again.",
    );
  }
  if (response.ok) return sendResultSchema.parse(await response.json());
  const failure = (await response.json().catch(() => null)) as {
    code?: string;
    error?: unknown;
    missingFiles?: string[];
  } | null;
  if (response.status === 401)
    throw new SendFailure(
      "Your session ended. Refresh the page and sign in again; nothing was sent.",
    );
  if (response.status === 403)
    throw new SendFailure(
      "Your session changed. Refresh the page and try again; nothing was sent.",
    );
  const error = typeof failure?.error === "string" ? failure.error : fallback;
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
