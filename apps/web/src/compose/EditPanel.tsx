import { ForumReceipt } from "../send/SendPanel";
import { date } from "../history/presentation";
import { ScheduledFields } from "../send/ScheduledFields";
import { localInput, scheduleInstant } from "../send/SchedulePicker";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useBlocker, useBeforeUnload, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, LockKeyhole } from "lucide-react";
import { type MessagePayload, type HistoryDetail } from "@embed-dash/shared";
import { useDraft, toMessage, withIds } from "./draft";
import { newSendId, startSend, SendFailure, fetchEdit } from "../send/sendApi";
import { Verdict, SlipDetail } from "../send/SendPanel";
import { messageSummary } from "../send/summary";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AppError, asAppError } from "../errors";
import { FailureDetail } from "../ui/FailureDetail";
import type { Session } from "../shell/SessionGate";
import { ForwardKeys, forwardShortcut } from "../ui/Keys";
import composeStyles from "./ComposeView.module.css";
import trayStyles from "../send/Tray.module.css";
import styles from "./EditPanel.module.css";

export function EditGuard() {
  const { dirty, endEdit } = useDraft();
  const location = useLocation();
  const entered = useRef(false);
  const blocker = useBlocker(
    ({ nextLocation }) =>
      dirty && !["/", "/send"].includes(nextLocation.pathname),
  );
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  useEffect(() => {
    if (["/", "/send"].includes(location.pathname)) entered.current = true;
    else if (entered.current && blocker.state === "unblocked") endEdit();
  }, [blocker.state, endEdit, location.pathname]);
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Leave unsaved edits?"
      confirmLabel="Discard edits"
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
      onConfirm={() => {
        endEdit();
        if (blocker.state === "blocked") blocker.proceed();
      }}
    >
      <p>
        Your changes have not been saved to Discord. Your earlier draft comes
        back when you leave the editor.
      </p>
    </ConfirmDialog>
  );
}

interface Editing {
  scheduleFields: ReactNode;
  busy: boolean;
  saved: HistoryDetail | null;
  problem: AppError | null;
  result: HistoryDetail["edit"] | null;
  loading: boolean;
  queryProblem: AppError | null;
  refresh: () => void;
  save: () => Promise<void>;
  retry: (targetId: string) => Promise<void>;
}
const EditContext = createContext<Editing | null>(null);
function useEditing() {
  const value = useContext(EditContext);
  if (!value) throw new Error("Edit controls need an EditProvider");
  return value;
}

