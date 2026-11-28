import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  embedHasContent,
  completeButtonRows,
  type ButtonRowDraft,
  emptyEmbed,
  messageDraftSchema,
  validateMessage,
  type AttachmentDraft,
  type EmbedDraft,
  type EmbedFieldDraft,
  type Issue,
  type HistoryDetail,
  type MessageDraft,
} from "@embed-dash/shared";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "../shell/SessionGate";
import { discardUpload, useMissingUploads } from "./uploads";

/** Ids keep React keys, open rows and focus attached to an embed or field while it moves. */
export interface EmbedField extends EmbedFieldDraft {
  id: string;
}
export interface Embed extends Omit<EmbedDraft, "fields"> {
  id: string;
  fields: EmbedField[];
}
export interface ButtonRow extends ButtonRowDraft {
  key: string;
  components: (ButtonRowDraft["components"][number] & { key: string })[];
}
export interface Draft {
  components?: ButtonRow[];
  content: string;
  embeds: Embed[];
  /** Files already on the server; the draft holds only their ids and names. */
  attachments: AttachmentDraft[];
}

let lastId = 0;
// A counter rather than crypto.randomUUID, which plain-HTTP self-hosted origins don't have.
export const newId = () => `k${++lastId}`;

export const withIds = (message: MessageDraft): Draft => ({
  content: message.content,
  ...(message.components?.length
    ? {
        components: message.components.map((row) => ({
          ...row,
          key: newId(),
          components: row.components.map((button) => ({
            ...button,
            key: newId(),
          })),
        })),
      }
    : {}),
  attachments: message.attachments,
  embeds: message.embeds.map((embed) => ({
    ...embed,
    id: newId(),
    fields: embed.fields.map((field) => ({ ...field, id: newId() })),
  })),
});

const withoutId = <T extends { id: string }>(value: T): Omit<T, "id"> => {
  const copy: Partial<T> = { ...value };
  delete copy.id;
  return copy as Omit<T, "id">;
};

/*
 * Embeds just added and not written in yet. Every edit replaces an embed's
 * object, so holding the very objects Add embed made is enough to tell; the
 * stored draft records them too, so a reload keeps them apart.
 */
const unwritten = new WeakSet<Embed>();

/** A blank embed for Add embed: not a problem, and not shown in the preview, until something is written in it. */
export const addedEmbed = (): Embed => {
  const embed = blankEmbed();
  unwritten.add(embed);
  return embed;
};
export const isUnwritten = (embed: Embed) => unwritten.has(embed);
/** The draft as it would be sent: what the preview and summaries show. */
export const written = (draft: Draft): Draft =>
  draft.embeds.some(isUnwritten)
    ? { ...draft, embeds: draft.embeds.filter((embed) => !isUnwritten(embed)) }
    : draft;

/**
 * The message without the editor's row ids, as the server takes it. An empty
 * embed is never part of it, however it came about: it would only be refused
 * when sent, and is nothing to keep in a template or an export.
 */
export const toMessage = (draft: Draft): MessageDraft => ({
  content: draft.content,
  ...(draft.components?.length
    ? { components: completeButtonRows(draft.components) }
    : {}),
  attachments: draft.attachments,
  embeds: draft.embeds.filter(embedHasContent).map((embed) => ({
    ...withoutId(embed),
    fields: embed.fields.map(withoutId),
  })),
});

export const blankEmbed = (): Embed =>
  withIds({ content: "", embeds: [emptyEmbed()], attachments: [] }).embeds[0]!;
export const blankDraft = (): Draft => ({
  content: "",
  embeds: [blankEmbed()],
  attachments: [],
});

/**
 * An illustrative announcement for an invented game community, loaded only
 * when the operator asks for it, so every text part of the preview can be
 * seen filled in. It carries no media links: anything bundled with a
 * self-hosted app is usually out of Discord's reach. Its side colour is the
 * example's own brand colour: user content, not part of the app palette.
 */
