CREATE TABLE `send_targets` (
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
	CONSTRAINT "send_targets_status_check" CHECK("send_targets"."status" IN ('pending', 'sent', 'failed', 'unknown'))
);
--> statement-breakpoint
CREATE INDEX `send_targets_send_idx` ON `send_targets` (`send_id`);