/** Shared by the desktop action and its mobile counterpart; one request owns both. */
export function EditProvider({ children }: { children: ReactNode }) {
  const { editing, draft, markEdited, setScheduleDirty } = useDraft();
  const client = useQueryClient();
  const [due, setDue] = useState(
    editing?.scheduledAt ? localInput(editing.scheduledAt) : "",
  );
  const [channels, setChannels] = useState(
    editing?.targets.map((t) => t.channelId) ?? [],
  );
  const [scheduledSaved, setScheduledSaved] = useState(false);
  const [problem, setProblem] = useState<AppError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    editing?.edit?.id ?? null,
  );
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string> | null>(
    () =>
      new Set(
        editing?.edit?.targets
          .filter((t) => t.status !== "sent")
          .map((t) => t.id),
      ),
  );
  const attempt = useRef<{ id: string; payload: MessagePayload } | null>(null);
  const running = useRef(false);
  const query = useQuery({
    queryKey: ["edit-result", editing?.id, activeId],
    enabled: !!editing && !!activeId,
    initialData: activeId === editing?.edit?.id ? editing : undefined,
    retry: false,
    queryFn: () => fetchEdit(editing!.id),
    refetchInterval: (q) =>
      activeId &&
      (!q.state.data?.edit ||
        q.state.data.edit.id !== activeId ||
        q.state.data.edit.status === "sending")
        ? 1000
        : false,
  });
  const busy = submitting || query.data?.edit?.status === "sending";
  const csrf = () => client.getQueryData<Session>(["session"])?.csrfToken ?? "";
  async function save() {
    if (!editing || running.current) return;
    running.current = true;
    setSubmitting(true);
    setProblem(null);
    const payload = {
      ...toMessage(draft),
      pings: editing.payload.pings,
      silent: editing.payload.silent,
      publish: editing.payload.publish,
    };
    if (editing.status === "scheduled") {
      try {
        const instant = scheduleInstant(due);
        if (!instant || !channels.length)
          throw new AppError(
            !instant
              ? "Choose a future date and time."
              : "Choose at least one channel.",
          );
        await startSend(
          "schedule",
          `/api/sends/${editing.id}/schedule`,
          {
            payload,
            scheduledAt: new Date(instant).toISOString(),
            channelIds: channels,
          },
          csrf(),
          "PUT",
        );
        markEdited(payload);
        setScheduleDirty(false);
        setScheduledSaved(true);
        void client.invalidateQueries({ queryKey: ["history"] });
        void client.invalidateQueries({
          queryKey: ["history-detail", editing.id],
        });
      } catch (error) {
        setProblem(asAppError("schedule", error));
      } finally {
        running.current = false;
        setSubmitting(false);
      }
      return;
    }
    // An unchanged lost request keeps its ID; changed content is a new full-state edit.
    if (
      !attempt.current ||
      JSON.stringify(attempt.current.payload) !== JSON.stringify(payload)
    )
      attempt.current = { id: newSendId(), payload };
    const body = attempt.current;
    setVisibleIds(null);
    setActiveId(body.id);
    try {
      await startSend("edit", `/api/sends/${editing.id}`, body, csrf(), "PUT");
      attempt.current = null;
      markEdited(body.payload);
      await query.refetch();
      void client.invalidateQueries({ queryKey: ["history"] });
      void client.invalidateQueries({
        queryKey: ["history-detail", editing.id],
      });
    } catch (error) {
      if (!(error instanceof SendFailure && error.details.lost)) {
        attempt.current = null;
        setActiveId(null);
      }
      setProblem(asAppError("edit", error));
    } finally {
      running.current = false;
      setSubmitting(false);
    }
  }
  async function retry(targetId: string) {
    if (!editing || running.current) return;
    running.current = true;
    setSubmitting(true);
    setProblem(null);
    try {
      await startSend(
        "retry-edit",
        `/api/sends/${editing.id}/edits/retry`,
        { targetIds: [targetId] },
        csrf(),
      );
      await query.refetch();
      void client.invalidateQueries({ queryKey: ["history"] });
      void client.invalidateQueries({
        queryKey: ["history-detail", editing.id],
      });
    } catch (error) {
      setProblem(asAppError("retry-edit", error));
    } finally {
      running.current = false;
      setSubmitting(false);
    }
  }
  return (
    <EditContext
      value={{
        scheduleFields:
          editing?.status === "scheduled" ? (
            <>
              <ScheduledFields
                due={due}
                setDue={(value) => {
                  setScheduleDirty(true);
                  setDue(value);
                  setScheduledSaved(false);
                }}
                channels={channels}
                setChannels={(value) => {
                  setScheduleDirty(true);
                  setChannels(value);
                  setScheduledSaved(false);
                }}
              />
              {scheduledSaved && <p role="status">Schedule saved.</p>}
            </>
          ) : null,
        busy: !!busy,
        saved: query.data?.edit?.id === activeId ? query.data : editing,
        problem,
        result:
          query.data?.edit?.id === activeId &&
          query.data.edit.targets.some(
            (t) => visibleIds === null || visibleIds.has(t.id),
          )
            ? {
                ...query.data.edit,
                targets: query.data.edit.targets.filter(
                  (t) => visibleIds === null || visibleIds.has(t.id),
                ),
              }
            : null,
        loading: !!activeId && query.isPending,
        queryProblem: query.isError
          ? asAppError("follow-edit", query.error)
          : null,
        refresh: () => {
          void query.refetch();
        },
        save,
        retry,
      }}
    >
      {children}
    </EditContext>
  );
}

