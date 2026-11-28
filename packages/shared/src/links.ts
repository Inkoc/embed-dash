export const attachmentReference = /^attachment:\/\/(?!\.+$)[\w.-]+$/;

export function linkProblem(url: string, media: boolean): string | null {
  const value = url.trim();
  if (!value) return null;
  if (/\s/u.test(value))
    return "Remove spaces and line breaks from the link, or percent-encode them.";
  const schemes = media
    ? ["http:", "https:", "attachment:"]
    : ["http:", "https:"];
  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    return media
      ? "Use a full link that starts with https://, or attachment:// for an uploaded file."
      : "Use a full link that starts with https://.";
  }
  if (protocol === "attachment:" && media)
    return attachmentReference.test(value)
      ? null
      : "Name an uploaded file as attachment://filename, using only letters, digits, dots, dashes and underscores.";
  if (schemes.includes(protocol)) return null;
  return media
    ? `Discord only shows images from https://, http:// or attachment:// links, not ${protocol}//.`
    : `Discord only accepts https:// or http:// links here, not ${protocol}//.`;
}
