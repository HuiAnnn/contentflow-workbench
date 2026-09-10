CREATE TABLE `model_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`connection_id` text
);
--> statement-breakpoint
ALTER TABLE `model_connections` ADD `name` text DEFAULT '' NOT NULL;