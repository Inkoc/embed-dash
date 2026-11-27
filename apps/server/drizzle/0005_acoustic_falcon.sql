PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_send_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`send_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`guild_name` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text NOT NULL,
	`message_id` text,
	`status` text NOT NULL,
	`error` text,
	`attempted_at` integer,
	`position` integer NOT NULL,
	FOREIGN KEY (`send_id`) REFERENCES `sends`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "send_targets_status_check" CHECK("__new_send_targets"."status" IN ('pending', 'posting', 'sent', 'failed', 'unknown'))
);
--> statement-breakpoint
INSERT INTO `__new_send_targets`("id", "send_id", "guild_id", "guild_name", "channel_id", "channel_name", "message_id", "status", "error", "attempted_at", "position") SELECT "id", "send_id", "guild_id", "guild_name", "channel_id", "channel_name", "message_id", "status", "error", "attempted_at", "position" FROM `send_targets`;--> statement-breakpoint
DROP TABLE `send_targets`;--> statement-breakpoint
ALTER TABLE `__new_send_targets` RENAME TO `send_targets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `send_targets_send_idx` ON `send_targets` (`send_id`);