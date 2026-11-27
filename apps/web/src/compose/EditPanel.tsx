import { useEffect, useRef, useState } from "react";
import { useBlocker, useBeforeUnload, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  historyDetailSchema,
  type MessagePayload,
  type HistoryDetail,
} from "@embed-dash/shared";
import { useDraft, toMessage } from "./draft";
import { newSendId, startSend } from "../send/sendApi";
import { Verdict, SlipDetail } from "../send/SendPanel";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Session } from "../shell/SessionGate";
import styles from "../history/HistoryView.module.css";

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
      <p>Your changes have not been saved to Discord.</p>
    </ConfirmDialog>
  );
}

export function ReadOnlyChannels({ send }: { send: HistoryDetail }) {
  return (
    <div>
      <h3>Channels · read-only</h3>
      <p>Updates use the original destinations and mention settings.</p>
      <ul aria-label="Original channels">
        {send.targets.map((t) => (
          <li key={t.id}>
            #{t.channelName || t.channelId} · {t.guildName || t.guildId}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EditPanel() {
  const { editing, draft, issues, dirty, markEdited, endEdit } = useDraft();
  const client = useQueryClient();
  const [problem, setProblem] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const attempt = useRef<{ id: string; payload: MessagePayload } | null>(null);
  const query = useQuery({
    queryKey: ["edit-result", editing?.id],
    enabled: !!editing,
    queryFn: async () => {
      const response = await fetch(`/api/sends/${editing!.id}`);
      if (!response.ok)
        throw new Error("Could not load update results. Try again.");
      return historyDetailSchema.parse(await response.json());
    },
    refetchInterval: (q) => (q.state.data?.status === "sending" ? 1000 : false),
  });
  if (!editing) return null;
  const busy = submitting || query.data?.status === "sending";
  const csrf = client.getQueryData<Session>(["session"])?.csrfToken ?? "";
  async function save() {
    setSubmitting(true);
    setProblem("");
    // Keep the exact request after a lost answer; its ID must never refer to new content.
    const body = (attempt.current ??= {
      id: newSendId(),
      payload: {
        ...toMessage(draft),
        pings: editing!.payload.pings,
        silent: editing!.payload.silent,
      },
    });
    try {
      const response = await fetch(`/api/sends/${editing!.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
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
          throw new Error(failure.error);
        }
        throw new Error(
          "The update could not be confirmed. Save again to check the same update.",
        );
      }
      attempt.current = null;
      setStarted(true);
      markEdited(body.payload);
      await query.refetch();
      void client.invalidateQueries({ queryKey: ["history"] });
      void client.invalidateQueries({
        queryKey: ["history-detail", editing!.id],
      });
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Connection lost. Save again to check this update.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function retry(targetId: string) {
    setSubmitting(true);
    setProblem("");
    try {
      await startSend(
        `/api/sends/${editing!.id}/retry`,
        { id: newSendId(), targetIds: [targetId] },
        csrf,
      );
      await query.refetch();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className={styles.view} aria-label="Edit sent message">
      <div className={styles.sheet}>
        <div className={styles.editBody}>
          <div className={styles.sectionHead}>
            <h2>Editing a sent message</h2>
            <button
              disabled={busy}
              onClick={() => {
                if (!dirty || window.confirm("Discard unsaved edits?"))
                  endEdit();
              }}
            >
              Close editor
            </button>
          </div>
          <ReadOnlyChannels send={editing} />
          <button
            disabled={busy || issues.length > 0}
            onClick={() => void save()}
          >
            {busy ? "Updating copies…" : "Save updates"}
          </button>
          {issues.length > 0 && (
            <p>Fix the message problems below before saving.</p>
          )}
          {problem && <p role="alert">{problem}</p>}
          {query.isPending && <p role="status">Loading copies…</p>}
          {query.isError && (
            <p role="alert">
              {query.error.message}{" "}
              <button onClick={() => void query.refetch()}>Try again</button>
            </p>
          )}
          {(started || query.data?.editId) && query.data && (
            <div aria-live="polite">
              <h3>Update results</h3>
              <ul>
                {query.data.targets.map((t, index) => (
                  <li className={styles.target} key={t.id}>
                    <strong>#{t.channelName}</strong>
                    <span>{t.guildName}</span>
                    {t.error?.code !== "MESSAGE_DELETED" && (
                      <Verdict state={t.status} index={index} />
                    )}
                    {t.status === "sent" && <span>Updated</span>}
                    <SlipDetail
                      target={t}
                      retrying={false}
                      disabled={!!busy}
                      onRetry={() => void retry(t.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
