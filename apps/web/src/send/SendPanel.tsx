import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "../shell/SessionGate";
import { toMessage } from "../compose/draft";
import { asAppError } from "../errors";
import { newSendId, startSend } from "./sendApi";
import { SchedulePicker, scheduleInstant } from "./SchedulePicker";
import { date } from "../history/presentation";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Clock,
  Bell,
  BellOff,
  Check,
  CircleHelp,
  CircleMinus,
  Trash2,
  CopyCheck,
  ExternalLink,
  SquarePen,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import {
  megabytes,
  messageLink,
  pingKinds,
  type Issue,
  type PingKind,
  type SendResult,
  type SendTarget,
} from "@embed-dash/shared";
import type { Draft } from "../compose/draft";
import { AppError } from "../errors";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FailureDetail } from "../ui/FailureDetail";
import { useSending, type Received } from "./sending";
import { messageSummary, plural, progress, tally } from "./summary";
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
  label,
  reveal = true,
}: {
  label?: string;
  state:
    | "scheduled"
    | "cancelled"
    | "waiting"
    | "partial"
    | "deleted"
    | SendTarget["status"];
  reveal?: boolean;
  index: number;
}) {
  const word = {
    scheduled: "Scheduled",
    cancelled: "Cancelled",
    partial: "Partial",
    deleted: "Deleted in Discord",
    waiting: "Sending",
    pending: "Sending",
    posting: "Sending",
    sent: "Sent",
    failed: "Failed",
    unknown: "Unconfirmed",
  }[state];
  const waiting =
    state === "waiting" || state === "pending" || state === "posting";
  return (
    <span
      className={styles.verdict}
      data-static={!reveal || undefined}
      data-state={waiting ? "waiting" : state}
      // The reveal staggers down the tray, capped so a long list still lands quickly.
      style={{ "--n": Math.min(index, 8) } as React.CSSProperties}
    >
      {state === "scheduled" ? (
        <Clock aria-hidden="true" />
      ) : state === "cancelled" ? (
        <X aria-hidden="true" />
      ) : waiting ? (
        <LoaderCircle className={styles.spin} aria-hidden="true" />
      ) : state === "partial" ? (
        <CircleMinus aria-hidden="true" />
      ) : state === "deleted" ? (
        <Trash2 aria-hidden="true" />
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
      <span className={styles.word}>{label ?? word}</span>
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
  if (target.error?.code === "MESSAGE_DELETED")
    return <p className={styles.cause}>Deleted in Discord</p>;
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

const progressText = (
  result: SendResult,
  retrying: ReadonlySet<string> | null,
) => {
  const { done, total } = progress(result, retrying);
  return `${done} of ${total}`;
};

/** A failure the tray reports, with its technical side behind "Details". */
function Problem({ error }: { error: AppError }) {
  return (
    <div className={styles.problem}>
      <X aria-hidden="true" />
      <div>
        <p role="alert">{error.message}</p>
        <FailureDetail error={error} />
      </div>
    </div>
  );
}

/** The Send button and its confirmation, or after a send the summary and what to do next. */
export function SendControls({
  draft,
  entries,
  received,
  blocked,
  describedBy,
  onKeep,
}: {
  draft: Draft;
  entries: TrayEntry[];
  /** Ticked channels that already have this message, or may have it. */
  received: ReadonlyMap<string, Received>;
  /** Why sending isn't possible right now, or null. */
  blocked: string | null;
  describedBy: string;
  onKeep: () => void;
}) {
  const {
    busy,
    result,
    problem,
    prepare,
    send,
    retry,
    pings,
    silent,
    startOver,
  } = useSending();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [scheduleReviewed, setScheduleReviewed] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [due, setDue] = useState("");
  const [scheduleProblem, setScheduleProblem] = useState<AppError | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const scheduleId = useRef(newSendId());
  async function saveSchedule() {
    const instant = scheduleInstant(due);
    if (!instant) {
      setScheduleReviewed(true);
      setConfirming(false);
      return;
    }
    setScheduleBusy(true);
    try {
      await startSend(
        "schedule",
        "/api/sends",
        {
          id: scheduleId.current,
          payload: { ...toMessage(draft), pings, silent },
          channelIds: entries.map((e) => e.channel.id),
          scheduledAt: new Date(instant).toISOString(),
        },
        client.getQueryData<Session>(["session"])?.csrfToken ?? "",
      );
      setConfirming(false);
      void client.invalidateQueries({ queryKey: ["history"] });
      void navigate("/history?status=scheduled");
    } catch (error) {
      setScheduleProblem(asAppError("schedule", error));
    } finally {
      setScheduleBusy(false);
    }
  }
  const [confirming, setConfirming] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const servers = new Set(entries.map((entry) => entry.guild.id));
  const count = plural(entries.length, "channel", "channels");
  const alert = problem && !busy ? <Problem error={problem} /> : null;

  if (result) {
    const outcome = tally(result);
    const channels = new Set(result.targets.map((t) => t.channelId)).size;
    return (
      <div className={styles.controls} data-controls>
        {alert}
        {(busy || outcome.failed > 0) && (
          <button
            type="button"
            className={styles.go}
            disabled={!!busy}
            onClick={() => void retry()}
          >
            {busy
              ? `${busy.retrying ? "Retrying" : "Sending"} ${progressText(result, busy.retrying)}…`
              : `Retry ${outcome.failed} failed`}
          </button>
        )}
        <div className={styles.next} role="group" aria-label="Next">
          <button
            type="button"
            className={outcome.failed > 0 || busy ? styles.again : styles.go}
            disabled={!!busy}
            onClick={() => setRestarting(true)}
          >
            <SquarePen aria-hidden="true" />
            Compose a new message
          </button>
          <button
            type="button"
            className={styles.again}
            disabled={!!busy}
            onClick={onKeep}
          >
            <Undo2 aria-hidden="true" />
            Keep this draft
          </button>
        </div>
        <ConfirmDialog
          open={restarting}
          tone="primary"
          title="Start a new message?"
          confirmLabel="Clear and compose"
          onCancel={() => setRestarting(false)}
          onConfirm={() => {
            setRestarting(false);
            startOver();
            void navigate("/");
          }}
        >
          <p>
            This clears the composer and takes the{" "}
            {plural(channels, "channel", "channels")} out of the tray. The
            copies already posted stay in Discord.
          </p>
        </ConfirmDialog>
      </div>
    );
  }

  const summary = messageSummary(draft);
  const byServer = [...servers].map((id) => ({
    guild: entries.find((entry) => entry.guild.id === id)!.guild,
    channels: entries.filter((entry) => entry.guild.id === id),
  }));
  const again = entries.filter((entry) => received.has(entry.channel.id));
  return (
    <div className={styles.controls} data-controls>
      <button
        type="button"
        className={scheduling ? styles.again : styles.go}
        disabled={!!blocked || !!busy}
        aria-describedby={describedBy}
        onClick={() => {
          setScheduling(false);
          prepare();
          setConfirming(true);
        }}
      >
        {busy
          ? `Sending to ${count}…`
          : entries.length
            ? `Send to ${count}`
            : "Send"}
      </button>
      <button
        type="button"
        className={styles.again}
        disabled={!!blocked || !!busy || scheduleBusy}
        onClick={() => {
          setScheduling((value) => !value);
          setScheduleReviewed(false);
          setScheduleProblem(null);
        }}
      >
        {scheduling ? "Close schedule picker" : "Schedule"}
      </button>
      {scheduling && (
        <>
          <SchedulePicker
            value={due}
            onChange={setDue}
            attempted={scheduleReviewed}
            tray
          />
          <button
            type="button"
            className={styles.go}
            onClick={() => {
              setScheduleReviewed(true);
              if (!scheduleInstant(due)) return;
              setScheduleProblem(null);
              setConfirming(true);
            }}
          >
            Review schedule
          </button>
          {scheduleProblem && <p role="alert">{scheduleProblem.message}</p>}
        </>
      )}
      {alert}
      <ConfirmDialog
        open={confirming}
        tone="primary"
        title={scheduling ? `Schedule to ${count}?` : `Send to ${count}?`}
        confirmLabel={
          scheduling
            ? scheduleBusy
              ? "Scheduling…"
              : "Schedule send"
            : `Send to ${count}`
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (scheduling) {
            if (!scheduleBusy) void saveSchedule();
            return;
          }
          setConfirming(false);
          void send(entries.map((entry) => entry.channel.id));
        }}
      >
        <div className={styles.confirm}>
          {scheduling && scheduleInstant(due) && (
            <div className={styles.due}>
              <p>
                Due <strong>{date(new Date(due).getTime())}</strong>
              </p>
              <small>
                You can edit or cancel it in History until delivery starts.
              </small>
            </div>
          )}
          {scheduling && scheduleProblem && (
            <p role="alert">{scheduleProblem.message}</p>
          )}
          <p className={styles.message}>
            <b>{summary.headline}</b>
            {summary.parts && <small>{summary.parts}</small>}
          </p>
          {draft.attachments.length > 0 && (
            <ul className={styles.files} aria-label="Files">
              {draft.attachments.map((file) => (
                <li key={file.id}>
                  <Paperclip aria-hidden="true" />
                  <span>{file.filename}</span>
                  <small>{megabytes(file.size)}</small>
                </li>
              ))}
            </ul>
          )}
          <p>
            This posts to <b>{count}</b> in{" "}
            <b>{plural(servers.size, "server", "servers")}</b>.
          </p>
          {/* A long list scrolls and holds nothing focusable, so it takes focus for keyboard scrolling. */}
          <div
            className={styles.destinations}
            role="region"
            aria-label={`Destinations, ${count}`}
            tabIndex={0}
          >
            <ul>
              {byServer.map(({ guild, channels }) => (
                <li key={guild.id}>
                  <b>{guild.name}</b>
                  <span>
                    {channels
                      .map((entry) => `#${entry.channel.name}`)
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {again.length > 0 && (
            <p className={styles.warning}>
              <CopyCheck aria-hidden="true" />
              <span>
                {again.length === 1
                  ? "1 of these channels already has"
                  : `${again.length} of these channels already have`}{" "}
                this message:{" "}
                {again.map((entry) => `#${entry.channel.name}`).join(", ")}.
                They’ll get a second copy.
              </span>
            </p>
          )}
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
          <p className={styles.quietNote}>
            {silent ? (
              <>
                <BellOff aria-hidden="true" />
                Sent silently: no push or desktop notification.
              </>
            ) : (
              <>
                <Bell aria-hidden="true" />
                Sent with the usual push and desktop notification.
              </>
            )}
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
