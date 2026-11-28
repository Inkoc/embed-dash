import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker, useBeforeUnload, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, LockKeyhole } from "lucide-react";
import {
  historyDetailSchema,
  type MessagePayload,
  type HistoryDetail,
} from "@embed-dash/shared";
import { useDraft, toMessage, withIds } from "./draft";
import { newSendId, startSend, SendFailure } from "../send/sendApi";
import { Verdict, SlipDetail } from "../send/SendPanel";
import { messageSummary } from "../send/summary";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Session } from "../shell/SessionGate";
import { ForwardKeys, forwardShortcut } from "../ui/Keys";
import composeStyles from "./ComposeView.module.css";
import trayStyles from "../send/Tray.module.css";
import styles from "./EditPanel.module.css";

const connectionProblem =
  "Unable to connect. Check your connection and try again.";

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
  busy: boolean;
  problem: string;
  result: HistoryDetail["edit"] | null;
  loading: boolean;
  queryProblem: string;
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
  const { editing, draft, markEdited } = useDraft();
  const client = useQueryClient();
  const [problem, setProblem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const attempt = useRef<{ id: string; payload: MessagePayload } | null>(null);
  const running = useRef(false);
  const query = useQuery({
    queryKey: ["edit-result", editing?.id, activeId],
    enabled: !!editing && !!activeId,
    retry: false,
    queryFn: async () => {
      try {
        const response = await fetch(`/api/sends/${editing!.id}`);
        if (!response.ok) throw new Error();
        return historyDetailSchema.parse(await response.json());
      } catch {
        throw new Error(
          "Could not load update results. Check your connection and try again.",
        );
      }
    },
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
    setProblem("");
    const payload = {
      ...toMessage(draft),
      pings: editing.payload.pings,
      silent: editing.payload.silent,
    };
    // An unchanged lost request keeps its ID; changed content is a new full-state edit.
    if (
      !attempt.current ||
      JSON.stringify(attempt.current.payload) !== JSON.stringify(payload)
    )
      attempt.current = { id: newSendId(), payload };
    const body = attempt.current;
    setActiveId(body.id);
    try {
      const response = await fetch(`/api/sends/${editing.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as {
          code?: string;
          error?: string;
        } | null;
        if (
          typeof failure?.code === "string" &&
          typeof failure.error === "string"
        ) {
          attempt.current = null;
          setActiveId(null);
          throw new SendFailure(failure.error);
        }
        throw new SendFailure(
          "The update could not be confirmed. Save again to check this update.",
        );
      }
      attempt.current = null;
      markEdited(body.payload);
      await query.refetch();
      void client.invalidateQueries({ queryKey: ["history"] });
      void client.invalidateQueries({
        queryKey: ["history-detail", editing.id],
      });
    } catch (error) {
      setProblem(
        error instanceof SendFailure ? error.message : connectionProblem,
      );
    } finally {
      running.current = false;
      setSubmitting(false);
    }
  }
  async function retry(targetId: string) {
    if (!editing || running.current) return;
    running.current = true;
    setSubmitting(true);
    setProblem("");
    try {
      await startSend(
        `/api/sends/${editing.id}/edits/retry`,
        { id: newSendId(), targetIds: [targetId] },
        csrf(),
      );
      await query.refetch();
    } catch (error) {
      setProblem(
        error instanceof SendFailure ? error.message : connectionProblem,
      );
    } finally {
      running.current = false;
      setSubmitting(false);
    }
  }
  return (
    <EditContext
      value={{
        busy: !!busy,
        problem,
        result: query.data?.edit?.id === activeId ? query.data.edit : null,
        loading: !!activeId && query.isPending,
        queryProblem: query.isError ? query.error.message : "",
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
            <Hash aria-hidden="true" />
            <div>
              <strong>#{t.channelName || t.channelId}</strong>
              <span>{t.guildName || t.guildId}</span>
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
  const { busy, save } = useEditing();
  if (!editing) return null;
  const deleted = new Set(
    editing.edit?.targets
      .filter((t) => t.error?.code === "MESSAGE_DELETED")
      .map((t) => t.id),
  );
  const count = editing.targets.filter(
    (t) => t.messageId && !deleted.has(t.id),
  ).length;
  return (
    <div className={mobile ? styles.mobileAction : styles.action}>
      {!mobile && (
        <p>
          Update {count} existing {count === 1 ? "copy" : "copies"} with the
          original mention settings.
        </p>
      )}
      <button
        className={composeStyles.primary}
        data-edit-save
        aria-keyshortcuts={forwardShortcut}
        disabled={busy || issues.length > 0}
        onClick={() => void save()}
      >
        {busy ? "Updating copies…" : "Save updates"}
        <ForwardKeys />
      </button>
      {issues.length > 0 && (
        <p role="status">
          {issues.length} {issues.length === 1 ? "problem" : "problems"} to fix
          before saving.
        </p>
      )}
    </div>
  );
}

export function EditPanel() {
  const { editing, dirty, endEdit } = useDraft();
  const { busy, result, retry, loading, queryProblem, refresh, problem } =
    useEditing();
  const [confirmClose, setConfirmClose] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  if (!editing) return null;
  const title = messageSummary(withIds(editing.payload)).headline;
  const deleted = new Set(
    editing.edit?.targets
      .filter((t) => t.error?.code === "MESSAGE_DELETED")
      .map((t) => t.id),
  );
  const copies = editing.targets.filter(
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
            Edit sent message
          </h2>
          <p className={styles.title}>{title}</p>
          <p className={styles.meta}>
            Sent{" "}
            <time dateTime={new Date(editing.createdAt).toISOString()}>
              {new Date(editing.createdAt).toLocaleString()}
            </time>{" "}
            · {copies} {copies === 1 ? "copy" : "copies"} to update
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
      <ReadOnlyChannels send={editing} />
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      {loading && (
        <p className={styles.note} role="status">
          Loading update results…
        </p>
      )}
      {queryProblem && (
        <p className={styles.problem} role="alert">
          {queryProblem} <button onClick={refresh}>Try again</button>
        </p>
      )}
      {result && (
        <div className={styles.results} aria-live="polite">
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
