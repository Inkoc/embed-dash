import { useId, useState } from "react";
import { date, localZone } from "../history/presentation";
import styles from "./SchedulePicker.module.css";

export function localInput(value: number) {
  const time = new Date(value);
  return new Date(value - time.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function scheduleInstant(value: string, now = Date.now()) {
  const instant = new Date(value).getTime();
  return Number.isFinite(instant) && instant > now ? instant : null;
}
export function SchedulePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const instant = scheduleInstant(value);
  return (
    <div className={styles.picker}>
      <label htmlFor={id}>
        Send date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone} ·{" "}
        {localZone()})
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={touched && !instant}
        aria-describedby={id + "-hint"}
      />
      <p id={id + "-hint"}>
        {touched && !instant
          ? "Choose a future date and time."
          : instant
            ? date(instant)
            : "Choose when this message should go out."}
      </p>
    </div>
  );
}