export function exampleDraft(): Draft {
  return withIds({
    content: "Patch 0.9.4 lands on Thursday. Everything you need is below.",
    attachments: [],
    embeds: [
      {
        ...emptyEmbed(),
        color: "#e8a33d",
        title: "Patch 0.9.4 — The Saltmarsh Update",
        url: "https://lanternfall.example/patch/0-9-4",
        description:
          "The marsh is open. Wade into **six new tidal caves**, meet the Heron Keeper, and try the reworked lantern-oil system.\n\nFull notes are on the [patch page](https://lanternfall.example/patch/0-9-4). Report anything odd in the bug-reports forum.",
        author: { name: "Lanternfall Dev Team", url: "", iconUrl: "" },
        fields: [
          { name: "Goes live", value: "Thu 3 Dec · 18:00 UTC", inline: true },
          { name: "Downtime", value: "About 30 minutes", inline: true },
          { name: "Version", value: "0.9.4 (build 2217)", inline: true },
          {
            name: "Save files",
            value:
              "Carry over automatically. Back up the saves folder first if you run mods.",
            inline: false,
          },
        ],
        footer: { text: "Lanternfall · Patch notes", iconUrl: "" },
        timestamp: "now",
      },
    ],
  });
}

/** Nothing typed yet: the composer offers the example instead of listing problems. */
export const isBlank = (draft: Draft) =>
  !draft.components?.length &&
  !draft.content.trim() &&
  draft.attachments.length === 0 &&
  written(draft).embeds.length <= 1 &&
  written(draft).embeds.every(
    (embed) =>
      embed.fields.length === 0 &&
      [
        embed.title,
        embed.url,
        embed.description,
        embed.author.name,
        embed.author.url,
        embed.author.iconUrl,
        embed.image,
        embed.thumbnail,
        embed.footer.text,
        embed.footer.iconUrl,
      ].every((part) => !part.trim()),
  );

const storageKey = "embed-dash:draft";

/** A stored draft that no longer matches the schema is dropped rather than half-loaded. */
export function loadDraft(): Draft {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const raw: unknown = JSON.parse(stored);
      const parsed = messageDraftSchema.safeParse(raw);
      if (parsed.success) {
        const draft = withIds(parsed.data);
        const marked = (raw as { unwritten?: unknown }).unwritten;
        if (Array.isArray(marked))
          for (const index of marked)
            if (typeof index === "number" && draft.embeds[index])
              unwritten.add(draft.embeds[index]);
        return draft;
      }
    }
  } catch {
    // Unreadable storage or JSON: start blank.
  }
  return blankDraft();
}

/*
 * Whether the last save reached storage. It lives outside React so a failed
 * write can be reported from the save itself, and the next change retries.
 */
let lastSaveWorked = true;
const saveListeners = new Set<() => void>();
const subscribeToSaves = (listener: () => void) => {
  saveListeners.add(listener);
  return () => void saveListeners.delete(listener);
};
const lastSave = () => lastSaveWorked;

function saveDraft(draft: Draft) {
  let worked = true;
  try {
    const marked = draft.embeds.flatMap((embed, index) =>
      isUnwritten(embed) ? [index] : [],
    );
    localStorage.setItem(
      storageKey,
      JSON.stringify(marked.length ? { ...draft, unwritten: marked } : draft),
    );
  } catch {
    // Full, blocked or unserialisable: the draft stays in memory and the composer says so.
    worked = false;
  }
  if (worked === lastSaveWorked) return;
  lastSaveWorked = worked;
  for (const listener of saveListeners) listener();
}

/* Pure edits, so the composer's buttons and their tests share one implementation. */

const move = <T,>(list: readonly T[], from: number, to: number) => {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
};
const indexOf = (draft: Draft, embedId: string) =>
  draft.embeds.findIndex((embed) => embed.id === embedId);

