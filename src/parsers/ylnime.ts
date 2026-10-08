import type { HTMLElement } from "node-html-parser";
import { NotFoundError } from "../lib/errors.js";
import { Text, Src, Attr } from "./utils.js";
import type { Pagination, Server, YLnime } from "../types/index.js";
import { sources } from "../config/index.js";

const baseUrl = sources.ylnime.baseUrl;

/**
 * Sebagian slug series YLnime diakhiri "/" (mis. `gintama/`) dan tanpa garis
 * miring itu halamannya kosong. Garis miring tidak aman di satu segmen URL,
 * jadi diganti "~" saat dikirim ke klien dan dikembalikan saat diminta.
 */
export const toSeriesToken = (slug: string): string => slug.replace(/\/$/, "~");
export const fromSeriesToken = (token: string): string => token.replace(/~$/, "/");

/** Halaman episode butuh slug series, jadi keduanya digabung dalam satu token. */
const EPISODE_SEPARATOR = "__";
export const toEpisodeToken = (episodeId: string, seriesSlug: string): string =>
	`${episodeId}${EPISODE_SEPARATOR}${toSeriesToken(seriesSlug)}`;
export const fromEpisodeToken = (token: string): { episodeId: string; seriesSlug: string } => {
	const index = token.indexOf(EPISODE_SEPARATOR);
	if (index <= 0) return { episodeId: token, seriesSlug: "" };
	return {
		episodeId: token.slice(0, index),
		seriesSlug: fromSeriesToken(token.slice(index + EPISODE_SEPARATOR.length)),
	};
};

export const seriesUrl = (slug: string): string =>
	`${baseUrl}/index.php?series=${encodeURIComponent(slug)}`;

function queryParam(href: string, key: string): string {
	try {
		return new URL(href.replace(/&amp;/g, "&"), `${baseUrl}/`).searchParams.get(key) ?? "";
	} catch {
		return "";
	}
}

function absolute(src: string): string {
	if (!src) return "";
	try {
		return new URL(src, `${baseUrl}/`).href;
	} catch {
		return src;
	}
}

function seriesCards(root: HTMLElement): HTMLElement[] {
	return root.querySelectorAll(".card").filter((card) => card.querySelector('a[href*="series="]'));
}

function parseCard(card: HTMLElement): YLnime.AnimeCard | null {
	const slug = queryParam(Attr(card.querySelector('a[href*="series="]'), "href"), "series");
	if (!slug) return null;

	const img = card.querySelector("img");
	const scoreEl = card.querySelectorAll("span").find((span) => span.querySelector(".fa-star"));
	// Label pojok kiri atas: hari tayang di daftar ongoing, "Tamat"/"Movie" di
	// daftar lain, atau skor ("★ 8.7") di daftar genre. Angka peringkat di
	// bagian "Top Anime" sengaja diabaikan.
	const corner = Text(card.querySelector(".badge-corner, span.bg-success"));
	const cornerScore = corner.match(/^★\s*([\d.]+)/)?.[1] ?? "";
	const label = cornerScore ? "" : corner;

	return {
		title: Text(card.querySelector(".card-title")) || Attr(img, "alt"),
		slug: toSeriesToken(slug),
		poster: absolute(Src(img)),
		label,
		score: scoreEl ? Text(scoreEl) : cornerScore,
		status: Text(card.querySelector("span.bottom-0")) || (label === "Tamat" ? "Completed" : ""),
		sourceUrl: seriesUrl(slug),
	};
}

export function parseCards(root: HTMLElement): YLnime.AnimeCard[] {
	const seen = new Set<string>();
	const result: YLnime.AnimeCard[] = [];

	for (const card of seriesCards(root)) {
		const item = parseCard(card);
		if (!item || seen.has(item.slug)) continue;
		seen.add(item.slug);
		result.push(item);
	}

	if (!result.length) throw new NotFoundError("No anime found");
	return result;
}

/** Pager YLnime hanya punya tombol sebelumnya/berikutnya tanpa jumlah halaman. */
export function parsePagination(doc: HTMLElement, page: number): Pagination {
	const hasNextPage = doc
		.querySelectorAll(".pager a")
		.some((a) => /berikutnya/i.test(Text(a)));
	const hasPrevPage = page > 1;

	return {
		currentPage: page,
		prevPage: hasPrevPage ? page - 1 : null,
		nextPage: hasNextPage ? page + 1 : null,
		totalPages: hasNextPage ? page + 1 : page,
		hasPrevPage,
		hasNextPage,
	};
}