export function ReadOnlyChannels({ send }: { send: HistoryDetail }) {
  const deleted = new Set(
    send.edit?.targets
      .filter((t) => t.error?.code === "MESSAGE_DELETED")
      .map((t) => t.id),
  );
  return (
    <div className={styles.destinations}>
      <h3>
        <LockKeyhole aria-hidden="true" />
        Original channels · read-only
      </h3>
      <ul aria-label="Original channels">
        {send.targets.map((t) => (
          <li key={t.id}>
            <div>
              <span className={styles.channelName}>
                <Hash aria-hidden="true" />
                <strong>#{t.channelName || t.channelId}</strong>
              </span>
              <span>{t.guildName || t.guildId}</span>
              <ForumReceipt target={t} />
            </div>
            <span className={styles.callNumber}>
              {!t.messageId
                ? "No confirmed copy · not edited"
                : deleted.has(t.id)
                  ? "Deleted · skipped"
                  : t.channelId}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SaveUpdatesAction({ mobile = false }: { mobile?: boolean }) {
  const { editing, issues } = useDraft();
  const { busy, save, saved } = useEditing();
  const wide = useWide();
  if (!editing) return null;
  const message = saved ?? editing;
  const deleted = new Set(
    message.edit?.targets
      .filter((t) => t.error?.code === "MESSAGE_DELETED")
      .map((t) => t.id),
  );
  const count = message.targets.filter(
    (t) => t.messageId && !deleted.has(t.id),
  ).length;
  return (
    <div className={mobile ? styles.mobileAction : styles.action}>
      {!mobile && (
        <p>
          {editing.status === "scheduled" ? (
            "Save the message, due time and destinations."
          ) : (
            <>
              Update {count} existing {count === 1 ? "copy" : "copies"} with the
              original mention settings.
            </>
          )}
        </p>
      )}
      <button
        className={composeStyles.primary}
        data-edit-save
        aria-keyshortcuts={forwardShortcut}
        disabled={busy || issues.length > 0}
        onClick={() => void save()}
      >
        {busy
          ? "Saving…"
          : editing.status === "scheduled"
            ? "Save schedule"
            : "Save updates"}
        <ForwardKeys />
      </button>
      {issues.length > 0 && (
        <p role="status">
          {issues.length} {issues.length === 1 ? "problem" : "problems"} to fix
          before saving.
        </p>
      )}
      {!mobile && wide && <UpdateOutcome />}
    </div>
  );
}

/*
 * Side by side, the preview column stays in view, so an update's outcome
 * shows under Save updates where the eye already is. Narrower, Save updates
 * is pinned to the bottom of the screen and the outcome stays in the panel.
 */
const narrowQuery = "(max-width: 68.75em)";
const subscribeToWidth = (change: () => void) => {
  const query = window.matchMedia?.(narrowQuery);
  query?.addEventListener?.("change", change);
  return () => query?.removeEventListener?.("change", change);
};
const useWide = () =>
  useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia?.(narrowQuery).matches === false,
  );

/** What became of the last update: a failure to start it, or each copy's result. */
/** Scrolls an update's outcome into view, gliding unless motion is reduced. */
const bringIntoView = (element: HTMLElement | null) =>
  element?.scrollIntoView?.({
    block: "nearest",
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });

function UpdateOutcome() {
  const { busy, result, retry, loading, queryProblem, refresh, problem } =
    useEditing();
  // A new update's results, or a failure to start or follow one, are brought
  // into view: Save updates may be pinned to the bottom of the screen with
  // its outcome at the top, or sit in a column whose results run below the
  // fold. Results restored on opening the editor stay where they are.
  const results = useRef<HTMLDivElement>(null);
  const refused = useRef<HTMLDivElement>(null);
  const lost = useRef<HTMLDivElement>(null);
  // Again once the update finishes, since its answers make the results taller.
  const stage = result && `${result.id}:${result.status}`;
  const shown = useRef(stage);
  useEffect(() => {
    if (!stage || stage === shown.current) return;
    shown.current = stage;
    bringIntoView(results.current);
  }, [stage]);
  useEffect(() => {
    if (problem) bringIntoView(refused.current);
  }, [problem]);
  // The follow-up failure is described afresh on every render, so its arrival is what counts.
  const followFailed = !!queryProblem;
  useEffect(() => {
    if (followFailed) bringIntoView(lost.current);
  }, [followFailed]);
  return (
    <>
      {problem && (
        <div ref={refused} className={styles.problem}>
          <p role="alert">{problem.message}</p>
          <FailureDetail error={problem} />
        </div>
      )}
      {loading && (
        <p className={styles.note} role="status">
          Loading update results…
        </p>
      )}
      {queryProblem && (
        <div ref={lost} className={styles.problem}>
          <p role="alert">{queryProblem.message}</p>
          <FailureDetail error={queryProblem} />
          <button onClick={refresh}>Try again</button>
        </div>
      )}
      {result && (
        <div ref={results} className={styles.results} aria-live="polite">
          <h3>Update results</h3>
          <ul>
            {result.targets.map((t, index) => (
              <li className={trayStyles.slip} data-result={t.status} key={t.id}>
                <span className={trayStyles.slipText}>
                  <b>#{t.channelName}</b>
                  <small>{t.guildName}</small>
                </span>
                {t.error?.code !== "MESSAGE_DELETED" && (
                  <Verdict
                    state={t.status}
                    label={
                      t.status === "sent"
                        ? "Updated"
                        : t.status === "pending" || t.status === "posting"
                          ? "Updating"
                          : undefined
                    }
                    index={index}
                  />
                )}
                <SlipDetail
                  target={t}
                  retrying={false}
                  disabled={busy}
                  onRetry={() => void retry(t.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function EditPanel() {
  const { editing, dirty, endEdit } = useDraft();
  const { busy, saved, scheduleFields } = useEditing();
  const wide = useWide();
  const [confirmClose, setConfirmClose] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  if (!editing) return null;
  const message = saved ?? editing;
  const title = messageSummary(withIds(message.payload)).headline;
  const deleted = new Set(
    message.edit?.targets
      .filter((t) => t.error?.code === "MESSAGE_DELETED")
      .map((t) => t.id),
  );
  const copies = message.targets.filter(
    (t) => t.messageId && !deleted.has(t.id),
  ).length;
  const close = () => {
    endEdit();
    requestAnimationFrame(() =>
      document.getElementById("compose-title")?.focus(),
    );
  };
  return (
    <section className={styles.panel} aria-labelledby="edit-heading">
      <header className={styles.head}>
        <div>
          <h2 id="edit-heading" tabIndex={-1} ref={heading}>
            {editing.status === "scheduled"
              ? "Edit scheduled message"
              : "Edit sent message"}
          </h2>
          <p className={styles.title}>{title}</p>
          <p className={styles.meta}>
            {editing.status === "scheduled" ? "Prepared" : "Sent"}{" "}
            <time dateTime={new Date(editing.createdAt).toISOString()}>
              {date(editing.createdAt)}
            </time>{" "}
            {editing.status === "scheduled" ? (
              "· Waiting for the scheduled time"
            ) : (
              <>
                · {copies} {copies === 1 ? "copy" : "copies"} to update
              </>
            )}
          </p>
        </div>
        <button
          ref={closeButton}
          className={composeStyles.quiet}
          disabled={busy}
          onClick={() => (dirty ? setConfirmClose(true) : close())}
        >
          Close editor
        </button>
      </header>
      <p className={styles.note}>
        Your earlier draft comes back when you close the editor.
      </p>
      {scheduleFields ? (
        <div className={styles.schedule}>{scheduleFields}</div>
      ) : (
        <>
          {message.targets.some((t) => t.channelKind === "forum") && (
            <p className={styles.note}>
              Forum updates change only the starter message. Post titles and
              tags stay as sent.
            </p>
          )}
          <ReadOnlyChannels send={message} />
        </>
      )}
      {!wide && <UpdateOutcome />}
      <ConfirmDialog
        open={confirmClose}
        title="Discard unsaved edits?"
        confirmLabel="Discard edits"
        onConfirm={close}
        onCancel={() => {
          setConfirmClose(false);
          requestAnimationFrame(() => closeButton.current?.focus());
        }}
      >
        <p>
          Your changes have not been saved to Discord. Your earlier draft will
          be restored.
        </p>
      </ConfirmDialog>
    </section>
  );
}
