import { fetchDOM, postJSON, fetchText } from "../lib/fetcher.js";
import { sources } from "../config/index.js";
import { BadGatewayError } from "../lib/errors.js";
import type { HTMLElement } from "node-html-parser";

const BASE = sources.otakudesu.baseUrl;

/** Scrape HTML DOM dari path Otakudesu */
export async function scrapeDOM(
	pathname: string,
	ref?: string,
	sanitize = false,
): Promise<HTMLElement> {
	return fetchDOM(`${BASE}${pathname}`, { ref, sanitize });
}

/**
 * Grup mirror terakhir (biasanya 720p) di halaman episode tidak ditutup
 * `</ul>`-nya, sehingga parser membuang `ul` beserta label kualitasnya.
 */
const closeMirrorGroups = (html: string): string =>
	html.replace(
		/(<ul class="m\d+p"[^>]*>)([\s\S]*?)(<\/ul>|<\/div>)/g,
		(match, open, body, close) => (close === "</ul>" ? match : `${open}${body}</ul>${close}`),
	);

export async function scrapeEpisodeDOM(episodeId: string): Promise<HTMLElement> {
	return fetchDOM(`${BASE}/episode/${episodeId}`, { transform: closeMirrorGroups });
}

const AJAX_ENDPOINT = `${BASE}/wp-admin/admin-ajax.php`;

/**
 * Nama action AJAX Otakudesu adalah hash yang tertanam di script halaman
 * episode dan sesekali berganti. Kalau pemilihan mirror mulai gagal, ambil
 * nilai barunya dari `<script>` di bagian bawah halaman episode.
 */
const NONCE_ACTION = "aa1208d27f29ca340c92c66d1926f13f";
const CONTENT_ACTION = "2a3505c93b0035d3f455df82bf976b84";

/** Dapatkan WordPress nonce untuk AJAX request */
export async function scrapeNonce(referer: string = `${BASE}/`): Promise<string> {
	const data = await postJSON<{ data: string }>(
		AJAX_ENDPOINT,
		{ action: NONCE_ACTION },
		referer,
	);

	if (!data?.data) {
		throw new BadGatewayError("Failed to obtain streaming nonce");
	}

	return data.data;
}

/**
 * Scrape server streaming via AJAX. Respons berisi HTML ter-encode base64 yang
 * memuat iframe pemutar.
 */
export async function scrapeServer(
	body: Record<string, string>,
	referer: string = `${BASE}/`,
): Promise<string> {
	const data = await postJSON<{ data: string }>(
		AJAX_ENDPOINT,
		{ ...body, action: CONTENT_ACTION },
		referer,
	);

	if (!data?.data) {
		throw new BadGatewayError("Streaming server returned no content");
	}

	return Buffer.from(data.data, "base64").toString("utf-8");
}

/** Fetch teks dari path (digunakan untuk secret/utility) */
export async function scrapeText(pathname: string): Promise<string> {
	return fetchText(`${BASE}${pathname}`);
}
