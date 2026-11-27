import { segments, type Ranges } from "./catalogue";

/** Text with search hits marked and, for call numbers, the distinguishing tail in bold. */
export function Marked({
  text,
  ranges,
  strongFrom,
}: {
  text: string;
  ranges: Ranges;
  strongFrom?: number;
}) {
  return segments(text, ranges, strongFrom).map((part, i) => {
    const inner = part.mark ? <mark>{part.text}</mark> : part.text;
    return part.strong ? <b key={i}>{inner}</b> : <span key={i}>{inner}</span>;
  });
}