export function parseSchedule(doc: HTMLElement): YLnime.ScheduleGroup[] {
	const result: YLnime.ScheduleGroup[] = [];

	for (const header of doc.querySelectorAll(".day-header")) {
		// Header berisi "Kamis 08 Oktober 2026 HARI INI 6 Anime"; nama harinya saja.
		const day = Text(header).trim().split(/\s+/)[0] ?? "";
		const container = header.parentNode;
		if (!day || !container) continue;

		const animeList = seriesCards(container)
			.map(parseCard)
			.filter((item): item is YLnime.AnimeCard => item !== null);

		if (animeList.length) result.push({ day, animeList });
	}

	if (!result.length) throw new NotFoundError("No schedule data found");
	return result;
}

export function parseGenres(doc: HTMLElement): YLnime.GenreCard[] {
	const seen = new Set<string>();
	const result: YLnime.GenreCard[] = [];

	for (const link of doc.querySelectorAll('a.genre-pill[href*="g="]')) {
		const genreId = queryParam(Attr(link, "href"), "g");
		if (!genreId || seen.has(genreId)) continue;
		seen.add(genreId);
		result.push({ title: Text(link), genreId });
	}

	if (!result.length) throw new NotFoundError("No genres found");
	return result;
}

export function parseAnimeDetails(doc: HTMLElement, slug: string): YLnime.AnimeDetails {
	const titleEl = doc.querySelector("h1");
	const title = Text(titleEl);
	const info = titleEl?.parentNode;
	if (!title || !info) throw new NotFoundError("Anime not found");

	const [status = "", type = "", year = ""] = (info.querySelector(".d-flex")?.querySelectorAll("span") ?? [])
		.map((span) => Text(span));

	const genreList: YLnime.GenreCard[] = info
		.querySelectorAll('a[href*="search="]')
		.map((link) => {
			const name = Text(link).replace(/,\s*$/, "");
			return { title: name, genreId: name.toLowerCase().replace(/\s+/g, "-") };
		})
		.filter((genre) => genre.title);

	const episodeList: YLnime.EpisodeItem[] = [];
	for (const link of info.querySelectorAll('a[href*="episode="]')) {
		const episodeId = queryParam(Attr(link, "href"), "episode");
		if (!episodeId) continue;
		episodeList.push({
			title: Text(link.querySelector("span")) || Text(link),
			slug: toEpisodeToken(episodeId, slug),
			date: Text(link.querySelector("small")),
		});
	}

	return {
		title,
		poster: absolute(Src(doc.querySelector("img.img-fluid.rounded"))),
		status,
		type,
		year,
		score: Text(doc.querySelector("h3.text-success")).replace(/\s*match$/i, ""),
		synopsis: Text(info.querySelector("p")),
		genreList,
		episodeList,
		sourceUrl: seriesUrl(slug),
	};
}

export function parseEpisodePage(doc: HTMLElement, seriesSlug: string) {
	const title = Text(doc.querySelector("#ylJudulEp")).replace(/\s*-\s*YLnime$/i, "");
	const animeLink = doc.querySelectorAll(".breadcrumb a").find((a) => /series=/.test(Attr(a, "href")));
	if (!title || !animeLink) throw new NotFoundError("Episode not found");

	return {
		title,
		animeTitle: Text(animeLink),
		animeSlug: toSeriesToken(queryParam(Attr(animeLink, "href"), "series") || seriesSlug),
	};
}

function hostLabel(link: string): string {
	try {
		const host = new URL(link).hostname.replace(/^www\./, "");
		if (host.includes("animeverse")) return "Animeverse";
		if (host.includes("animekita")) return "AnimeKita";
		return host.split(".").slice(-2, -1)[0] ?? host;
	} catch {
		return "Server";
	}
}

/**
 * Pixeldrain menolak pemutaran lintas situs (`hotlink_detected`) untuk akun
 * gratis — dipicu header `Sec-Fetch-Site: cross-site` yang tidak bisa diubah
 * browser — dan halaman `/u/`-nya memasang `frame-ancestors 'self'`.
 */
const isPlayable = (link: string): boolean => Boolean(link) && !link.includes("pixeldrain.com");

export function toServers(streams: YLnime.Stream[]): Server[] {
	const counts = new Map<string, number>();

	return streams
		.filter((stream) => isPlayable(stream.link))
		.map((stream) => {
			const base = `${hostLabel(stream.link)} ${stream.reso}`.trim();
			const count = (counts.get(base) ?? 0) + 1;
			counts.set(base, count);
			return {
				title: count > 1 ? `${base} #${count}` : base,
				serverId: stream.link,
			};
		});
}