export function updateEmbed(
  draft: Draft,
  embedId: string,
  change: (embed: Embed) => Partial<Embed>,
): Draft {
  return {
    ...draft,
    embeds: draft.embeds.map((embed) =>
      embed.id === embedId ? { ...embed, ...change(embed) } : embed,
    ),
  };
}
export const addEmbed = (draft: Draft, embed = blankEmbed()): Draft => ({
  ...draft,
  embeds: [...draft.embeds, embed],
});
export function duplicateEmbed(
  draft: Draft,
  embedId: string,
  copy: Embed,
): Draft {
  const at = indexOf(draft, embedId);
  const embeds = [...draft.embeds];
  embeds.splice(at + 1, 0, copy);
  return { ...draft, embeds };
}
/** A copy with fresh ids, so the original and the copy open and move independently. */
export const copyOf = (embed: Embed): Embed => ({
  ...embed,
  id: newId(),
  author: { ...embed.author },
  footer: { ...embed.footer },
  fields: embed.fields.map((field) => ({ ...field, id: newId() })),
});
export const moveEmbed = (draft: Draft, embedId: string, by: number): Draft => {
  const at = indexOf(draft, embedId);
  return { ...draft, embeds: move(draft.embeds, at, at + by) };
};
export const removeEmbed = (draft: Draft, embedId: string): Draft => ({
  ...draft,
  embeds: draft.embeds.filter((embed) => embed.id !== embedId),
});

export const updateField = (
  draft: Draft,
  embedId: string,
  fieldId: string,
  change: Partial<EmbedField>,
) =>
  updateEmbed(draft, embedId, (embed) => ({
    fields: embed.fields.map((field) =>
      field.id === fieldId ? { ...field, ...change } : field,
    ),
  }));
export const addField = (draft: Draft, embedId: string, field: EmbedField) =>
  updateEmbed(draft, embedId, (embed) => ({
    fields: [...embed.fields, field],
  }));
export const moveField = (
  draft: Draft,
  embedId: string,
  fieldId: string,
  by: number,
) =>
  updateEmbed(draft, embedId, (embed) => {
    const at = embed.fields.findIndex((field) => field.id === fieldId);
    return { fields: move(embed.fields, at, at + by) };
  });
export const removeField = (draft: Draft, embedId: string, fieldId: string) =>
  updateEmbed(draft, embedId, (embed) => ({
    fields: embed.fields.filter((field) => field.id !== fieldId),
  }));

/** Where an issue's path lives in the form: the control to focus and the rows that hide it. */
export function locate(
  draft: Draft,
  path: string,
): { id: string; open: string[]; unfold: string[] } {
  const parts = path.split(".");
  if (parts[0] === "content") return { id: "in-content", open: [], unfold: [] };
  if (parts[0] === "attachments")
    return { id: "files-add", open: [], unfold: [] };
  if (parts[0] === "components") {
    const row = draft.components?.[Number(parts[1])];
    const button = row?.components[Number(parts[3])];
    return {
      id: button
        ? `${button.key}-${parts[4] ?? "label"}`
        : row
          ? `${row.key}-add`
          : "buttons-add-row",
      open: [],
      unfold: [],
    };
  }
  const embed = draft.embeds[Number(parts[1])];
  if (!embed) return { id: "compose-budget", open: [], unfold: [] };
  return { ...inEmbed(embed, parts), unfold: [`${embed.id}:folded`] };
}

function inEmbed(
  embed: Embed,
  parts: string[],
): { id: string; open: string[] } {
  const e = embed.id;
  const [, , part, sub, key] = parts;
  switch (part) {
    case undefined:
      return { id: `${e}-head`, open: [] };
    case "fields": {
      const field = sub === undefined ? undefined : embed.fields[Number(sub)];
      if (!field) return { id: `${e}-fields`, open: [] };
      return { id: `${field.id}-${key}`, open: [field.id] };
    }
    case "url":
      return { id: `${e}-url`, open: [`${e}:url`] };
    case "author":
      return { id: `${e}-author-${sub}`, open: [`${e}:author`] };
    case "image":
    case "thumbnail":
      return { id: `${e}-${part}`, open: [`${e}:images`] };
    case "footer":
      return { id: `${e}-footer-${sub}`, open: [`${e}:footer`] };
    case "timestamp":
      return { id: `${e}-time`, open: [`${e}:footer`] };
    case "color":
      return { id: `${e}-hex`, open: [] };
    default:
      return { id: `${e}-${part}`, open: [] };
  }
}

