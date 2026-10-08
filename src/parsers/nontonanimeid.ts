import { parse, type HTMLElement } from "node-html-parser";
import { NotFoundError } from "../lib/errors.js";
import { Text, Src, Attr } from "./utils.js";
import type { NontonAnimeID, Pagination, Server } from "../types/index.js";
import { sources } from "../config/index.js";

const baseUrl = sources.nontonanimeid.baseUrl;

const ANIME_PATH = /\/anime\/([^/?#]+)\/?(?:[?#].*)?$/;

function pathSegments(href: string): string[] {
	try {
		return new URL(href, `${baseUrl}/`).pathname.split("/").filter(Boolean);
	} catch {
		return [];
	}
}

/** Slug dari `/anime/<slug>/` (series) atau `/<slug>/` (episode). */
export function slugFromHref(href: string): string {
	return pathSegments(href).at(-1) ?? "";
}

function animeSlug(href: string): string {
	return href.match(ANIME_PATH)?.[1] ?? "";
}

function cleanPoster(src: string): string {
	// Gambar dilayani lewat proxy Jetpack (`i0.wp.com/...?h=210`); parameter
	// ukurannya dibuang supaya poster tidak buram di kartu yang lebih besar.
	return src.replace(/\?h=\d+$/, "");
}

/**
 * Konfigurasi JavaScript halaman (nonce, parameter AJAX) disisipkan sebagai
 * `<script src="data:text/javascript;base64,...">`, bukan skrip inline biasa.
 */
export function readScriptVar<T>(doc: HTMLElement, name: string): T | null {
	for (const script of doc.querySelectorAll('script[src^="data:text/javascript;base64,"]')) {
		const encoded = Attr(script, "src").replace("data:text/javascript;base64,", "");
		const code = Buffer.from(encoded, "base64").toString("utf-8");
		const match = code.match(new RegExp(`var\\s+${name}\\s*=\\s*(\\{[\\s\\S]*?\\});?\\s*$`));
		if (!match) continue;
		try {
			return JSON.parse(match[1]) as T;
		} catch {
			return null;
		}
	}
	return null;
}

function parseCard(link: HTMLElement): NontonAnimeID.AnimeCard | null {
	const href = Attr(link, "href");
	const slug = animeSlug(href);
	if (!slug) return null;

	const img = link.querySelector("img");
	const titleEl =
		link.querySelector("[data-title-default]") ?? link.querySelector("h3") ?? link.querySelector(".title");
	const title = Attr(titleEl, "data-title-default") || Text(titleEl) || Attr(img, "alt") || Text(link);
	if (!title) return null;

	const currentEp = Text(link.querySelector(".current-ep"));

	return {
		title,
		slug,
		poster: cleanPoster(Src(img)),
		episode: Text(link.querySelector(".types.episodes")) || (currentEp && currentEp !== "?" ? currentEp : ""),
		score: Text(link.querySelector(".as-rating")).replace(/[^\d.]/g, "") ||
			Text(link.querySelector(".skor-angka")).replace(/[^\d.]/g, "").replace(/^0\.0$/, ""),
		type: Text(link.querySelector(".as-type")).replace(/[^\w\s-]/g, "").trim(),
		sourceUrl: `${baseUrl}/anime/${slug}/`,
	};
}

/** Kartu anime dari berbagai tata letak tema (beranda, arsip, ongoing, jadwal). */
export function parseCards(root: HTMLElement, { required = true } = {}): NontonAnimeID.AnimeCard[] {
	const seen = new Set<string>();
	const result: NontonAnimeID.AnimeCard[] = [];

	for (const link of root.querySelectorAll('a[href*="/anime/"]')) {
		if (!link.querySelector("img")) continue;
		const card = parseCard(link);
		if (!card || seen.has(card.slug)) continue;
		seen.add(card.slug);
		result.push(card);
	}

	if (required && !result.length) throw new NotFoundError("No anime found");
	return result;
}

/** Pagination WordPress: nomor halaman terbesar diambil dari tautan `/page/N/`. */
export function parsePagination(doc: HTMLElement, page: number): Pagination {
	const numbers = doc
		.querySelectorAll('a[href*="/page/"]')
		.map((a) => Number(Attr(a, "href").match(/\/page\/(\d+)/)?.[1] ?? 0));
	const totalPages = Math.max(page, ...numbers);
	const hasNextPage = page < totalPages;
	const hasPrevPage = page > 1;

	return {
		currentPage: page,
		prevPage: hasPrevPage ? page - 1 : null,
		nextPage: hasNextPage ? page + 1 : null,
		totalPages,
		hasPrevPage,
		hasNextPage,
	};
}

export function parseSchedule(doc: HTMLElement): NontonAnimeID.ScheduleGroup[] {
	const result: NontonAnimeID.ScheduleGroup[] = [];

	for (const tab of doc.querySelectorAll(".as-tab-content")) {
		const day = Attr(tab, "data-date-text").split(",")[0]?.trim() ||
			Attr(tab, "id").replace(/^\w/, (char) => char.toUpperCase());
		const animeList = parseCards(tab, { required: false });
		if (day && animeList.length) result.push({ day, animeList });
	}

	if (!result.length) throw new NotFoundError("No schedule data found");
	return result;
}

export function parseGenres(doc: HTMLElement): NontonAnimeID.GenreCard[] {
	const seen = new Set<string>();
	const result: NontonAnimeID.GenreCard[] = [];

	for (const link of doc.querySelectorAll("a.genre-grid-card")) {
		const genreId = pathSegments(Attr(link, "href")).at(-1) ?? "";
		const title = Text(link.querySelector("h3, h4, .genre-name")) ||
			Attr(link.querySelector("img"), "alt").replace(/^Genre\s+/i, "");
		if (!genreId || genreId === "genres" || !title || seen.has(genreId)) continue;
		seen.add(genreId);
		result.push({ title, genreId });
	}

	if (!result.length) throw new NotFoundError("No genres found");
	return result;
}

/** Katalog lengkap dari `/anime/?mode=list`, sudah dikelompokkan per huruf oleh situsnya. */
export function parseAnimeCollections(doc: HTMLElement): NontonAnimeID.AnimeCollection[] {
	const result: NontonAnimeID.AnimeCollection[] = [];

	for (const group of doc.querySelectorAll(".letter-group")) {
		const animeList = group
			.querySelectorAll("a.series")
			.map((link) => {
				const slug = animeSlug(Attr(link, "href"));
				return { title: Attr(link, "data-title-default") || Text(link), slug, url: `${baseUrl}/anime/${slug}/` };
			})
			.filter((item) => item.slug && item.title);

		const initial = /^[A-Z]$/i.test(Text(group.querySelector(".letter-cell")))
			? Text(group.querySelector(".letter-cell")).toUpperCase()
			: "#";

		if (!animeList.length) continue;
		const existing = result.find((entry) => entry.initial === initial);
		if (existing) existing.animeList.push(...animeList);
		else result.push({ initial, animeList });
	}

	if (!result.length) throw new NotFoundError("No anime list found");
	return result;
}

export function parseEpisodeItems(root: HTMLElement): NontonAnimeID.EpisodeItem[] {
	return root
		.querySelectorAll("a.episode-item")
		.map((link) => ({
			title: Text(link.querySelector(".ep-title")) || Text(link),
			slug: slugFromHref(Attr(link, "href")),
			date: Text(link.querySelector(".ep-date")),
		}))
		.filter((episode) => episode.slug);
}

export function parseEpisodeBatch(html: string): NontonAnimeID.EpisodeItem[] {
	return parseEpisodeItems(parse(html));
}

function detailValue(doc: HTMLElement, label: string): string {
	const item = doc
		.querySelectorAll(".details-list li")
		.find((li) => Text(li.querySelector(".detail-label")).toLowerCase().startsWith(label.toLowerCase()));
	if (!item) return "";
	return Text(item).replace(Text(item.querySelector(".detail-label")), "").trim();
}

export function parseAnimeDetails(doc: HTMLElement, slug: string): NontonAnimeID.AnimeDetails {
	const titleEl = doc.querySelector("h1 [data-title-default]") ?? doc.querySelector("h1");
	const title = Attr(titleEl, "data-title-default") || Text(titleEl);
	if (!title || !doc.querySelector(".anime-card")) throw new NotFoundError("Anime not found");

	const quickInfo = doc.querySelectorAll(".anime-card__quick-info .info-item").map((el) => Text(el));
	const rawStatus = quickInfo[0] ?? "";
	const status = /airing/i.test(rawStatus) && /current/i.test(rawStatus)
		? "Ongoing"
		: /finished/i.test(rawStatus)
			? "Completed"
			: rawStatus;

	return {
		title,
		alternativeTitle: detailValue(doc, "English"),
		poster: cleanPoster(Src(doc.querySelector(".anime-card__sidebar img"))),
		score: Text(doc.querySelector(".anime-card__score .value")),
		type: Text(doc.querySelector(".anime-card__score .type")),
		status,
		studio: detailValue(doc, "Studios"),
		aired: detailValue(doc, "Aired"),
		season: Text(doc.querySelector(".anime-card__quick-info .season")),
		duration: quickInfo.find((info) => /min/i.test(info)) ?? "",
		synopsis: doc
			.querySelectorAll(".synopsis-prose p")
			.map((p) => Text(p))
			.filter(Boolean)
			.join("\n\n"),
		genreList: doc
			.querySelectorAll("a.genre-tag")
			.map((link) => ({ title: Text(link), genreId: pathSegments(Attr(link, "href")).at(-1) ?? "" }))
			.filter((genre) => genre.genreId),
		episodeList: parseEpisodeItems(doc),
		sourceUrl: `${baseUrl}/anime/${slug}/`,
	};
}

export function parseEpisodePage(doc: HTMLElement, slug: string) {
	const heading = doc.querySelector("h1.entry-title");
	const title = Text(heading).replace(/\s+Sub Indo$/i, "");
	if (!title) throw new NotFoundError("Episode not found");

	const navLinks = doc.querySelectorAll(".naveps a");
	const navSlug = (pattern: RegExp) => {
		const link = navLinks.find((a) => pattern.test(Text(a)));
		return link ? slugFromHref(Attr(link, "href")) || null : null;
	};
	const seriesLink = navLinks.find((a) => ANIME_PATH.test(Attr(a, "href")));

	const options = doc.querySelectorAll("li.kotak_player_option");
	const servers = options.map((li) => ({
		title: Text(li.querySelector("span")).replace(/^S-/, "") || Attr(li, "data-type"),
		payload: {
			post: Attr(li, "data-post"),
			nume: Attr(li, "data-nume"),
			type: Attr(li, "data-type"),
			episode: slug,
		} satisfies NontonAnimeID.ServerPayload,
	}));

	return {
		title,
		animeSlug: seriesLink ? animeSlug(Attr(seriesLink, "href")) : "",
		navigation: { prev: navSlug(/prev/i), next: navSlug(/next/i) },
		servers: servers.filter((server) => server.payload.post && server.payload.nume),
		defaultStreaming: Attr(doc.querySelector("#pembed iframe, .player-embed iframe, iframe[data-src]"), "data-src") ||
			Attr(doc.querySelector("#pembed iframe"), "src"),
		nonce: readScriptVar<{ nonce?: string }>(doc, "kotakajax")?.nonce ?? "",
	};
}

export function encodeServerId(payload: NontonAnimeID.ServerPayload): string {
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeServerId(serverId: string): NontonAnimeID.ServerPayload | null {
	try {
		const payload = JSON.parse(Buffer.from(serverId, "base64url").toString("utf-8"));
		return payload?.post && payload?.nume && payload?.episode ? payload : null;
	} catch {
		return null;
	}
}

export function toServers(servers: ReturnType<typeof parseEpisodePage>["servers"]): Server[] {
	return servers.map((server) => ({ title: server.title, serverId: encodeServerId(server.payload) }));
}

/** URL pemutar dari potongan HTML balasan `player_ajax`. */
export function parsePlayerUrl(html: string): string {
	const match = html.match(/<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i);
	return match ? match[1].replace(/&amp;/g, "&") : "";
}
