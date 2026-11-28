ALTER TABLE `send_targets` ADD `channel_kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `send_targets` ADD `publish_status` text;--> statement-breakpoint
ALTER TABLE `send_targets` ADD `publish_error` text;