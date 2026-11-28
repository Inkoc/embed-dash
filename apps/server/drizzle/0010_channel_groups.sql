CREATE TABLE `channel_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`channels_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
