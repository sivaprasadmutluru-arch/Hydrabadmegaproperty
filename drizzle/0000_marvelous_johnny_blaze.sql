CREATE TABLE `registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`category` text NOT NULL,
	`details` text NOT NULL,
	`status` text NOT NULL,
	`payment` text DEFAULT 'Not required' NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`checked_in` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
