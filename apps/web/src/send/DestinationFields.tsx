import { useId, useState, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import {
  forumLimits,
  deliveryErrors,
  type GuildChannel,
} from "@embed-dash/shared";
import { useDraft } from "../compose/draft";
import { useSelection } from "./selection";
import { useGuilds } from "./guilds";
import { useSending } from "./sending";
import styles from "./DestinationFields.module.css";

function Choice({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.box} aria-hidden="true">
        <Check />
      </span>
      <span>{children}</span>
    </label>
  );
}

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
  const announcements = channels.filter((c) => c.kind === "announcement");
  return (
    <>
      <ForumFields channels={channels} tray={!!supplied} />
      {!!announcements.length && (
        <div className={`${styles.options} ${supplied ? styles.tray : ""}`}>
          <Choice checked={publish} onChange={setPublish}>
            Publish to following servers
            <small>
              Discord allows 10 publishes per hour per channel. A publish
              failure can be retried separately.
            </small>
          </Choice>
        </div>
      )}
    </>
  );
}

export function ForumFields({
  channels,
  tray = false,
}: {
  channels: GuildChannel[];
  tray?: boolean;
}) {
  const { draft, setDraft, editing } = useDraft();
  const [touched, setTouched] = useState(false);
  const id = useId();
  const forums = channels.filter((c) => c.kind === "forum");
  if (!forums.length || (editing && editing.status !== "scheduled"))
    return null;
  const problem = touched && !draft.forumTitle?.trim();
  return (
    <div className={`${styles.options} ${tray ? styles.tray : ""}`}>
      <div className={styles.title}>
        <label htmlFor={id}>
          Post title <span className={styles.optional}>(required)</span>
        </label>
        <input
          id={id}
          value={draft.forumTitle ?? ""}
          maxLength={forumLimits.title}
          aria-invalid={!!problem}
          aria-describedby={problem ? `${id}-error` : undefined}
          onBlur={() => setTouched(true)}
          onChange={(e) =>
            setDraft((d) => ({ ...d, forumTitle: e.target.value }))
          }
        />
        {problem && (
          <p className={styles.problem} id={`${id}-error`} role="alert">
            <CircleAlert aria-hidden="true" />
            {deliveryErrors.FORUM_TITLE_REQUIRED}
          </p>
        )}
      </div>
      {forums.map((channel) => (
        <fieldset key={channel.id}>
          <legend>
            Tags for #{channel.name}{" "}
            <span className={styles.optional}>
              {channel.requireTag ? "(choose at least one)" : "(optional)"}
            </span>
          </legend>
          <p>Choose up to {forumLimits.tags} tags.</p>
          {channel.requireTag &&
            !channel.availableTags?.some((tag) => !tag.unavailable) && (
              <p className={styles.problem}>
                <CircleAlert aria-hidden="true" />
                {deliveryErrors.FORUM_NO_TAG_ACCESS}
              </p>
            )}
          {channel.availableTags?.map((tag) => (
            <Choice
              key={tag.id}
              checked={draft.forumTags?.[channel.id]?.includes(tag.id) ?? false}
              disabled={
                !!tag.unavailable ||
                ((draft.forumTags?.[channel.id]?.length ?? 0) >=
                  forumLimits.tags &&
                  !draft.forumTags?.[channel.id]?.includes(tag.id))
              }
              onChange={(on) =>
                setDraft((d) => {
                  const tags = d.forumTags?.[channel.id] ?? [];
                  return {
                    ...d,
                    forumTags: {
                      ...d.forumTags,
                      [channel.id]: on
                        ? [...tags, tag.id]
                        : tags.filter((id) => id !== tag.id),
                    },
                  };
                })
              }
            >
              {tag.name} {tag.unavailable && <small>{tag.unavailable}</small>}
            </Choice>
          ))}
          {!channel.availableTags?.length && !channel.requireTag && (
            <p>No tags configured.</p>
          )}
        </fieldset>
      ))}
    </div>
  );
}
