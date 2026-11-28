# Message JSON

Use **Import JSON** or **Export JSON** above the composer. Export offers clipboard copy and a `message.json` download. Import accepts pasted JSON or a local file; **Replace draft** validates it before replacing the current message and releasing its uploaded files. Errors identify the property or Discord limit involved and leave the draft unchanged. A non-empty draft requires confirmation before replacement. After success, the dialog closes and Compose shows the import result and compatibility notices, with focus on that result.

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

Supported properties are `content`, `embeds` and legacy `components` action rows. Each embed supports `title`, `description`, `url`, numeric `color`, ISO 8601 `timestamp`, `author` (`name`, `url`, `icon_url`), `footer` (`text`, `icon_url`), `fields` (`name`, `value`, optional `inline`), `image.url` and `thumbnail.url`. Missing optional text becomes empty; missing field `inline` becomes false; missing colour uses the composer's default teal. Imports treat `null` as missing for `content`, `embeds`, colour and other optional embed properties; required field names and values still need text. Exports omit invalid or unfinished hex colours and explain the omission in a notice. A dynamic “time of sending” becomes the export time, with a notice. JSON exports preserve text and explicit timestamps; editor row identifiers are never exported.

Imports also accept the community builder wrapper used by Discohook:

```json
{
  "messages": [
    { "data": { "content": "Community update", "embeds": [] } }
  ]
}
```

Only the first message is loaded. Multiple messages produce a notice. An empty message list is rejected. Unsupported properties are listed by path, including nested embed metadata and wrapper metadata. Null values and empty arrays, including `attachments: []`, do not produce unsupported-field notices. The notice shows the first 20 entries and counts any remaining entries. Link buttons are loaded and exported as action rows (`type: 1`) containing buttons (`type: 2`, `style: 5`, `url`, optional `label` and `emoji`). A message holds up to five rows of five buttons. Labels allow 80 characters and HTTP(S) URLs allow 512. Each button needs a label or emoji; emoji objects contain `name` and optionally a custom Discord `id` and `animated`. Interactive buttons, select menus and Components V2 are omitted with compatibility notices. Unfinished buttons and empty rows are omitted from exports. Other unsupported fields include webhook identity, `allowed_mentions`, flags, polls and Discord response metadata. Delivery settings and destination channels are not imported or exported. Mentions retain the application's default suppression unless explicitly enabled on the Send screen.

## Files and validation

Uploaded files are instance-specific and are omitted from exports, along with media properties that refer to them (`attachment://` and local upload API paths). The export dialog lists these omissions. No attachment records, storage paths or internal upload identifiers are serialized. External HTTP(S) image URLs remain unchanged. Import never downloads or uploads files: non-empty incoming `attachments` are unsupported and reported. JSON files larger than 1 MB (1,048,576 bytes) are rejected before reading. An `attachment://` reference without an uploaded file is rejected by shared message validation; replace it with a public image URL before importing, or add the file through the composer afterwards.

The conversion is implemented independently against [Discord's documented message and embed structures](https://docs.discord.com/developers/resources/message), with original fixtures. It does not reuse another builder's implementation or fixtures. Compatibility covers the message subset above, rather than a complete Discord API response or a backup of another application's configuration. Types are checked before conversion, then the shared composer schema and validation enforce the same Discord limits, URL rules and required field text as sending. Invalid JSON, wrong types, invalid timestamps and over-limit messages are rejected without modifying the current draft.

Exports use an explicit property allowlist. Bot credentials are server-only and are never available to the converter. History and template backup or restore are outside this format. A half-written or otherwise invalid draft can be exported for reference, but must satisfy message validation before it can be imported or sent; omitting uploaded media can also leave an embed empty, which import reports as an error.

## Link button example

```json
{
  "content": "Community resources",
  "components": [{
    "type": 1,
    "components": [{
      "type": 2,
      "style": 5,
      "label": "Read the guide",
      "url": "https://example.com/guide",
      "emoji": { "name": "📖" }
    }]
  }]
}
```

The server sends these legacy components using its bot token through Discord's create-message endpoint and replaces the components on edit, including an empty array to remove them. No Components V2 flag is set, so message text and embeds remain available. See [Discord's component reference](https://docs.discord.com/developers/components/reference) and [message create/edit API](https://docs.discord.com/developers/resources/message).
