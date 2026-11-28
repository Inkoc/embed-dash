import type {
  APIEmbed,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import { AllowedMentionsTypes, MessageFlags } from "discord-api-types/v10";
import type { EmbedDraft, MessagePayload } from "@embed-dash/shared";

const pingTypes = {
  users: AllowedMentionsTypes.User,
  roles: AllowedMentionsTypes.Role,
  everyone: AllowedMentionsTypes.Everyone,
} as const;

/** A field Discord treats as absent when empty is left out rather than sent blank. */
const present = (text: string) => (text.trim() ? text.trim() : undefined);

function discordEmbed(embed: EmbedDraft, sentAt: Date): APIEmbed {
  const timestamp =
    embed.timestamp === "now"
      ? sentAt
      : embed.timestamp
        ? new Date(embed.timestamp)
        : undefined;
  const name = present(embed.author.name);
  const footer = present(embed.footer.text);
  return {
    title: present(embed.title),
    url: present(embed.url),
    description: present(embed.description),
    color: Number.parseInt(embed.color.slice(1), 16),
    timestamp: timestamp?.toISOString(),
    author: name
      ? {
          name,
          url: present(embed.author.url),
          icon_url: present(embed.author.iconUrl),
        }
      : undefined,
    fields: embed.fields.length ? embed.fields : undefined,
    image: present(embed.image) ? { url: embed.image.trim() } : undefined,
    thumbnail: present(embed.thumbnail)
      ? { url: embed.thumbnail.trim() }
      : undefined,
    footer: footer
      ? { text: footer, icon_url: present(embed.footer.iconUrl) }
      : undefined,
  };
}

/**
 * The create-message body. `allowed_mentions.parse` is always present: empty
 * unless the operator opted in, so mention text never notifies by accident.
 * The embeds' "time of sending" is the send's own time, the same for every
 * channel and for a retry.
 */
export function discordMessage(
  payload: MessagePayload,
  sentAt: Date,
): RESTPostAPIChannelMessageJSONBody {
  return {
    components: payload.components?.map((row) => ({
      type: row.type,
      components: row.components.map((button) => ({
        ...button,
        label: button.label || undefined,
      })),
    })),
    content: present(payload.content) ? payload.content : undefined,
    embeds: payload.embeds.length
      ? payload.embeds.map((embed) => discordEmbed(embed, sentAt))
      : undefined,
    attachments: payload.attachments.length
      ? payload.attachments.map((file, id) => ({ id, filename: file.filename }))
      : undefined,
    allowed_mentions: {
      parse: payload.pings.map((kind) => pingTypes[kind]),
    },
    flags: payload.silent ? MessageFlags.SuppressNotifications : undefined,
  };
}

export { messageTitle, searchText } from "@embed-dash/shared";
