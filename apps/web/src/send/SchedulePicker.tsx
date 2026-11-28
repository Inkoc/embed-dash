import { useEffect, useId, useState } from "react";
import { scheduleHorizonMs } from "@embed-dash/shared";
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
  return Number.isFinite(instant) &&
    instant > now &&
    instant <= now + scheduleHorizonMs
    ? instant
    : null;
}
export function SchedulePicker({
  value,
  onChange,
  attempted = false,
  tray = false,
}: {
  value: string;
  onChange: (value: string) => void;
  attempted?: boolean;
  tray?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const instant = scheduleInstant(value, now);
  const invalid = (touched || attempted) && !instant;
  const problem = !value
    ? "Choose a date and time."
    : new Date(value).getTime() <= now
      ? "That time has passed. Choose a future date and time."
      : "Choose a time within the next year.";
  return (
    <div className={styles.picker} data-tray={tray || undefined}>
      <label htmlFor={id}>
        Send date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone} ·{" "}
        {localZone()})
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        min={localInput(now + 60000)}
        max={localInput(now + scheduleHorizonMs)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={invalid}
        aria-describedby={id + "-hint"}
      />
      <p
        id={id + "-hint"}
        className={invalid ? styles.error : undefined}
        role={invalid ? "alert" : undefined}
      >
        {invalid
          ? problem
          : instant
            ? date(instant)
            : "Choose when this message should go out."}
      </p>
    </div>
  );
}
