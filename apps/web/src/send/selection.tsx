import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type Selection = [
  ReadonlySet<string>,
  Dispatch<SetStateAction<ReadonlySet<string>>>,
];

const SelectionContext = createContext<Selection | null>(null);

/** The ticked channel IDs. It lives above the views so switching to Compose keeps it. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const state = useState<ReadonlySet<string>>(() => new Set());
  return (
    <SelectionContext.Provider value={state}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): Selection {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("useSelection needs a SelectionProvider");
  return selection;
}

/** Adds or removes channel IDs, returning a new set. */
export function withIds(
  set: ReadonlySet<string>,
  ids: Iterable<string>,
  on: boolean,
): ReadonlySet<string> {
  const next = new Set(set);
  for (const id of ids) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return next;
}
