import type { Request, Response, NextFunction } from "express";
import { parse as safeParse } from "valibot";
import * as schema from "../schemas/nimegami.js";
import * as scraper from "../scrapers/nimegami.js";
import * as parser from "../parsers/nimegami.js";
import { setPayload } from "../lib/response.js";
import { BadRequestError } from "../lib/errors.js";
import type { Nimegami, UrlLink } from "../types/index.js";
import { paginateAnimeList } from "../lib/anime-list.js";

/** Pagar pengaman kalau markup paginasi Nimegami berubah. */
const MAX_LIST_PAGES = 20;

function getPageFromQuery(query: Record<string, unknown>): string {
	try {
		return safeParse(schema.PageSchema, query.page);
	} catch {
		return "1";
	}
}

function getSearchQuery(query: Record<string, unknown>): string {
	try {
		return safeParse(schema.SearchSchema, query.q as string);
	} catch {
		throw new BadRequestError("Invalid search query");
	}
}

export async function getRoutes(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const routes = [
			{ path: "/", description: "Home - latest & recommended anime" },
			{ path: "/anime", description: "Anime list (query: page)" },
			{ path: "/anime/:slug", description: "Anime details" },
			{ path: "/search", description: "Search anime (query: q)" },
			{ path: "/anime-list", description: "All anime grouped A-Z" },
			{ path: "/schedule", description: "Release schedule grouped by day" },
			{ path: "/genre", description: "Genre category list" },
			{ path: "/ongoing", description: "Ongoing anime list (query: page)" },
			{ path: "/genre/:genreId", description: "Anime filtered by genre (query: page)" },
		];
		res.json(setPayload(res, { data: routes }));
	} catch (err) {
		next(err);
	}
}

export async function getHome(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const doc = await scraper.scrapeDOM("/");
		const data = parser.parseHome(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimeList(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const path = page !== "1" ? `/page/${page}/` : "/";
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseAnimeList(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimeDetails(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const { slug } = req.params;
		if (!slug) throw new BadRequestError("Slug is required");
		const doc = await scraper.scrapeDOM(`/${slug}/`);
		const data = parser.parseAnimeDetails(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

/**
 * Nimegami menyajikan seluruh episode pada halaman anime, jadi detail episode
 * diambil dari halaman yang sama lalu disaring per nomor episode.
 */
export async function getEpisodeDetails(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const { slug, episode } = req.params;
		if (!slug) throw new BadRequestError("Slug is required");

		const episodeNumber = parseInt(String(episode), 10);
		if (isNaN(episodeNumber)) throw new BadRequestError("Episode must be a number");

		const doc = await scraper.scrapeDOM(`/${slug}/`);
		const data = parser.parseEpisodeDetails(doc, String(slug), episodeNumber);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function searchAnimes(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const q = getSearchQuery(req.query);
		const doc = await scraper.scrapeDOM(`/?s=${encodeURIComponent(q)}&post_type=post`);
		const data = parser.parseSearchResults(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

export async function getSchedule(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const doc = await scraper.scrapeDOM("/anime-terbaru-sub-indo/");
		const data = parser.parseScheduleGroups(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimeCollections(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		// `/anime-list/` dipecah jadi beberapa halaman (±500 judul per halaman)
		// dan satu inisial bisa terpotong antar halaman, jadi semuanya diambil
		// lalu digabung per inisial.
		const first = await scraper.scrapeDOM("/anime-list/");
		const merged = new Map<string, UrlLink[]>();

		const collect = (groups: Nimegami.AnimeCollection[]) => {
			for (const group of groups) {
				const list = merged.get(group.initial) ?? [];
				list.push(...group.animeList);
				merged.set(group.initial, list);
			}
		};

		collect(parser.parseAnimeCollections(first));

		const totalPages = Math.min(parser.parsePagination(first)?.totalPages ?? 1, MAX_LIST_PAGES);
		for (let page = 2; page <= totalPages; page++) {
			const doc = await scraper.scrapeDOM(`/anime-list/page/${page}/`);
			collect(parser.parseAnimeCollections(doc));
		}

		const data = [...merged].map(([initial, animeList]) => ({ initial, animeList }));
		res.json(setPayload(res, paginateAnimeList(data, req.query.initial, req.query.page)));
	} catch (err) {
		next(err);
	}
}

export async function getGenres(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const doc = await scraper.scrapeDOM("/genre-category-list/");
		const data = parser.parseGenreCategories(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getOngoing(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const path = page !== "1" ? `/tag/on-going/page/${page}/` : "/tag/on-going/";
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseSearchResults(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimesByGenre(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const { genreId } = req.params;
		if (!genreId) throw new BadRequestError("Genre ID is required");
		const page = getPageFromQuery(req.query);
		const path = page !== "1" ? `/category/${genreId}/page/${page}/` : `/category/${genreId}/`;
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseAnimeByGenre(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}
