import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleAlert,
  PencilLine,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import type { Template } from "@embed-dash/shared";
import { useBot } from "../bot";
import { isBlank, toMessage, useDraft, withIds } from "../compose/draft";
import { useEditorState } from "../compose/editorState";
import { DiscordPreview } from "../preview/DiscordPreview";
import { asAppError, type Action, type AppError } from "../errors";
import { ClosedDrawer } from "../ui/ClosedDrawer";
import { FailureDetail } from "../ui/FailureDetail";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { NameDialog } from "./NameDialog";
import { SavedNote, SaveTemplate } from "./SaveTemplate";
import { messageSummary, updatedAt } from "./summary";
import {
  useDeleteTemplate,
  useTemplates,
  useUpdateTemplate,
} from "./templatesApi";
import styles from "./TemplatesView.module.css";

type Pending = {
  kind: "start" | "rename" | "overwrite" | "delete";
  template: Template;
} | null;

/** What a person started a message from, for the composer's note. */
export interface StartedFrom {
  name: string;
  missing: string[];
}

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TemplatesView() {
  const templates = useTemplates();
  const { draft, replace } = useDraft();
  const { reset } = useEditorState();
  const navigate = useNavigate();
  const client = useQueryClient();
  const rename = useUpdateTemplate();
  const overwrite = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const [pending, setPending] = useState<Pending>(null);
  const [saved, setSaved] = useState<Template | null>(null);
  const [failure, setFailure] = useState<{
    what: string;
    error: AppError;
  } | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const composerBlank = isBlank(draft);

  /** A changed template moves to the top of the list; it rises into place there so the eye finds it. */
  const settle = (id: string) =>
    requestAnimationFrame(() => {
      const row = list.current?.querySelector(`[data-id="${id}"]`);
      if (!row || reducedMotion()) return;
      row.animate(
        [
          { opacity: 0.4, transform: "translateY(0.5rem)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    });

  const start = (template: Template) => {
    setPending(null);
    // The presence checks would find these too; the server has just said so.
    for (const id of template.missingFiles)
      client.setQueryData(["upload", id], false);
    reset();
    replace(withIds(template.message));
    const started: StartedFrom = {
      name: template.name,
      missing: template.message.attachments
        .filter((file) => template.missingFiles.includes(file.id))
        .map((file) => file.filename),
    };
    void navigate("/", { state: { started } });
  };

  const fail = (what: string, action: Action) => (error: Error) =>
    setFailure({ what, error: asAppError(action, error) });

  let body;
  if (templates.isPending) body = <Loading />;
  else if (templates.isError)
    body = (
      <ClosedDrawer label="Not loaded" title="The templates couldn’t be loaded">
        <p role="alert">
          {asAppError("load-templates", templates.error).reason}
        </p>
        <FailureDetail error={asAppError("load-templates", templates.error)} />
        <button
          type="button"
          className={styles.primary}
          onClick={() => void templates.refetch()}
          disabled={templates.isFetching}
        >
          <RefreshCw aria-hidden="true" />
          {templates.isFetching ? "Retrying…" : "Retry"}
        </button>
      </ClosedDrawer>
    );
  else if (templates.data.length === 0)
    body = (
      <ClosedDrawer label="No templates" title="No templates yet">
        <p>
          Save a message you post again and again, such as server rules or a
          weekly digest, and start new messages from it here.
        </p>
        {composerBlank ? (
          <Link to="/" className={styles.primary}>
            Write a message in Compose
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <SaveTemplate
            className={styles.primary}
            label="Save the composer’s message"
            onSaved={(template) => {
              setSaved(template);
              settle(template.id);
            }}
          />
        )}
      </ClosedDrawer>
    );
  else
    body = (
      <ul className={styles.sheet} ref={list} aria-labelledby="templates-title">
        {templates.data.map((template) => (
          <Row
            key={template.id}
            template={template}
            composerBlank={composerBlank}
            onAction={(kind) => {
              setFailure(null);
              if (kind === "start" && isBlank(draft)) start(template);
              else setPending({ kind, template });
            }}
          />
        ))}
      </ul>
    );

  const target = pending?.template;
  return (
    <section className={styles.templates} aria-labelledby="templates-title">
      <div className={styles.head}>
        <h2 id="templates-title" tabIndex={-1} ref={heading}>
          Templates
        </h2>
        <p className={styles.meta}>
          Messages to start from, shared by everyone who signs in here.
        </p>
        {templates.data && templates.data.length > 0 && !composerBlank && (
          <SaveTemplate
            className={styles.quiet}
            label="Save the composer’s message"
            onSaved={(template) => {
              setSaved(template);
              settle(template.id);
            }}
          />
        )}
      </div>
      <SavedNote saved={saved} />
      {failure && (
        <div className={styles.problem}>
          <CircleAlert aria-hidden="true" />
          <div>
            <p role="alert">
              {failure.what} {failure.error.reason}
            </p>
            <FailureDetail error={failure.error} />
          </div>
        </div>
      )}
      {body}

      <ConfirmDialog
        open={pending?.kind === "start"}
        title="Replace the message in Compose?"
        confirmLabel="Replace message"
        onConfirm={() => target && start(target)}
        onCancel={() => setPending(null)}
      >
        <p>
          Compose holds a message that isn’t saved anywhere else. Starting from{" "}
          <b>{target?.name}</b> replaces it, and that can’t be undone. To keep
          it, save it as a template first.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.kind === "overwrite"}
        title={`Overwrite “${target?.name ?? ""}”?`}
        confirmLabel="Overwrite template"
        onConfirm={() => {
          if (!target) return;
          setPending(null);
          overwrite.mutate(
            { id: target.id, message: toMessage(draft) },
            {
              onSuccess: (template) => settle(template.id),
              onError: fail(
                `“${target.name}” wasn’t overwritten.`,
                "change-template",
              ),
            },
          );
        }}
        onCancel={() => setPending(null)}
      >
        <p>
          Its message is replaced by the one in Compose (
          {messageSummary(toMessage(draft)).toLowerCase()}). This can’t be
          undone.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.kind === "delete"}
        title={`Delete “${target?.name ?? ""}”?`}
        confirmLabel="Delete template"
        onConfirm={() => {
          if (!target) return;
          setPending(null);
          remove.mutate(target.id, {
            onSuccess: () => heading.current?.focus(),
            onError: fail(
              `“${target.name}” wasn’t deleted.`,
              "delete-template",
            ),
          });
        }}
        onCancel={() => setPending(null)}
      >
        <p>
          Messages already started from it stay as they are. This can’t be
          undone.
        </p>
      </ConfirmDialog>
      <NameDialog
        open={pending?.kind === "rename"}
        title="Rename template"
        initialName={target?.name ?? ""}
        submitLabel="Rename"
        pending={rename.isPending}
        error={rename.error && asAppError("change-template", rename.error)}
        onCancel={() => {
          setPending(null);
          rename.reset();
        }}
        onSubmit={(name) => {
          if (!target) return;
          rename.mutate(
            { id: target.id, name },
            {
              onSuccess: (template) => {
                setPending(null);
                rename.reset();
                settle(template.id);
              },
            },
          );
        }}
      />
    </section>
  );
}

function Row({
  template,
  composerBlank,
  onAction,
}: {
  template: Template;
  composerBlank: boolean;
  onAction: (kind: NonNullable<Pending>["kind"]) => void;
}) {
  const bot = useBot();
  const preview = useMemo(() => withIds(template.message), [template.message]);
  const nameId = `template-${template.id}`;
  const missing = template.message.attachments.filter((file) =>
    template.missingFiles.includes(file.id),
  );
  return (
    <li className={styles.row} data-id={template.id} aria-labelledby={nameId}>
      {/* The real preview, drawn smaller; the summary below says the same in words. */}
      <div className={styles.mini} aria-hidden="true" inert>
        <div className={styles.miniScale}>
          <DiscordPreview
            draft={preview}
            bot={bot.data}
            botPending={bot.isPending}
            time="Today"
          />
        </div>
      </div>
      <div className={styles.details}>
        <h3 id={nameId}>{template.name}</h3>
        <p className={styles.meta}>
          {messageSummary(template.message)} · Updated{" "}
          <time dateTime={template.updatedAt} className={styles.data}>
            {updatedAt(template.updatedAt)}
          </time>
        </p>
        {missing.length > 0 && (
          <p className={styles.missing}>
            <CircleAlert aria-hidden="true" />
            <span>
              {missing.length === 1
                ? "1 file is no longer on the server: "
                : `${missing.length} files are no longer on the server: `}
              <b>{missing.map((file) => file.filename).join(", ")}</b>. It’s
              marked in Compose when you start from this template.
            </span>
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.start}
            aria-describedby={nameId}
            onClick={() => onAction("start")}
          >
            Start a message
            <ArrowRight aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.quiet}
            aria-describedby={nameId}
            onClick={() => onAction("rename")}
          >
            <PencilLine aria-hidden="true" />
            Rename
          </button>
          {/* With nothing in Compose there is nothing to overwrite it with. */}
          {!composerBlank && (
            <button
              type="button"
              className={styles.quiet}
              aria-describedby={nameId}
              onClick={() => onAction("overwrite")}
            >
              <Upload aria-hidden="true" />
              Overwrite with Compose
            </button>
          )}
          <button
            type="button"
            className={styles.quiet}
            aria-describedby={nameId}
            onClick={() => onAction("delete")}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function Loading() {
  return (
    <div className={styles.sheet} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading templates…
      </p>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={styles.row} aria-hidden="true">
          <span className={`${styles.mini} ${styles.skelMini}`} />
          <span className={styles.details}>
            <span className={styles.skel} data-w="name" />
            <span className={styles.skel} data-w="meta" />
            <span className={styles.skel} data-w="actions" />
          </span>
        </div>
      ))}
    </div>
  );
}
