import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  emptyEmbed,
  messageDraftSchema,
  validateMessage,
  type AttachmentDraft,
  type EmbedDraft,
  type EmbedFieldDraft,
  type Issue,
  type MessageDraft,
} from "@embed-dash/shared";

/** Ids keep React keys, open rows and focus attached to an embed or field while it moves. */
export interface EmbedField extends EmbedFieldDraft {
  id: string;
}
export interface Embed extends Omit<EmbedDraft, "fields"> {
  id: string;
  fields: EmbedField[];
}
export interface Draft {
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
  attachments: message.attachments,
  embeds: message.embeds.map((embed) => ({
    ...embed,
    id: newId(),
    fields: embed.fields.map((field) => ({ ...field, id: newId() })),
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
  !draft.content.trim() &&
  draft.attachments.length === 0 &&
  draft.embeds.length <= 1 &&
  draft.embeds.every(
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
      const parsed = messageDraftSchema.safeParse(JSON.parse(stored));
      if (parsed.success) return withIds(parsed.data);
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
    localStorage.setItem(storageKey, JSON.stringify(draft));
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

interface DraftContextValue {
  draft: Draft;
  setDraft: (change: (draft: Draft) => Draft) => void;
  issues: Issue[];
  /** False when the latest change couldn't be written to browser storage. */
  saved: boolean;
}
const DraftContext = createContext<DraftContextValue | null>(null);

/** Keeps the draft above the views, so switching to Send and back loses nothing, and saves it in the browser. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(loadDraft);
  const saved = useSyncExternalStore(subscribeToSaves, lastSave);
  const issues = useMemo(() => validateMessage(draft), [draft]);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const value = useMemo(
    () => ({ draft, setDraft, issues, saved }),
    [draft, issues, saved],
  );
  return <DraftContext value={value}>{children}</DraftContext>;
}

export function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useDraft needs a DraftProvider");
  return value;
}
