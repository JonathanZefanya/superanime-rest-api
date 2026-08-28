import type { Request, Response, NextFunction } from "express";
import { parse as safeParse, ValiError } from "valibot";
import * as schema from "../schemas/oploverz.js";
import * as scraper from "../scrapers/oploverz.js";
import * as parser from "../parsers/oploverz.js";
import { setPayload } from "../lib/response.js";
import { AppError, BadRequestError } from "../lib/errors.js";
import { paginateAnimeList } from "../lib/anime-list.js";
import { cachedAsync } from "../lib/async-cache.js";

function getPageFromQuery(query: Record<string, unknown>): string {
	try {
		return safeParse(schema.PageSchema, query.page);
	} catch {
		return "1";
	}
}

function getSearchQuery(query: Record<string, unknown>): string {
	try {
		return safeParse(schema.SearchSchema, String(query.q ?? ""));
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
			{ path: "/", description: "Home - popular & latest anime" },
			{ path: "/schedule", description: "Release schedule" },
			{ path: "/anime", description: "All anime (query: page)" },
			{ path: "/anime-list", description: "All anime grouped A-Z" },
			{ path: "/anime/:slug", description: "Anime details" },
			{ path: "/episode/:slug", description: "Episode details" },
			{ path: "/genre", description: "All genres" },
			{ path: "/genres/:genreId", description: "Anime by genre (query: page)" },
			{ path: "/search", description: "Search anime (query: q)" },
			{ path: "/ongoing", description: "Ongoing anime (query: page)" },
			{ path: "/completed", description: "Completed anime (query: page)" },
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

export async function getSchedule(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const doc = await scraper.scrapeDOM("/jadwal-rilis/");
		const data = parser.parseSchedules(doc);
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
		const qs = page && page !== "1" ? `?page=${page}` : "";
		const doc = await scraper.scrapeDOM(`/anime/${qs}`);
		const data = parser.parseAnimeByStatus(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
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
		const data = await cachedAsync("anime-list:oploverz", async () => {
			const doc = await scraper.scrapeDOM("/anime/list-mode/");
			return parser.parseAnimeList(doc);
		});
		res.json(setPayload(res, paginateAnimeList(data, req.query.initial, req.query.page)));
	} catch (err) {
		next(err);
	}
}

export async function getGenreList(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const doc = await scraper.scrapeDOM("/anime/list-mode/");
		const data = parser.parseGenreList(doc);
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
		const qs = `?status=Ongoing${page && page !== "1" ? `&page=${page}` : ""}`;
		const doc = await scraper.scrapeDOM(`/anime/${qs}`);
		const data = parser.parseAnimeByStatus(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

export async function getCompleted(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const qs = `?status=Completed${page && page !== "1" ? `&page=${page}` : ""}`;
		const doc = await scraper.scrapeDOM(`/anime/${qs}`);
		const data = parser.parseAnimeByStatus(doc);
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
		const doc = await scraper.scrapeDOM(`/anime/${slug}/`);
		const data = parser.parseAnimeDetails(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getEpisodeDetails(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const { slug } = req.params;
		const doc = await scraper.scrapeDOM(`/${slug}/`);
		const data = parser.parseEpisodeDetails(doc);
		res.json(setPayload(res, { data }));
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
		const page = getPageFromQuery(req.query);
		const path = `/genres/${genreId}/page/${page}`;
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseAnimeByGenre(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
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
		const doc = await scraper.scrapeDOM(`/?s=${encodeURIComponent(q)}`);
		const data = parser.parseAnimeByGenre(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}
