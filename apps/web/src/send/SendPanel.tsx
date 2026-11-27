import { useState } from "react";
import { Link } from "react-router";
import {
  BellOff,
  Check,
  CircleHelp,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  messageLink,
  pingKinds,
  type Issue,
  type PingKind,
  type SendTarget,
} from "@embed-dash/shared";
import type { Draft } from "../compose/draft";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useSending } from "./sending";
import { messageSummary, plural, tally } from "./summary";
import type { TrayEntry } from "./Tray";
import styles from "./SendPanel.module.css";

const pingLabels: Record<PingKind, { label: string; hint: string }> = {
  users: { label: "People", hint: "@name mentions" },
  roles: { label: "Roles", hint: "@role mentions" },
  everyone: { label: "Everyone", hint: "@everyone and @here" },
};

/** Per-send delivery choices. Both start off: mentions show but don't notify, and the push goes out. */
export function DeliveryOptions({ channels }: { channels: number }) {
  const { pings, setPing, silent, setSilent } = useSending();
  return (
    <div className={styles.options}>
      <fieldset>
        <legend>Let mentions notify</legend>
        <div className={styles.checks}>
          {pingKinds.map((kind) => (
            <label key={kind} className={styles.check}>
              <input
                type="checkbox"
                checked={pings.includes(kind)}
                onChange={(event) => setPing(kind, event.target.checked)}
              />
              <span>
                {pingLabels[kind].label}
                <small>{pingLabels[kind].hint}</small>
              </span>
            </label>
          ))}
        </div>
        {pings.length === 0 ? (
          <p className={styles.hint}>
            Off: mentions in the text appear but notify nobody.
          </p>
        ) : (
          <p className={styles.warning} role="status">
            <TriangleAlert aria-hidden="true" />
            <span>
              Pings are on. Everyone mentioned will be notified in{" "}
              {plural(channels, "channel", "channels")}, and that can’t be
              undone.
            </span>
          </p>
        )}
      </fieldset>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={silent}
          onChange={(event) => setSilent(event.target.checked)}
        />
        <span>
          Send silently
          <small>
            No push or desktop notification; a badge may still show.
          </small>
        </span>
      </label>
    </div>
  );
}

