import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function securityHeaders(spaRoot?: string) {
  const html = spaRoot ? readFileSync(join(spaRoot, "index.html"), "utf8") : "";
  // Hash the built inline theme initializer so CSP permits pre-paint theme selection.
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/i.test(match[1]))
    .map(
      (match) =>
        `'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`,
    );
  return {
    "Content-Security-Policy": `default-src 'self'; script-src 'self' ${hashes.join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  };
}
