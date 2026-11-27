import { useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  FileText,
  LoaderCircle,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  megabytes,
  sanitizeFilename,
  uniqueFilename,
  uploadLimits,
  uploadProblem,
  type AttachmentDraft,
} from "@embed-dash/shared";
import type { Session } from "../shell/SessionGate";
import { useDraft } from "./draft";
import { useEditorState } from "./editorState";
import {
  contentUrl,
  discardUpload,
  isImage,
  uploadFile,
  useUploadPresent,
} from "./uploads";
import { asAppError, type AppError } from "../errors";
import { FailureDetail } from "../ui/FailureDetail";
import styles from "./Attachments.module.css";

interface Pending {
  key: number;
  name: string;
  size: number;
  /** Set once the upload has failed or was refused before it began. */
  error?: string;
  /** The server's side of a failed upload, for "Details". */
  failure?: AppError;
}

let lastKey = 0;

/** The part of the sheet where files are added, listed and removed. */
export function Attachments() {
  const { draft, setDraft, generation, isCurrent } = useDraft();
  const { focusAfter } = useEditorState();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const files = draft.attachments;
  const session = () => client.getQueryData<Session>(["session"]);
  // The session names the limit; the shared default covers a render before it has loaded.
  const maxUploadMb = session()?.maxUploadMb ?? uploadLimits.defaultFileMb;

  const add = (chosen: File[]) => {
    const maxFileBytes = maxUploadMb * 1024 * 1024;
    // Count files still uploading, so a batch can't slip past the message total.
    const counted: { size: number }[] = [
      ...files,
      ...pending.filter((item) => !item.error),
    ];
    const names = [
      ...files.map((file) => file.filename),
      ...pending.map((item) => item.name),
    ];
    for (const file of chosen) {
      const name = uniqueFilename(sanitizeFilename(file.name), names);
      const key = ++lastKey;
      const problem = uploadProblem(file, counted, maxFileBytes);
      if (problem) {
        setPending((list) => [
          ...list,
          { key, name: file.name, size: file.size, error: problem },
        ]);
        continue;
      }
      counted.push(file);
      names.push(name);
      setPending((list) => [...list, { key, name, size: file.size }]);
      uploadFile(file, name, session()?.csrfToken ?? "").then(
        (stored) => {
          // The draft it was meant for was cleared while it uploaded.
          if (!isCurrent(generation)) {
            void discardUpload(stored.id, session()?.csrfToken ?? "");
            return;
          }
          client.setQueryData(["upload", stored.id], true);
          setDraft((current) => ({
            ...current,
            attachments: [...current.attachments, stored],
          }));
          setPending((list) => list.filter((item) => item.key !== key));
        },
        (error: unknown) =>
          setPending((list) =>
            list.map((item) =>
              item.key === key
                ? {
                    ...item,
                    error: asAppError("upload", error).message,
                    failure: asAppError("upload", error),
                  }
                : item,
            ),
          ),
      );
    }
  };

  const remove = (file: AttachmentDraft, index: number) => {
    const neighbour = files[index + 1] ?? files[index - 1];
    focusAfter(neighbour ? `file-${neighbour.id}-remove` : "files-add", () =>
      setDraft((current) => ({
        ...current,
        attachments: current.attachments.filter((item) => item.id !== file.id),
      })),
    );
    void discardUpload(file.id, session()?.csrfToken ?? "");
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    add([...event.dataTransfer.files]);
  };

  const total = files.reduce((sum, file) => sum + file.size, 0);
  const rows = files.length + pending.length;
  return (
    <div className={styles.attachments}>
      <div
        className={styles.zone}
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          id="files-add"
          className={styles.choose}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden="true" />
          Choose files
        </button>
        <span className={styles.drop}>or drop them here</span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          aria-label="Files to attach"
          onChange={(event) => {
            add([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
      </div>
      <p className={styles.limits}>
        Up to {uploadLimits.attachmentsPerMessage} files, {maxUploadMb} MB each
        and {megabytes(uploadLimits.messageBytes)} together.
        {files.length > 0 && (
          <>
            {" "}
            <span className={styles.used}>
              {files.length} attached, {megabytes(total)}.
            </span>
          </>
        )}
      </p>
      {rows > 0 && (
        <ul
          className={styles.list}
          aria-label="Attached files"
          aria-live="polite"
        >
          {files.map((file, index) => (
            <FileRow
              key={file.id}
              file={file}
              onRemove={() => remove(file, index)}
            />
          ))}
          {pending.map((item) => (
            <li
              key={item.key}
              className={styles.row}
              data-state={item.error ? "failed" : "uploading"}
            >
              <span className={styles.thumb} aria-hidden="true">
                {item.error ? (
                  <CircleAlert />
                ) : (
                  <LoaderCircle className={styles.spin} />
                )}
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{item.name}</span>
                <span
                  className={styles.meta}
                  role={item.error ? "alert" : undefined}
                >
                  {item.error ?? `Uploading ${megabytes(item.size)}…`}
                </span>
                {item.failure && <FailureDetail error={item.failure} />}
              </span>
              {item.error && (
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() =>
                    setPending((list) =>
                      list.filter((other) => other.key !== item.key),
                    )
                  }
                >
                  <X aria-hidden="true" />
                  Dismiss <span className="visually-hidden">{item.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  file,
  onRemove,
}: {
  file: AttachmentDraft;
  onRemove: () => void;
}) {
  const missing = useUploadPresent(file.id) === "missing";
  return (
    <li className={styles.row} data-state={missing ? "missing" : undefined}>
      <span className={styles.thumb} aria-hidden="true">
        {isImage(file) && !missing ? (
          <img src={contentUrl(file.id)} alt="" />
        ) : missing ? (
          <CircleAlert />
        ) : (
          <FileText />
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{file.filename}</span>
        <span className={styles.meta}>
          {missing
            ? "No longer on the server. Remove it and upload the file again."
            : megabytes(file.size)}
        </span>
      </span>
      <button
        type="button"
        id={`file-${file.id}-remove`}
        className={styles.quiet}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
        Remove <span className="visually-hidden">{file.filename}</span>
      </button>
    </li>
  );
}

/**
 * "Use an uploaded image": fills a link field with `attachment://` for one of
 * the attached images. It stays one line under the link field; with nothing
 * uploaded it points to Files instead of showing an empty choice.
 */
export function UploadedImagePicker({
  id,
  value,
  label,
  onPick,
}: {
  id: string;
  value: string;
  /** Names the field the choice goes into, for screen readers. */
  label: string;
  onPick: (link: string) => void;
}) {
  const { draft } = useDraft();
  const { focusAfter } = useEditorState();
  const images = draft.attachments.filter(isImage);
  const chosen = images.find(
    (file) => value.trim() === `attachment://${file.filename}`,
  );
  if (images.length === 0)
    return (
      <p className={styles.picker}>
        <span className={styles.pickerNote}>Or use an uploaded image.</span>
        <button
          type="button"
          id={id}
          className={styles.link}
          onClick={() => focusAfter("files-add", () => {})}
        >
          <Upload aria-hidden="true" />
          Upload in Files{" "}
          <span className="visually-hidden">for the {label}</span>
        </button>
      </p>
    );
  return (
    <div className={styles.picker}>
      <label htmlFor={id} className={styles.pickerNote}>
        Use an uploaded image
        <span className="visually-hidden"> for {label}</span>
      </label>
      <select
        id={id}
        value={chosen?.filename ?? ""}
        onChange={(event) => {
          if (event.target.value) onPick(`attachment://${event.target.value}`);
        }}
      >
        <option value="">Choose a file…</option>
        {images.map((file) => (
          <option key={file.id} value={file.filename}>
            {file.filename}
          </option>
        ))}
      </select>
    </div>
  );
}
