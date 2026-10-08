import type { Request, Response, NextFunction } from "express";
import * as scraper from "../scrapers/nontonanimeid.js";
import * as parser from "../parsers/nontonanimeid.js";
import { setPayload } from "../lib/response.js";
import { BadGatewayError, BadRequestError } from "../lib/errors.js";
import { paginateAnimeList } from "../lib/anime-list.js";
import { cachedAsync } from "../lib/async-cache.js";
import { sources } from "../config/index.js";
import type { NontonAnimeID } from "../types/index.js";

const BASE = sources.nontonanimeid.baseUrl;
const SEARCH_MAX_PAGES = 5;

/**
 * Nonce `player_ajax` sama untuk semua halaman episode selama masa berlakunya,
 * jadi disimpan dari halaman episode terakhir yang dibuka dan hanya diambil
 * ulang kalau server menolaknya.
 */
let playerNonce = "";

function getPage(query: Record<string, unknown>): number {
	const page = Number.parseInt(String(query.page ?? "1"), 10);
	return Number.isFinite(page) && page > 0 ? page : 1;
}

function requireParam(value: unknown, label: string): string {
	const cleaned = String(value ?? "").trim();
	if (!cleaned || !/^[\w%.-]+$/.test(cleaned)) throw new BadRequestError(`Invalid ${label}`);
	return cleaned;
}

const pagePath = (base: string, page: number, query = ""): string =>
	`${base}${page > 1 ? `page/${page}/` : ""}${query}`;

export async function getRoutes(req: Request, res: Response, next: NextFunction) {
	try {
		const routes = [
			{ path: "/latest", description: "Latest updated anime" },
			{ path: "/ongoing", description: "Currently airing anime (query: page)" },
			{ path: "/completed", description: "Finished anime (query: page)" },
			{ path: "/schedule", description: "Release schedule" },
			{ path: "/anime-list", description: "Anime A-Z (query: initial, page)" },
			{ path: "/genre", description: "All genres" },
			{ path: "/genres/:genreId", description: "Anime by genre (query: page)" },
			{ path: "/search", description: "Search anime (query: q)" },
			{ path: "/anime/:slug", description: "Anime details" },
			{ path: "/episode/:slug", description: "Episode details" },
			{ path: "/server/:serverId", description: "Resolve a streaming server" },
		];
		res.json(setPayload(res, { data: routes }));
	} catch (err) {
		next(err);
	}
}

/**
 * "Episode Terbaru" di beranda, urut dari update terakhir. Paginasi beranda
 * diabaikan situsnya (`/page/2/` berisi hal yang sama), jadi hanya satu halaman.
 */
