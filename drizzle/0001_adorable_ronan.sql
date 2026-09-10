CREATE TABLE `model_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`key_ciphertext` text NOT NULL,
	`updated_at` text NOT NULL
);
