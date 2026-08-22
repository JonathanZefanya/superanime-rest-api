import { pipe, string, optional, regex, minLength, maxLength } from "valibot";

export const PageSchema = optional(
	pipe(string(), regex(/^\d{1,6}$/)),
	"1",
);

export const SearchSchema = pipe(
	string(),
	minLength(1, "Search query is required"),
	maxLength(100, "Search query too long"),
);

/** Payload safelink berupa base64url dari JSON terenkripsi Laravel. */
export const DownloadIdSchema = pipe(
	string(),
	minLength(1, "Download id is required"),
	maxLength(600, "Download id too long"),
	regex(/^[A-Za-z0-9+/=_-]+$/, "Invalid download id"),
);
