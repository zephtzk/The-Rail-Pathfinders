CREATE TABLE `sharing_state` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	CONSTRAINT "sharing_positive_revision" CHECK("sharing_state"."revision" > 0),
	CONSTRAINT "sharing_valid_json" CHECK(json_valid("sharing_state"."body"))
);
