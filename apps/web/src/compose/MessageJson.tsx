import { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { exportMessageJson, importMessageJson } from "@embed-dash/shared";
import { toMessage, useDraft, withIds } from "./draft";
import { useEditorState } from "./editorState";
import dialogStyles from "../ui/ConfirmDialog.module.css";
import composeStyles from "./ComposeView.module.css";
import styles from "./MessageJson.module.css";

export function MessageJson() {
  const { draft, replace } = useDraft();
  const { reset } = useEditorState();
  const [mode, setMode] = useState<"import" | "export" | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
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
    if (next === "export") {
      const exported = exportMessageJson(toMessage(draft), new Date());
      setText(exported.json);
      setNotices(exported.notices);
    }
    setMode(next);
  };
  return (
    <>
      <button
        type="button"
        className={composeStyles.quiet}
        onClick={() => open("import")}
      >
        Import JSON
      </button>
      <button
        type="button"
        className={composeStyles.quiet}
        onClick={() => open("export")}
      >
        Export JSON
      </button>
      <dialog
        ref={dialog}
        className={`${dialogStyles.dialog} ${styles.dialog}`}
        aria-labelledby="json-title"
        aria-describedby="json-help"
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
            <div className={styles.file}>
              <label htmlFor="json-file">JSON file</label>
              <input
                id="json-file"
                type="file"
                accept=".json,application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const read = ++fileRead.current;
                  setError("");
                  setText("");
                  setNotices([]);
                  setStatus("Reading file…");
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
          <p role="status">{status}</p>
          <div className={dialogStyles.actions}>
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
                  reset();
                  replace(withIds(result.message));
                  setNotices(result.notices);
                  setError("");
                  setStatus("Message imported. The preview has been updated.");
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
    </>
  );
}