export async function getLatest(req: Request, res: Response, next: NextFunction) {
	try {
		const doc = await scraper.scrapeDOM("/");
		const data = doc.querySelectorAll("article.animeseries").flatMap((article) => parser.parseCards(article, { required: false }));
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getOngoing(req: Request, res: Response, next: NextFunction) {
	try {
		const page = getPage(req.query);
		const doc = await scraper.scrapeDOM(
			pagePath("/anime/", page, "?status=Currently+Airing&sort=series_popularity"),
		);
		res.json(setPayload(res, { data: parser.parseCards(doc), pagination: parser.parsePagination(doc, page) }));
	} catch (err) {
		next(err);
	}
}

export async function getCompleted(req: Request, res: Response, next: NextFunction) {
	try {
		const page = getPage(req.query);
		const doc = await scraper.scrapeDOM(
			pagePath("/anime/", page, "?status=Finished+Airing&sort=series_tahun_newest"),
		);
		res.json(setPayload(res, { data: parser.parseCards(doc), pagination: parser.parsePagination(doc, page) }));
	} catch (err) {
		next(err);
	}
}

export async function getSchedule(req: Request, res: Response, next: NextFunction) {
	try {
		const data = parser.parseSchedule(await scraper.scrapeDOM("/jadwal-rilis/"));
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimeCollections(req: Request, res: Response, next: NextFunction) {
	try {
		// Mode daftar memuat seluruh katalog (±2 MB) dalam satu halaman.
		const data = await cachedAsync("anime-list:nontonanimeid", async () =>
			parser.parseAnimeCollections(await scraper.scrapeDOM("/anime/?mode=list&sort=series_title")),
		);
		res.json(setPayload(res, paginateAnimeList(data, req.query.initial, req.query.page)));
	} catch (err) {
		next(err);
	}
}

export async function getGenreList(req: Request, res: Response, next: NextFunction) {
	try {
		const data = parser.parseGenres(await scraper.scrapeDOM("/genres/"));
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimesByGenre(req: Request, res: Response, next: NextFunction) {
	try {
		const genreId = requireParam(req.params.genreId, "genre");
		const page = getPage(req.query);
		const doc = await scraper.scrapeDOM(pagePath(`/genres/${genreId}/`, page));
		res.json(setPayload(res, { data: parser.parseCards(doc), pagination: parser.parsePagination(doc, page) }));
	} catch (err) {
		next(err);
	}
}

export async function searchAnimes(req: Request, res: Response, next: NextFunction) {
	try {
		const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
		if (!q || q.length > 50) throw new BadRequestError("Invalid search query");

		const search = `?s=${encodeURIComponent(q)}`;
		const firstDoc = await scraper.scrapeDOM(`/${search}`);
		const data = parser.parseCards(firstDoc);
		const totalPages = Math.min(parser.parsePagination(firstDoc, 1).totalPages, SEARCH_MAX_PAGES);

		const rest = await Promise.all(
			Array.from({ length: totalPages - 1 }, (_, index) =>
				scraper
					.scrapeDOM(pagePath("/", index + 2, search))
					.then((doc) => parser.parseCards(doc, { required: false }))
					.catch(() => [] as NontonAnimeID.AnimeCard[]),
			),
		);

		const seen = new Set(data.map((item) => item.slug));
		for (const item of rest.flat()) {
			if (seen.has(item.slug)) continue;
			seen.add(item.slug);
			data.push(item);
		}

		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

type LoadMoreParams = {
	nonce: string;
	posts: string;
	current_page: string;
	max_page: string;
	type: string;
	posts_to_display: string;
	total_posts: string;
	is_large_series: string;
};

export async function getAnimeDetails(req: Request, res: Response, next: NextFunction) {
	try {
		const slug = requireParam(req.params.slug, "anime slug");
		const doc = await scraper.scrapeDOM(`/anime/${slug}/`);
		const data = parser.parseAnimeDetails(doc, slug);

		// Series panjang hanya menampilkan 20 episode; sisanya dimuat lewat
		// AJAX "load more" per batch.
		const params = parser.readScriptVar<LoadMoreParams>(doc, "misha_loadmore_params2");
		const total = Number(params?.total_posts ?? 0);
		if (params && total > data.episodeList.length) {
			const referer = `${BASE}/anime/${slug}/`;
			const firstPage = Number(params.current_page) || 1;
			const lastPage = Number(params.max_page) || firstPage;
			const body = {
				nonce: params.nonce,
				query: params.posts,
				type: params.type,
				posts_to_display: params.posts_to_display,
				is_large_series: params.is_large_series,
				total_posts: params.total_posts,
			};

			const batches = await Promise.all(
				Array.from({ length: Math.max(0, lastPage - firstPage + 1) }, (_, index) =>
					scraper
						.scrapeEpisodeBatch(body, firstPage + index, referer)
						.then(parser.parseEpisodeBatch)
						.catch(() => [] as NontonAnimeID.EpisodeItem[]),
				),
			);

			const seen = new Set(data.episodeList.map((episode) => episode.slug));
			for (const episode of batches.flat()) {
				if (seen.has(episode.slug)) continue;
				seen.add(episode.slug);
				data.episodeList.push(episode);
			}
		}

		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getEpisodeDetails(req: Request, res: Response, next: NextFunction) {
	try {
		const slug = requireParam(req.params.slug, "episode slug");
		const doc = await scraper.scrapeDOM(`/${slug}/`);
		const page = parser.parseEpisodePage(doc, slug);
		if (page.nonce) playerNonce = page.nonce;

		const data: NontonAnimeID.EpisodeDetails = {
			title: page.title,
			animeSlug: page.animeSlug,
			navigation: page.navigation,
			serverList: parser.toServers(page.servers),
			defaultStreaming: page.defaultStreaming,
			sourceUrl: `${BASE}/${slug}/`,
		};
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

async function refreshNonce(episodeSlug: string): Promise<string> {
	const page = parser.parseEpisodePage(await scraper.scrapeDOM(`/${episodeSlug}/`), episodeSlug);
	playerNonce = page.nonce;
	return playerNonce;
}

export async function getServerDetails(req: Request, res: Response, next: NextFunction) {
	try {
		const payload = parser.decodeServerId(String(req.params.serverId ?? ""));
		if (!payload) throw new BadRequestError("Invalid server ID format");

		const referer = `${BASE}/${payload.episode}/`;
		const nonce = playerNonce || (await refreshNonce(payload.episode));
		let url = parser.parsePlayerUrl(await scraper.scrapePlayer(payload, nonce, referer));

		if (!url) {
			const fresh = await refreshNonce(payload.episode);
			url = parser.parsePlayerUrl(await scraper.scrapePlayer(payload, fresh, referer));
		}
		if (!url) throw new BadGatewayError("Server ini sedang offline. Pilih server lain.");

		res.json(setPayload(res, { data: { title: payload.type, url } }));
	} catch (err) {
		next(err);
	}
}
