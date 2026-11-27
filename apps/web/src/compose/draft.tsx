import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  emptyEmbed,
  messageDraftSchema,
  validateMessage,
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
}

let lastId = 0;
// A counter rather than crypto.randomUUID, which plain-HTTP self-hosted origins don't have.
export const newId = () => `k${++lastId}`;

export const withIds = (message: MessageDraft): Draft => ({
  content: message.content,
  embeds: message.embeds.map((embed) => ({
    ...embed,
    id: newId(),
    fields: embed.fields.map((field) => ({ ...field, id: newId() })),
  })),
});

export const blankEmbed = (): Embed =>
  withIds({ content: "", embeds: [emptyEmbed()] }).embeds[0]!;
export const blankDraft = (): Draft => ({
  content: "",
  embeds: [blankEmbed()],
});

/**
 * The composer opens on an illustrative announcement for an invented game
 * community, so every part of the preview is visible before the operator types.
 * Its images are generated art bundled with the app, linked absolutely so the
 * links are ones Discord would accept; its side colour is the example's own
 * brand colour: user content, not part of the app palette.
 */
export function exampleDraft(): Draft {
  const art = (file: string) =>
    new URL(`/examples/${file}`, location.origin).href;
  return withIds({
    content: "Patch 0.9.4 lands on Thursday. Everything you need is below.",
    embeds: [
      {
        color: "#e8a33d",
        title: "Patch 0.9.4 — The Saltmarsh Update",
        url: "https://lanternfall.example/patch/0-9-4",
        description:
          "The marsh is open. Wade into **six new tidal caves**, meet the Heron Keeper, and try the reworked lantern-oil system.\n\nFull notes are on the [patch page](https://lanternfall.example/patch/0-9-4). Report anything odd in the bug-reports forum.",
        author: {
          name: "Lanternfall Dev Team",
          url: "",
          iconUrl: art("dev-team.svg"),
        },
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
        image: art("saltmarsh-banner.svg"),
        thumbnail: art("lantern-mark.svg"),
        footer: {
          text: "Lanternfall · Patch notes",
          iconUrl: art("footer-mark.svg"),
        },
        timestamp: "now",
      },
    ],
  });
}

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
    // Unreadable storage or JSON: start from the example.
  }
  return exampleDraft();
}

function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Storage is blocked or full; the composer says so from the check below.
  }
}

/** Private modes and strict settings can refuse storage outright. */
function storageWorks() {
  try {
    localStorage.setItem(`${storageKey}:check`, "");
    localStorage.removeItem(`${storageKey}:check`);
    return true;
  } catch {
    return false;
  }
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
): { id: string; open: string[] } {
  const parts = path.split(".");
  if (parts[0] === "content") return { id: "in-content", open: [] };
  const embed = draft.embeds[Number(parts[1])];
  if (!embed) return { id: "compose-budget", open: [] };
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
  /** False when the browser refuses storage, so the composer can say the draft isn't kept. */
  saved: boolean;
}
const DraftContext = createContext<DraftContextValue | null>(null);

/** Keeps the draft above the views, so switching to Send and back loses nothing, and saves it in the browser. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(loadDraft);
  const [saved] = useState(storageWorks);
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
