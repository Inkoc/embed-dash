import { createContext, useContext, useState, type ReactNode } from "react";

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface Draft {
  content: string;
  color: string;
  title: string;
  url: string;
  description: string;
  author: { name: string; iconUrl: string };
  fields: EmbedField[];
  image: string;
  thumbnail: string;
  footer: { text: string; iconUrl: string };
  timestamp: boolean;
}

/**
 * The composer opens on an illustrative announcement for an invented game
 * community, so every part of the preview is visible before the operator types.
 * Its images are generated art bundled with the app, and its side colour is
 * the example's own brand colour: user content, not part of the app palette.
 */
export const exampleDraft: Draft = {
  content: "Patch 0.9.4 lands on Thursday. Everything you need is below.",
  color: "#e8a33d",
  title: "Patch 0.9.4 — The Saltmarsh Update",
  url: "https://lanternfall.example/patch/0-9-4",
  description:
    "The marsh is open. Wade into six new tidal caves, meet the Heron Keeper, and try the reworked lantern-oil system.\n\nFull notes are on the patch page. Report anything odd in the bug-reports forum.",
  author: { name: "Lanternfall Dev Team", iconUrl: "/examples/dev-team.svg" },
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
  image: "/examples/saltmarsh-banner.svg",
  thumbnail: "/examples/lantern-mark.svg",
  footer: {
    text: "Lanternfall · Patch notes",
    iconUrl: "/examples/footer-mark.svg",
  },
  timestamp: true,
};

type DraftContextValue = readonly [Draft, (change: Partial<Draft>) => void];
const DraftContext = createContext<DraftContextValue | null>(null);

/** Keeps the draft above the views, so switching to Send and back loses nothing. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(exampleDraft);
  const value = [
    draft,
    (change: Partial<Draft>) =>
      setDraft((current) => ({ ...current, ...change })),
  ] as const;
  return <DraftContext value={value}>{children}</DraftContext>;
}

export function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useDraft needs a DraftProvider");
  return value;
}
