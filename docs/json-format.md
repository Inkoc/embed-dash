# Message JSON

Use **Import JSON** or **Export JSON** above the composer. Export offers clipboard copy and a `message.json` download. Import accepts pasted JSON or a local file; **Replace draft** validates it before replacing the current message and releasing its uploaded files. Errors identify the property or Discord limit involved and leave the draft unchanged. After success, the dialog stays open to show compatibility notices; close it to inspect the preview.

## Portable format

Exports are a bare Discord-style message object:

```json
{
  "content": "Community update",
  "embeds": [
    {
      "title": "Open evening",
      "description": "Doors open at six.",
      "color": 1193046,
      "fields": [{ "name": "Entry", "value": "Free", "inline": true }]
    }
  ]
}
```

Supported properties are `content` and `embeds`. Each embed supports `title`, `description`, `url`, numeric `color`, ISO 8601 `timestamp`, `author` (`name`, `url`, `icon_url`), `footer` (`text`, `icon_url`), `fields` (`name`, `value`, optional `inline`), `image.url` and `thumbnail.url`. Missing optional text becomes empty; missing field `inline` becomes false; missing colour uses the composer's default teal. A dynamic “time of sending” becomes the export time, with a notice. JSON exports preserve text and explicit timestamps; editor row identifiers are never exported.

Imports also accept the community builder wrapper used by Discohook:

```json
{
  "messages": [
    { "data": { "content": "Community update", "embeds": [] } }
  ]
}
```

Only the first message is loaded. Multiple messages produce a notice. An empty message list is rejected. Unsupported properties are listed by path, including nested embed metadata and wrapper metadata. The composer currently has no button support: `components`, including link buttons, are omitted on import and named in the notice. No button controls or placeholders are created. Other unsupported fields include webhook identity, `allowed_mentions`, flags, polls and Discord response metadata. Delivery settings and destination channels are not imported or exported. Mentions retain the application's default suppression unless explicitly enabled on the Send screen.

## Files and validation

Uploaded files are instance-specific and are omitted from exports, along with media properties that refer to them (`attachment://` and local upload API paths). The export dialog lists these omissions. No attachment records, storage paths or internal upload identifiers are serialized. External HTTP(S) image URLs remain unchanged. Import never downloads or uploads files: incoming `attachments` are unsupported and reported. An `attachment://` reference without an uploaded file is rejected by shared message validation; replace it with a public image URL before importing, or add the file through the composer afterwards.

The conversion is implemented independently against [Discord's documented message and embed structures](https://docs.discord.com/developers/resources/message), with original fixtures. It does not reuse another builder's implementation or fixtures. Compatibility covers the message subset above, rather than a complete Discord API response or a backup of another application's configuration. Types are checked before conversion, then the shared composer schema and validation enforce the same Discord limits, URL rules and required field text as sending. Invalid JSON, wrong types, invalid timestamps and over-limit messages are rejected without modifying the current draft.

Exports use an explicit property allowlist. Bot credentials are server-only and are never available to the converter. History and template backup or restore are outside this format. A half-written or otherwise invalid draft can be exported for reference, but must satisfy message validation before it can be imported or sent; omitting uploaded media can also leave an embed empty, which import reports as an error.
