CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
