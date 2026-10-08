import { fetchDOM, fetchText } from "../lib/fetcher.js";
import { sources } from "../config/index.js";
import { BadGatewayError } from "../lib/errors.js";
import type { HTMLElement } from "node-html-parser";
import type { YLnime } from "../types/index.js";

const BASE = sources.ylnime.baseUrl;

export async function scrapeDOM(pathname: string): Promise<HTMLElement> {
	return fetchDOM(`${BASE}/${pathname.replace(/^\//, "")}`);
}

/** Endpoint JSON yang dipakai pemutar YLnime saat berganti episode/resolusi. */
export async function scrapeEpisodeJson(
	episodeId: string,
	seriesSlug: string,
	reso: string,
): Promise<YLnime.EpisodeJson> {
	// Tanpa `series`, prev_ep/next_ep selalu null.
	const params = new URLSearchParams({ yl_ep_json: "1", episode: episodeId, series: seriesSlug, reso });

	const text = await fetchText(`${BASE}/index.php?${params}`, `${BASE}/`);
	try {
		return JSON.parse(text) as YLnime.EpisodeJson;
	} catch {
		throw new BadGatewayError("Invalid episode response from YLnime");
	}
}
