CREATE TABLE `sends` (
  `id` text PRIMARY KEY NOT NULL,
  `payload_json` text NOT NULL,
  `search_text` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('draft', 'scheduled', 'sending', 'done', 'partial', 'failed', 'cancelled')),
  `scheduled_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
