CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`csrf_token` text NOT NULL,
	`expires_at` integer NOT NULL
);
