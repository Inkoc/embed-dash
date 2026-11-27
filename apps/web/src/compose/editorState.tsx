import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { locate, useDraft } from "./draft";

export type Pane = "edit" | "preview";

interface EditorState {
  /** Which half shows on stacked screens. */
  pane: Pane;
  setPane: (pane: Pane) => void;
  isOpen: (key: string) => boolean;
  setOpen: (key: string, open: boolean) => void;
  /** Controls show their problem only after they have been left once. */
  isTouched: (id: string) => boolean;
  touch: (id: string) => void;
  /** Opens whatever hides an issue's control, shows its message and moves focus there. */
  reveal: (path: string) => void;
  /** Moves focus to an element by id once React has rendered the change that created or moved it. */
  focusAfter: (id: string, change: () => void) => void;
  reset: () => void;
}

const EditorStateContext = createContext<EditorState | null>(null);

function focusById(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView?.({ block: "center" });
  element.focus({ preventScroll: true });
}

/**
 * Sits above the views with the draft, because the phone action bar and the
 * forward shortcut live outside the composer but still need to reach a field.
 */
export function EditorStateProvider({ children }: { children: ReactNode }) {
  const { draft } = useDraft();
  const [pane, setPane] = useState<Pane>("edit");
  const [open, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());

  const setOpen = useCallback((key: string, value: boolean) => {
    setOpenKeys((keys) => {
      const next = new Set(keys);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const touch = useCallback((id: string) => {
    setTouched((ids) => (ids.has(id) ? ids : new Set(ids).add(id)));
  }, []);
  const focusAfter = useCallback((id: string, change: () => void) => {
    flushSync(change);
    focusById(id);
  }, []);
  const reveal = useCallback(
    (path: string) => {
      const target = locate(draft, path);
      focusAfter(target.id, () => {
        setPane("edit");
        setOpenKeys((keys) => new Set([...keys, ...target.open]));
        touch(target.id);
      });
    },
    [draft, focusAfter, touch],
  );
  const reset = useCallback(() => {
    setOpenKeys(new Set());
    setTouched(new Set());
  }, []);

  const value = useMemo(
    () => ({
      pane,
      setPane,
      isOpen: (key: string) => open.has(key),
      setOpen,
      isTouched: (id: string) => touched.has(id),
      touch,
      reveal,
      focusAfter,
      reset,
    }),
    [pane, open, touched, setOpen, touch, reveal, focusAfter, reset],
  );
  return <EditorStateContext value={value}>{children}</EditorStateContext>;
}

export function useEditorState() {
  const value = useContext(EditorStateContext);
  if (!value) throw new Error("useEditorState needs an EditorStateProvider");
  return value;
}
