import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChannelGroup, GuildsResponse } from "@embed-dash/shared";
import {
  BookmarkPlus,
  Check,
  CircleAlert,
  Ellipsis,
  Layers,
  Lock,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { asAppError, type AppError } from "../errors";
import { NameDialog } from "../templates/NameDialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import dialogStyles from "../ui/ConfirmDialog.module.css";
import { keepTabInside } from "../ui/dialogTab";
import { FailureDetail } from "../ui/FailureDetail";
import { groupState, type GroupState } from "./groups";
import {
  useChannelGroups,
  useDeleteGroup,
  useSaveGroup,
  useUpdateGroup,
} from "./groupsApi";
import pickStyles from "./SendView.module.css";
import styles from "./ChannelGroups.module.css";

interface Props {
  listing: GuildsResponse;
  /** The ticked channels the bot can post to, in catalogue order. */
  ticked: { id: string; guildId: string; guildName: string }[];
  selected: ReadonlySet<string>;
  locked: boolean;
  setSelected: (next: ReadonlySet<string>) => void;
}

/** What the last action did, with a way back when it changed the selection. */
type Note =
  | {
      kind: "added";
      text: string;
      before: ReadonlySet<string>;
      after: ReadonlySet<string>;
    }
  | { kind: "done"; text: string };

const channels = (n: number) => (n === 1 ? "1 channel" : `${n} channels`);
const servers = (n: number) => (n === 1 ? "1 server" : `${n} servers`);

/**
 * Saved sets of channels, above the quick picks. Selecting a group adds its
 * channels to the ticked ones, like the other picks; an unavailable channel
 * is skipped and named in the group's dialog.
 */
export function ChannelGroups({
  listing,
  ticked,
  selected,
  locked,
  setSelected,
}: Props) {
  const groups = useChannelGroups();
  const save = useSaveGroup();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const saveButton = useRef<HTMLButtonElement>(null);

  const states = useMemo(
    () =>
      new Map(
        (groups.data ?? []).map((g) => [g.id, groupState(g, listing)] as const),
      ),
    [groups.data, listing],
  );

  const apply = (group: ChannelGroup, state: GroupState) => {
    const already = state.available.filter((id) => selected.has(id)).length;
    const added = state.available.length - already;
    const skipped = state.entries.length - state.available.length;
    const after = new Set([...selected, ...state.available]);
    const parts = [
      added
        ? `Added ${channels(added)} from ${group.name}.`
        : `Every available channel in ${group.name} was already ticked.`,
      added && already
        ? `${already === 1 ? "1 was" : `${already} were`} already ticked.`
        : "",
      skipped
        ? `${skipped === 1 ? "1 unavailable channel was" : `${skipped} unavailable channels were`} skipped.`
        : "",
    ];
    const text = parts.filter(Boolean).join(" ");
    if (added) {
      setSelected(after);
      setNote({ kind: "added", text, before: selected, after });
    } else setNote({ kind: "done", text });
  };

  const tickedServers = new Set(ticked.map((t) => t.guildId)).size;
  const openGroup = groups.data?.find((g) => g.id === open);
  const labelId = useId();

  return (
    <div className={styles.groups}>
      <div
        className={styles.row}
        role="group"
        aria-labelledby={labelId}
        aria-busy={groups.isPending || undefined}
      >
        <span id={labelId} className={styles.label}>
          Groups
        </span>
        {groups.isPending ? (
          <>
            <span className="visually-hidden" role="status">
              Loading channel groups…
            </span>
            <span className={styles.skel} aria-hidden="true" />
            <span className={styles.skel} aria-hidden="true" />
          </>
        ) : groups.isError ? (
          <span className={styles.failed}>
            <CircleAlert aria-hidden="true" />
            <span role="alert">
              {asAppError("load-groups", groups.error).message}
            </span>
            <button
              type="button"
              className={pickStyles.pick}
              onClick={() => void groups.refetch()}
              disabled={groups.isFetching}
            >
              <RefreshCw aria-hidden="true" />
              {groups.isFetching ? "Retrying…" : "Retry"}
            </button>
          </span>
        ) : (
          groups.data.map((group) => {
            const state = states.get(group.id)!;
            const skipped = state.entries.length - state.available.length;
            return (
              <span key={group.id} className={styles.group}>
                <button
                  type="button"
                  className={`${pickStyles.pick} ${styles.apply}`}
                  disabled={!state.available.length || locked}
                  onClick={() => apply(group, state)}
                >
                  <Layers aria-hidden="true" />
                  <span className={styles.name}>{group.name}</span>
                  <span className={pickStyles.n} aria-hidden="true">
                    {skipped
                      ? `${state.available.length}/${state.entries.length}`
                      : state.entries.length}
                  </span>
                  {skipped > 0 && (
                    <Lock className={styles.lock} aria-hidden="true" />
                  )}
                  <span className="visually-hidden">
                    {" "}
                    ({channels(state.available.length)}
                    {skipped > 0 && `, ${skipped} unavailable`})
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.more}
                  aria-haspopup="dialog"
                  aria-label={`Open group ${group.name}`}
                  title={`Open group ${group.name}`}
                  onClick={() => setOpen(group.id)}
                >
                  <Ellipsis aria-hidden="true" />
                </button>
              </span>
            );
          })
        )}
        <button
          ref={saveButton}
          type="button"
          className={pickStyles.pick}
          disabled={!ticked.length}
          onClick={() => {
            save.reset();
            setSaving(true);
          }}
        >
          <BookmarkPlus aria-hidden="true" />
          Save as group
        </button>
      </div>
      {groups.isSuccess && groups.data.length === 0 && !note && (
        <p className={styles.hint}>
          Tick channels, then save them as a group to tick them again in one
          step.
        </p>
      )}
      <div role="status" className={styles.statusRegion}>
        {note && (note.kind === "done" || note.after === selected) && (
          <p className={styles.note}>
            <Check aria-hidden="true" />
            <span>{note.text}</span>
            {note.kind === "added" && (
              <button
                type="button"
                className={styles.undo}
                disabled={locked}
                onClick={() => {
                  setSelected(note.before);
                  setNote({
                    kind: "done",
                    text: "The selection is back to what it was.",
                  });
                }}
              >
                <Undo2 aria-hidden="true" />
                Undo
              </button>
            )}
          </p>
        )}
      </div>
      <NameDialog
        open={saving}
        subject="group"
        title="Save the ticked channels as a group"
        initialName={tickedServers === 1 ? ticked[0]!.guildName : ""}
        submitLabel="Save group"
        pending={save.isPending}
        error={save.isError ? asAppError("save-group", save.error) : null}
        onCancel={() => setSaving(false)}
        onSubmit={(name) =>
          save.mutate(
            { name, channelIds: ticked.map((t) => t.id) },
            {
              onSuccess: (group) => {
                setSaving(false);
                setNote({
                  kind: "done",
                  text: `Saved ${group.name} with ${channels(group.channels.length)}.`,
                });
              },
            },
          )
        }
      >
        <p>
          <b>{channels(ticked.length)}</b> in {servers(tickedServers)}.
          Selecting the group later ticks them again.
        </p>
      </NameDialog>
      {openGroup && (
        <GroupDialog
          group={openGroup}
          state={states.get(openGroup.id)!}
          ticked={ticked}
          locked={locked}
          onApply={() => apply(openGroup, states.get(openGroup.id)!)}
          onDeleted={(name) => {
            setOpen(null);
            setNote({ kind: "done", text: `Deleted the group ${name}.` });
            saveButton.current?.focus();
          }}
          onUpdated={(text) => setNote({ kind: "done", text })}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function GroupDialog({
  group,
  state,
  ticked,
  locked,
  onApply,
  onDeleted,
  onUpdated,
  onClose,
}: {
  group: ChannelGroup;
  state: GroupState;
  ticked: Props["ticked"];
  locked: boolean;
  onApply: () => void;
  onDeleted: (name: string) => void;
  onUpdated: (text: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const [step, setStep] = useState<"rename" | "replace" | "delete" | null>(
    null,
  );
  const [failure, setFailure] = useState<AppError | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  // Closing the native way hands focus back to the button that opened it.
  const close = () => dialog.current?.close();

  const skipped = state.entries.length - state.available.length;
  const groupServers = new Set(state.entries.map((e) => e.guildName)).size;
  const tickedServers = new Set(ticked.map((t) => t.guildId)).size;

  // The dialogs it opens sit beside it, not inside it, so their close and Tab
  // handling never reach this one.
  return (
    <>
      <dialog
        ref={dialog}
        className={`${dialogStyles.dialog} ${styles.dialog}`}
        aria-labelledby={titleId}
        onClose={onClose}
        onKeyDown={keepTabInside}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className={dialogStyles.sheet}>
          <h2 id={titleId}>{group.name}</h2>
          <p className={dialogStyles.body}>
            {channels(state.entries.length)} in {servers(groupServers)}
            {skipped > 0 &&
              `; ${skipped === 1 ? "1 is" : `${skipped} are`} unavailable and will be skipped`}
            .
          </p>
          <ul className={styles.list} aria-label={`Channels in ${group.name}`}>
            {state.entries.map((entry) => (
              <li
                key={entry.id}
                data-unavailable={entry.unavailable ? "" : undefined}
              >
                <span className={styles.channel}>
                  <span aria-hidden="true">#</span>
                  {entry.name}
                </span>
                <span className={styles.server}>{entry.guildName}</span>
                {entry.unavailable && (
                  <span className={styles.why}>
                    <Lock aria-hidden="true" />
                    <span>
                      <span className="visually-hidden">Unavailable: </span>
                      {entry.unavailable}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {failure && (
            <div className={styles.failure}>
              <p role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{failure.message}</span>
              </p>
              <FailureDetail error={failure} />
            </div>
          )}
          <div className={styles.manage}>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                update.reset();
                setStep("rename");
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className={styles.quiet}
              disabled={!ticked.length}
              onClick={() => setStep("replace")}
            >
              Update from selection
              <span className={pickStyles.n}>{ticked.length}</span>
            </button>
            <button
              type="button"
              className={`${styles.quiet} ${styles.delete}`}
              onClick={() => setStep("delete")}
            >
              Delete
            </button>
          </div>
          {!ticked.length && (
            <p className={styles.meta}>
              Tick channels in the catalogue to update the group from them.
            </p>
          )}
          <div className={dialogStyles.actions}>
            <button
              type="button"
              className={dialogStyles.cancel}
              onClick={close}
            >
              Close
            </button>
            <button
              type="button"
              className={dialogStyles.primary}
              disabled={!state.available.length || locked}
              onClick={() => {
                onApply();
                close();
              }}
            >
              Add {channels(state.available.length)} to the selection
            </button>
          </div>
        </div>
      </dialog>
      <NameDialog
        open={step === "rename"}
        subject="group"
        title={`Rename ${group.name}`}
        initialName={group.name}
        submitLabel="Rename"
        pending={update.isPending}
        error={update.isError ? asAppError("change-group", update.error) : null}
        onCancel={() => setStep(null)}
        onSubmit={(name) =>
          update.mutate(
            { id: group.id, name },
            {
              onSuccess: (renamed) => {
                setStep(null);
                setFailure(null);
                onUpdated(`Renamed the group to ${renamed.name}.`);
              },
            },
          )
        }
      />
      <ConfirmDialog
        open={step === "replace"}
        title={`Update ${group.name} from the selection?`}
        confirmLabel="Update group"
        tone="primary"
        onCancel={() => setStep(null)}
        onConfirm={() => {
          setStep(null);
          update.mutate(
            { id: group.id, channelIds: ticked.map((t) => t.id) },
            {
              onSuccess: (updated) => {
                setFailure(null);
                onUpdated(
                  `Updated ${updated.name}: it now holds ${channels(updated.channels.length)}.`,
                );
              },
              onError: (error) => setFailure(asAppError("change-group", error)),
            },
          );
        }}
      >
        It will hold the {channels(ticked.length)} ticked now, in{" "}
        {servers(tickedServers)}, instead of its{" "}
        {channels(state.entries.length)}.
      </ConfirmDialog>
      <ConfirmDialog
        open={step === "delete"}
        title={`Delete ${group.name}?`}
        confirmLabel="Delete group"
        onCancel={() => setStep(null)}
        onConfirm={() => {
          setStep(null);
          remove.mutate(group.id, {
            onSuccess: () => onDeleted(group.name),
            onError: (error) => setFailure(asAppError("delete-group", error)),
          });
        }}
      >
        Only the group is removed, for everyone who signs in here. Ticked
        channels stay ticked.
      </ConfirmDialog>
    </>
  );
}
