CREATE TABLE `access_tokens` (
	`token_hash` text PRIMARY KEY,
	`device_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT `fk_access_tokens_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` integer PRIMARY KEY,
	`client_id` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer,
	`icon` blob,
	`icon_type` text
);
--> statement-breakpoint
CREATE TABLE `auth_codes` (
	`code_hash` text PRIMARY KEY,
	`app_id` integer NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`device_name` text,
	`expires_at` integer NOT NULL,
	CONSTRAINT `fk_auth_codes_app_id_apps_id_fk` FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` integer PRIMARY KEY,
	`app_id` integer NOT NULL,
	`name` text NOT NULL,
	`refresh_token_hash` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	CONSTRAINT `fk_devices_app_id_apps_id_fk` FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`app_id` integer NOT NULL,
	`collection` text NOT NULL,
	`id` text NOT NULL,
	`data` text,
	`seq` integer NOT NULL,
	CONSTRAINT `documents_pk` PRIMARY KEY(`app_id`, `collection`, `id`),
	CONSTRAINT `fk_documents_app_id_apps_id_fk` FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner` (
	`id` integer PRIMARY KEY,
	`webauthn_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "single_owner" CHECK("id" = 1)
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY,
	`public_key` blob NOT NULL,
	`counter` integer NOT NULL,
	`transports` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `recovery_tokens` (
	`token_hash` text PRIMARY KEY,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_changes` ON `documents` (`app_id`,`collection`,`seq`);