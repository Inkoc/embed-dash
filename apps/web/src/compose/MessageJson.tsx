import { useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  FileInput,
  FileOutput,
  Upload,
} from "lucide-react";
import {
  exportMessageJson,
  importMessageJson,
  type JsonImportResult,
} from "@embed-dash/shared";
import { isBlank, toMessage, useDraft, withIds, type Draft } from "./draft";
import { useEditorState } from "./editorState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import dialogStyles from "../ui/ConfirmDialog.module.css";
import { keepTabInside } from "../ui/dialogTab";
import composeStyles from "./ComposeView.module.css";
import fileStyles from "./Attachments.module.css";
import styles from "./MessageJson.module.css";

/** The one status line that is progress rather than an outcome, so it carries no tick. */
const reading = "Reading file…";

/** An import's outcome, with the draft it produced, so the note can go once that draft changes. */
export interface Imported {
  notices: string[];
  draft: Draft;
}

export function MessageJson({
  onImported,
}: {
  onImported: (imported: Imported) => void;
}) {
  const { draft, replace } = useDraft();
  const { reset, setPane, focusAfter } = useEditorState();
  const [pending, setPending] = useState<Extract<
    JsonImportResult,
    { ok: true }
  > | null>(null);
  const [mode, setMode] = useState<"import" | "export" | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileRead = useRef(0);
  useEffect(() => {
    if (mode) {
      dialog.current?.showModal();
      input.current?.focus();
    } else if (dialog.current?.open) dialog.current.close();
  }, [mode]);
  const close = () => {
    fileRead.current++;
    setMode(null);
  };
  const open = (next: "import" | "export") => {
    setError("");
    setStatus("");
    setNotices([]);
    setText("");
    setFileName("");
    if (next === "export") {
      const exported = exportMessageJson(toMessage(draft), new Date());
      setText(exported.json);
      setNotices(exported.notices);
    }
    setMode(next);
  };
  const applyImport = (result: Extract<JsonImportResult, { ok: true }>) => {
    focusAfter("json-result", () => {
      reset();
      setPane("edit");
      const imported = withIds(result.message);
      replace(imported);
      onImported({ notices: result.notices, draft: imported });
      setPending(null);
      close();
    });
  };
  return (
    <>
      <button
        type="button"
        className={composeStyles.quiet}
        onClick={() => open("import")}
      >
        <FileInput aria-hidden="true" />
        Import JSON
      </button>
      <button
        type="button"
        className={composeStyles.quiet}
        onClick={() => open("export")}
      >
        <FileOutput aria-hidden="true" />
        Export JSON
      </button>
      <dialog
        ref={dialog}
        className={`${dialogStyles.dialog} ${styles.dialog}`}
        aria-labelledby="json-title"
        aria-describedby="json-help"
        onKeyDown={keepTabInside}
        onCancel={close}
        onClose={close}
      >
        <div className={dialogStyles.sheet}>
          <h2 id="json-title">
            {mode === "export" ? "Export message JSON" : "Import message JSON"}
          </h2>
          <p id="json-help">
            {mode === "export"
              ? "Copy or download this portable message. Uploaded files are not included."
              : "Paste a message object or choose a JSON file. Import replaces the current draft and its files after validation."}
          </p>
          {mode === "import" && (
            <div className={fileStyles.zone}>
              <button
                type="button"
                className={fileStyles.choose}
                aria-describedby="json-file-name"
                onClick={() => fileInput.current?.click()}
              >
                <Upload aria-hidden="true" />
                Choose a file
              </button>
              <span id="json-file-name" className={fileStyles.drop}>
                {fileName || "or paste the JSON below"}
              </span>
              <input
                ref={fileInput}
                type="file"
                hidden
                tabIndex={-1}
                aria-label="JSON file"
                accept=".json,application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  // Cleared, so choosing the same file again reads it again.
                  event.target.value = "";
                  if (!file) return;
                  setFileName(file.name);
                  const read = ++fileRead.current;
                  setError("");
                  setText("");
                  setNotices([]);
                  setStatus("");
                  if (file.size > 1024 * 1024) {
                    setError(
                      "JSON files must be 1 MB or smaller. Choose a smaller file or paste the message JSON.",
                    );
                    return;
                  }
                  setStatus(reading);
                  try {
                    const value = await file.text();
                    if (read === fileRead.current) {
                      setText(value);
                      setStatus("File ready to import.");
                    }
                  } catch {
                    if (read === fileRead.current) {
                      setError(
                        "Could not read that file. Choose it again or paste JSON.",
                      );
                      setStatus("");
                    }
                  }
                }}
              />
            </div>
          )}
          <label htmlFor="message-json">Message JSON</label>
          <textarea
            ref={input}
            id="message-json"
            className={styles.text}
            rows={10}
            value={text}
            readOnly={mode === "export"}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "json-error" : undefined}
            onChange={(event) => {
              fileRead.current++;
              setText(event.target.value);
              setError("");
              setNotices([]);
              setStatus("");
            }}
          />
          {error && (
            <p id="json-error" className={styles.error} role="alert">
              <CircleAlert aria-hidden="true" />
              {error}
            </p>
          )}
          {notices.length > 0 && (
            <div className={styles.notice} role="status">
              <b>Compatibility notice</b>
              <ul>
                {notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            </div>
          )}
          <div role="status" className={status ? undefined : "visually-hidden"}>
            {status && (
              <p className={styles.success}>
                {status !== reading && <Check aria-hidden="true" />}
                {status}
              </p>
            )}
          </div>
          <div className={`${dialogStyles.actions} ${styles.actions}`}>
            <button
              type="button"
              className={dialogStyles.cancel}
              onClick={close}
            >
              Close
            </button>
            {mode === "import" ? (
              <button
                type="button"
                className={dialogStyles.primary}
                onClick={() => {
                  setStatus("");
                  setNotices([]);
                  const result = importMessageJson(text);
                  if (!result.ok) {
                    setError(result.error);
                    input.current?.focus();
                    return;
                  }
                  setError("");
                  if (isBlank(draft)) applyImport(result);
                  else setPending(result);
                }}
              >
                Replace draft
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={dialogStyles.cancel}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(text);
                      setStatus("JSON copied.");
                      setError("");
                    } catch {
                      setStatus("");
                      setError(
                        "Could not copy JSON. Select the text to copy it, or download the file.",
                      );
                    }
                  }}
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  className={dialogStyles.primary}
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([text], { type: "application/json" }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "message.json";
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 0);
                    setStatus("JSON downloaded.");
                  }}
                >
                  Download JSON
                </button>
              </>
            )}
          </div>
        </div>
      </dialog>
      <ConfirmDialog
        open={pending !== null}
        title="Replace the current draft?"
        confirmLabel="Replace draft"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) applyImport(pending);
        }}
      >
        <p>
          The current message and its uploaded files will be replaced by the
          imported message.
        </p>
      </ConfirmDialog>
    </>
  );
}
