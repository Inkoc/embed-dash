CREATE INDEX `sends_created_at_idx` ON `sends` (`created_at`,`id`);
--> statement-breakpoint
UPDATE sends SET search_text = fold(search_text);