/** An untouched added embed answers for nothing; its parts have only defaults to check. */
const unwrittenEmbedIssue = (draft: Draft, issue: Issue) => {
  const match = /^embeds\.(\d+)(\.|$)/.exec(issue.path);
  const embed = match && draft.embeds[Number(match[1])];
  return !!embed && isUnwritten(embed);
};

interface DraftContextValue {
  editing: HistoryDetail | null;
  beginEdit: (send: HistoryDetail) => void;
  endEdit: () => void;
  markEdited: (message: MessageDraft) => void;
  dirty: boolean;
  draft: Draft;
  setDraft: (change: (draft: Draft) => Draft) => void;
  issues: Issue[];
  /** False when the latest change couldn't be written to browser storage. */
  saved: boolean;
  /** Starts a blank draft and deletes the cleared draft's files from the server. */
  clear: () => void;
  /** Swaps in another message, letting go of the old draft's files the new one doesn't use. */
  replace: (next: Draft) => void;
  /** Counts clears, so work started for an earlier draft can tell it is stale. */
  generation: number;
  isCurrent: (generation: number) => boolean;
}
const DraftContext = createContext<DraftContextValue | null>(null);

/** Keeps the draft above the views, so switching to Send and back loses nothing, and saves it in the browser. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(loadDraft);
  const [generation, setGeneration] = useState(0);
  // Read by upload callbacks that finish after a render, so they see the latest clear.
  const latest = useRef(0);

  const [editing, setEditing] = useState<HistoryDetail | null>(null);
  const [baseline, setBaseline] = useState("");
  const previousDraft = useRef<Draft | null>(null);
  const beginEdit = useCallback(
    (send: HistoryDetail) => {
      previousDraft.current = draft;
      latest.current += 1;
      setGeneration(latest.current);
      setEditing(send);
      setBaseline(JSON.stringify(toMessage(withIds(send.payload))));
      setDraft(withIds(send.payload));
    },
    [draft],
  );
  const endEdit = useCallback(() => {
    latest.current += 1;
    setGeneration(latest.current);
    setEditing(null);
    setDraft(previousDraft.current ?? blankDraft());
  }, []);
  const markEdited = useCallback(
    (message: MessageDraft) =>
      setBaseline(JSON.stringify(toMessage(withIds(message)))),
    [],
  );
  const dirty = !!editing && JSON.stringify(toMessage(draft)) !== baseline;
  const saved = useSyncExternalStore(subscribeToSaves, lastSave);
  const missing = useMissingUploads(
    draft.attachments
      .filter((file) => !editing?.retainedUploads?.includes(file.id))
      .map((file) => file.id),
  );
  const issues = useMemo(
    () =>
      validateMessage(draft, { missingFiles: missing }).filter(
        (issue) => !unwrittenEmbedIssue(draft, issue),
      ),
    [draft, missing],
  );

  useEffect(() => {
    if (!editing) saveDraft(draft);
  }, [draft, editing]);

  const client = useQueryClient();
  const replace = useCallback(
    (next: Draft) => {
      const csrfToken =
        client.getQueryData<Session>(["session"])?.csrfToken ?? "";
      const kept = new Set(next.attachments.map((file) => file.id));
      for (const file of draft.attachments)
        if (!kept.has(file.id)) void discardUpload(file.id, csrfToken);
      latest.current += 1;
      setGeneration(latest.current);
      setDraft(next);
    },
    [client, draft.attachments],
  );
  const clear = useCallback(() => replace(blankDraft()), [replace]);
  const isCurrent = useCallback(
    (value: number) => value === latest.current,
    [],
  );

  const value = useMemo(
    () => ({
      draft,
      setDraft,
      issues,
      saved,
      clear,
      replace,
      generation,
      isCurrent,
      editing,
      beginEdit,
      endEdit,
      markEdited,
      dirty,
    }),
    [
      draft,
      issues,
      saved,
      clear,
      replace,
      generation,
      isCurrent,
      editing,
      beginEdit,
      endEdit,
      markEdited,
      dirty,
    ],
  );
  return <DraftContext value={value}>{children}</DraftContext>;
}

export function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useDraft needs a DraftProvider");
  return value;
}