/** Why the Send button is disabled, with a way to the field behind each problem. */
export function BlockedList({ issues }: { issues: Issue[] }) {
  const listed = 4;
  return (
    <div className={styles.blocked}>
      <p>
        <X aria-hidden="true" />
        {plural(issues.length, "problem", "problems")} to fix before sending
      </p>
      <ul>
        {issues.slice(0, listed).map((issue) => (
          <li key={`${issue.path}:${issue.message}`}>
            <span>
              <b>{issue.label}:</b> {issue.message}
            </span>
            <Link to="/" state={{ reveal: issue.path }}>
              Go to the field
              <span className="visually-hidden"> for {issue.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {issues.length > listed && (
        <p className={styles.more}>
          and {issues.length - listed} more, listed as you fix these.
        </p>
      )}
    </div>
  );
}

/** ✓ Sent, ✗ Failed, ? Unconfirmed or a spinner: an icon and a word every time. */
export function Verdict({
  state,
  index,
}: {
  state: "waiting" | SendTarget["status"];
  index: number;
}) {
  const word = {
    waiting: "Sending",
    pending: "Sending",
    sent: "Sent",
    failed: "Failed",
    unknown: "Unconfirmed",
  }[state];
  return (
    <span
      className={styles.verdict}
      data-state={state}
      // The reveal staggers down the tray, capped so a long list still lands quickly.
      style={{ "--n": Math.min(index, 8) } as React.CSSProperties}
    >
      {state === "waiting" || state === "pending" ? (
        <LoaderCircle className={styles.spin} aria-hidden="true" />
      ) : state === "unknown" ? (
        <CircleHelp aria-hidden="true" />
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.stroke}>
          <path
            d={
              state === "sent" ? "M3 8.5 6.5 12 13 4.5" : "M4 4 12 12M12 4 4 12"
            }
          />
        </svg>
      )}
      <span className={styles.word}>{word}</span>
    </span>
  );
}

/** What a finished slip adds under its name: the link to the message, or the cause and what to do. */
export function SlipDetail({
  target,
  retrying,
  disabled,
  onRetry,
}: {
  target: SendTarget;
  retrying: boolean;
  disabled: boolean;
  onRetry: () => void;
}) {
  const name = `#${target.channelName} in ${target.guildName}`;
  if (retrying) return null;
  if (target.status === "sent" && target.messageId)
    return (
      <div className={styles.detail}>
        <a
          href={messageLink({
            guildId: target.guildId,
            channelId: target.channelId,
            messageId: target.messageId,
          })}
          target="_blank"
          rel="noreferrer"
        >
          Open in Discord <ExternalLink aria-hidden="true" />
          <span className="visually-hidden"> {name} (opens in a new tab)</span>
        </a>
      </div>
    );
  if (target.status === "failed" || target.status === "unknown")
    return (
      <div className={styles.detail}>
        <p className={styles.cause}>{target.error?.message}</p>
        {target.status === "failed" ? (
          <button type="button" disabled={disabled} onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Retry <span className="visually-hidden">{name}</span>
          </button>
        ) : (
          <a
            href={`https://discord.com/channels/${target.guildId}/${target.channelId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open the channel <ExternalLink aria-hidden="true" />
            <span className="visually-hidden">{name} (opens in a new tab)</span>
          </a>
        )}
      </div>
    );
  return null;
}

/** The Send button and its confirmation, or after a send the summary and the retry. */
export function SendControls({
  draft,
  entries,
  blocked,
  describedBy,
  onDismiss,
}: {
  draft: Draft;
  entries: TrayEntry[];
  /** Why sending isn't possible right now, or null. */
  blocked: string | null;
  describedBy: string;
  onDismiss: () => void;
}) {
  const { busy, result, problem, send, retry, pings, silent } = useSending();
  const [confirming, setConfirming] = useState(false);
  const servers = new Set(entries.map((entry) => entry.guild.id));
  const count = plural(entries.length, "channel", "channels");
  const alert =
    problem && !busy ? (
      <p className={styles.problem} role="alert">
        <X aria-hidden="true" />
        {problem}
      </p>
    ) : null;

  if (result) {
    const outcome = tally(result);
    return (
      <div className={styles.controls} data-controls>
        {alert}
        {outcome.failed > 0 && (
          <button
            type="button"
            className={styles.go}
            disabled={!!busy}
            onClick={() => void retry()}
          >
            {busy
              ? `Retrying ${outcome.failed}…`
              : `Retry ${outcome.failed} failed`}
          </button>
        )}
        <button
          type="button"
          className={styles.again}
          disabled={!!busy}
          onClick={onDismiss}
        >
          New send
        </button>
      </div>
    );
  }

  const summary = messageSummary(draft);
  const byServer = [...servers].map((id) => ({
    guild: entries.find((entry) => entry.guild.id === id)!.guild,
    channels: entries.filter((entry) => entry.guild.id === id),
  }));
  return (
    <div className={styles.controls} data-controls>
      <button
        type="button"
        className={styles.go}
        disabled={!!blocked || !!busy}
        aria-describedby={describedBy}
        onClick={() => setConfirming(true)}
      >
        {busy
          ? `Sending to ${count}…`
          : entries.length
            ? `Send to ${count}`
            : "Send"}
      </button>
      {alert}
      <ConfirmDialog
        open={confirming}
        tone="primary"
        title={`Send to ${count}?`}
        confirmLabel={`Send to ${count}`}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void send(entries.map((entry) => entry.channel.id));
        }}
      >
        <div className={styles.confirm}>
          <p className={styles.message}>
            <b>{summary.headline}</b>
            {summary.parts && <small>{summary.parts}</small>}
          </p>
          <p>
            This posts to <b>{count}</b> in{" "}
            <b>{plural(servers.size, "server", "servers")}</b>.
          </p>
          <ul className={styles.destinations} aria-label="Destinations">
            {byServer.map(({ guild, channels }) => (
              <li key={guild.id}>
                <b>{guild.name}</b>
                <span>
                  {channels.map((entry) => `#${entry.channel.name}`).join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {pings.length > 0 ? (
            <p className={styles.warning}>
              <TriangleAlert aria-hidden="true" />
              <span>
                Pings are on for{" "}
                {pings
                  .map((kind) => pingLabels[kind].label.toLowerCase())
                  .join(", ")}
                : anyone mentioned will be notified in every one of these
                channels.
              </span>
            </p>
          ) : (
            <p className={styles.quietNote}>
              <Check aria-hidden="true" />
              Mentions won’t notify anyone.
            </p>
          )}
          {silent && (
            <p className={styles.quietNote}>
              <BellOff aria-hidden="true" />
              Sent silently: no push or desktop notification.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
