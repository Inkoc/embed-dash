import { useState } from "react";
import { forumLimits, type GuildChannel } from "@embed-dash/shared";
import { useDraft } from "../compose/draft";
import { useSelection } from "./selection";
import { useGuilds } from "./guilds";
import { useSending } from "./sending";
import styles from "./DestinationFields.module.css";

export function DestinationFields({
  channels: supplied,
}: {
  channels?: GuildChannel[];
}) {
  const [selected] = useSelection();
  const guilds = useGuilds(selected.size > 0 && !supplied);
  const { publish, setPublish } = useSending();
  const channels =
    supplied ??
    guilds.data?.guilds
      .flatMap((g) => g.channels)
      .filter((c) => selected.has(c.id)) ??
    [];
  if (!channels.some((c) => c.kind === "forum" || c.kind === "announcement"))
    return null;
  return (
    <>
      <ForumFields channels={channels} />
      <div className={styles.options}>
        {channels.some((c) => c.kind === "announcement") && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
            />
            <span>
              Publish to following servers
              <small>
                Discord allows 10 publishes per hour per channel. A publish
                failure can be retried separately.
              </small>
            </span>
          </label>
        )}
      </div>
    </>
  );
}

export function ForumFields({ channels }: { channels: GuildChannel[] }) {
  const { draft, setDraft, editing } = useDraft();
  const [touched, setTouched] = useState(false);
  const forums = channels.filter((c) => c.kind === "forum");
  if (!forums.length || (editing && editing.status !== "scheduled"))
    return null;
  return (
    <div className={styles.options}>
      {!!forums.length && (
        <>
          <label>
            Post title (required)
            <input
              value={draft.forumTitle ?? ""}
              maxLength={forumLimits.title}
              aria-invalid={touched && !draft.forumTitle?.trim()}
              onBlur={() => setTouched(true)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, forumTitle: e.target.value }))
              }
            />
          </label>
          {touched && !draft.forumTitle?.trim() && (
            <p role="alert">Enter a post title for forum destinations.</p>
          )}
          {forums.map((channel) => (
            <fieldset key={channel.id}>
              <legend>
                Tags for #{channel.name}
                {channel.requireTag ? " (choose at least one)" : " (optional)"}
              </legend>
              <p>Choose up to {forumLimits.tags} tags.</p>
              {channel.availableTags?.map((tag) => (
                <label key={tag.id} className={styles.check}>
                  <input
                    type="checkbox"
                    disabled={
                      (draft.forumTags?.[channel.id]?.length ?? 0) >=
                        forumLimits.tags &&
                      !draft.forumTags?.[channel.id]?.includes(tag.id)
                    }
                    checked={
                      draft.forumTags?.[channel.id]?.includes(tag.id) ?? false
                    }
                    onChange={(e) =>
                      setDraft((d) => {
                        const tags = d.forumTags?.[channel.id] ?? [];
                        return {
                          ...d,
                          forumTags: {
                            ...d.forumTags,
                            [channel.id]: e.target.checked
                              ? [...tags, tag.id].slice(0, forumLimits.tags)
                              : tags.filter((id) => id !== tag.id),
                          },
                        };
                      })
                    }
                  />
                  {tag.name}
                </label>
              ))}
              {!channel.availableTags?.length && <p>No selectable tags.</p>}
            </fieldset>
          ))}
        </>
      )}
    </div>
  );
}
