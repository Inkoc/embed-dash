CREATE TABLE `edit_runs` (
	`retained_json` text,
	`id` text PRIMARY KEY NOT NULL,
	`send_id` text NOT NULL,
	FOREIGN KEY (`send_id`) REFERENCES `sends`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `send_targets` ADD `attachments_json` text;--> statement-breakpoint
ALTER TABLE `send_targets` ADD `edit_status` text;--> statement-breakpoint
ALTER TABLE `send_targets` ADD `edit_error` text;--> statement-breakpoint
ALTER TABLE `sends` ADD `edit_id` text;--> statement-breakpoint
ALTER TABLE `sends` ADD `edit_status` text;--> statement-breakpoint
ALTER TABLE `sends` ADD `last_edited_at` integer;