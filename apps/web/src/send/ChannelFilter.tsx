import { useId, type RefObject } from "react";
import { Search, X } from "lucide-react";
import styles from "./SendView.module.css";

export function ChannelFilter({
  query,
  onChange,
  inputRef,
  enterList,
  hits,
  servers,
}: {
  query: string;
  onChange: (query: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  enterList: () => void;
  hits: number;
  servers: number;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={styles.label}>
        Find channels
      </label>
      <div className={styles.search}>
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={query}
          placeholder="e.g. news, Cup EU or 1103…"
          autoComplete="off"
          spellCheck={false}
          data-shortcut="search"
          aria-keyshortcuts="/"
          aria-describedby={id + "-result"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter") {
              event.preventDefault();
              enterList();
            } else if (event.key === "Escape" && query) {
              // Esc clears the search first; the next Esc goes back to Compose.
              event.preventDefault();
              onChange("");
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        ) : (
          <kbd data-k="search" aria-hidden="true">
            /
          </kbd>
        )}
      </div>
      <p id={id + "-result"} className="visually-hidden" aria-live="polite">
        {query.trim() ? `${hits} channels in ${servers} servers match.` : ""}
      </p>
    </>
  );
}
