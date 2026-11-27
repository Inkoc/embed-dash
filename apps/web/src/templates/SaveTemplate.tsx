import { useState } from "react";
import { Link } from "react-router";
import { BookmarkPlus, Check } from "lucide-react";
import type { Template } from "@embed-dash/shared";
import { toMessage, useDraft } from "../compose/draft";
import { NameDialog } from "./NameDialog";
import { useSaveTemplate } from "./templatesApi";
import styles from "./SaveTemplate.module.css";
import { asAppError } from "../errors";

/** The first words of the draft, so a new template starts with a sensible name. */
function suggestedName(title: string, content: string) {
  const source = title.trim() || content.trim().split("\n")[0]!.trim();
  return source.length > 60 ? `${source.slice(0, 59)}…` : source;
}

/** "Save as template" for the composer's message. */
export function SaveTemplate({
  className,
  label = "Save as template",
  onSaved,
}: {
  className: string;
  label?: string;
  onSaved: (template: Template) => void;
}) {
  const { draft } = useDraft();
  const save = useSaveTemplate();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          save.reset();
          setOpen(true);
        }}
      >
        <BookmarkPlus aria-hidden="true" />
        {label}
      </button>
      <NameDialog
        open={open}
        title="Save as template"
        initialName={suggestedName(draft.embeds[0]?.title ?? "", draft.content)}
        submitLabel="Save template"
        pending={save.isPending}
        error={save.error && asAppError("save-template", save.error)}
        onCancel={() => setOpen(false)}
        onSubmit={(name) =>
          save.mutate(
            { name, message: toMessage(draft) },
            {
              onSuccess: (template) => {
                setOpen(false);
                onSaved(template);
              },
            },
          )
        }
      >
        <p>
          Everyone who signs in here can start a message from it. Uploaded files
          are kept with the template.
        </p>
      </NameDialog>
    </>
  );
}

/**
 * What saving did. The live region is always there so the line is announced;
 * each save brings a new line that settles in.
 */
export function SavedNote({ saved }: { saved: Template | null }) {
  return (
    <p className={styles.status} role="status">
      {saved && (
        <span key={saved.updatedAt} className={styles.note}>
          <Check aria-hidden="true" />
          <span>
            Saved as template <b>{saved.name}</b>.
          </span>
          <Link to="/templates">Open Templates</Link>
        </span>
      )}
    </p>
  );
}
