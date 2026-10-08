import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import sanitizeHtml from "sanitize-html";
import { BadGatewayError } from "./errors.js";

const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

export interface FetchOptions {
	ref?: string;
	sanitize?: boolean;
	timeout?: number;
	/** Perbaiki HTML mentah sebelum di-parse, untuk markup upstream yang rusak. */
	transform?: (html: string) => string;
}

/**
 * Susun pesan error yang cukup untuk mendiagnosis penolakan dari upstream.
 *
 * Status saja tidak menjelaskan apa-apa saat sebuah sumber diblokir Cloudflare:
 * 403 bisa berarti aturan firewall (error 1020), tantangan JavaScript ("Just a
 * moment…"), Bot Fight Mode, atau memang penolakan dari origin-nya. Ketiganya
 * butuh penanganan berbeda, dan yang membedakan hanya isi halamannya — jadi
 * potongan teksnya ikut dibawa, bersama `cf-ray` supaya bisa dicocokkan dengan
 * log Cloudflare.
 */
async function describeFailure(res: Response, url: string): Promise<string> {
	let snippet = "";

	try {
		const body = await res.text();
		snippet = body
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 200);
	} catch {
		/* isi respons tidak selalu bisa dibaca */
	}

	const ray = res.headers.get("cf-ray");
	const server = res.headers.get("server");

	return [
		`Upstream returned ${res.status} for ${url}`,
		server ? `server=${server}` : "",
		ray ? `cf-ray=${ray}` : "",
		snippet ? `body="${snippet}"` : "",
	]
		.filter(Boolean)
		.join(" | ");
}

/**
 * Fetch URL, parse HTML, return DOM root.
 */
export async function fetchDOM(
	url: string,
	options: FetchOptions = {},
): Promise<HTMLElement> {
	const { ref, sanitize = false, timeout = 15_000, transform } = options;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const headers: Record<string, string> = {
			"User-Agent": DEFAULT_USER_AGENT,
		};
		if (ref) headers.Referer = ref;

		const res = await fetch(url, { headers, signal: controller.signal });

		if (!res.ok) {
			throw new BadGatewayError(await describeFailure(res, url));
		}

		let html = await res.text();
		if (!html || html.length < 50) {
			throw new BadGatewayError("Empty or too short response from upstream");
		}

		if (transform) html = transform(html);

		if (sanitize) {
			html = sanitizeHtml(html, {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat([
					"img", "video", "source", "iframe", "script",
				]),
				allowVulnerableTags: true,
				allowedAttributes: {
					"*": ["class", "id", "style"],
					...sanitizeHtml.defaults.allowedAttributes,
					img: ["src", "data-src", "alt", "title", "width", "height", "class"],
					a: ["href", "title", "target", "class", "rel"],
					iframe: ["src", "width", "height", "allowfullscreen"],
					source: ["src", "type"],
					video: ["src", "controls", "width", "height"],
					div: ["class", "id"],
					span: ["class"],
					ul: ["class"],
					li: ["class"],
					h1: ["class"], h2: ["class"], h3: ["class"], h4: ["class"], h5: ["class"],
				},
			});
		}

		return parseHtml(html);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * POST request ke endpoint, parse response sebagai JSON.
 */
export async function postJSON<T>(
	url: string,
	body: Record<string, string>,
	ref?: string,
	timeout = 15_000,
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const headers: Record<string, string> = {
			"User-Agent": DEFAULT_USER_AGENT,
			"Content-Type": "application/x-www-form-urlencoded",
		};
		if (ref) headers.Referer = ref;

		const params = new URLSearchParams(body).toString();

		const res = await fetch(url, {
			method: "POST",
			headers,
			body: params,
			signal: controller.signal,
		});

		if (!res.ok) {
			throw new BadGatewayError(await describeFailure(res, url));
		}

		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetch raw text dari URL.
 */
export async function fetchText(
	url: string,
	ref?: string,
	timeout = 15_000,
): Promise<string> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const headers: Record<string, string> = {
			"User-Agent": DEFAULT_USER_AGENT,
		};
		if (ref) headers.Referer = ref;

		const res = await fetch(url, { headers, signal: controller.signal });
		if (!res.ok) {
			throw new BadGatewayError(await describeFailure(res, url));
		}
		return await res.text();
	} finally {
		clearTimeout(timer);
	}
}
