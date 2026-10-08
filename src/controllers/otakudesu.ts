import type { Request, Response, NextFunction } from "express";
import { parse as safeParse, ValiError } from "valibot";
import * as schema from "../schemas/otakudesu.js";
import * as scraper from "../scrapers/otakudesu.js";
import * as parser from "../parsers/otakudesu.js";
import { setPayload } from "../lib/response.js";
import { AppError, BadGatewayError, BadRequestError } from "../lib/errors.js";
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
		return safeParse(schema.SearchSchema, query.q);
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
			{ path: "/", description: "Home - ongoing & completed anime" },
			{ path: "/jadwal", description: "Schedule" },
			{ path: "/anime", description: "All anime list" },
			{ path: "/genre", description: "All genres" },
			{ path: "/ongoing", description: "Ongoing anime (query: page)" },
			{ path: "/completed", description: "Completed anime (query: page)" },
			{ path: "/search", description: "Search anime (query: q)" },
			{ path: "/genre/:genreId", description: "Anime by genre (query: page)" },
			{ path: "/anime/:animeId", description: "Anime details" },
			{ path: "/episode/:episodeId", description: "Episode details" },
			{ path: "/batch/:batchId", description: "Batch details" },
			{ path: "/server/:serverId", description: "Server stream details" },
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

export async function getAnimes(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const data = await cachedAsync("anime-list:otakudesu", async () => {
			try {
				return parser.parseAllAnimes(await scraper.scrapeDOM("/anime-list/", undefined, true));
			} catch {
				return parser.parseAllAnimes(await scraper.scrapeDOM("/anime?view=list", undefined, true));
			}
		});
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
		const doc = await scraper.scrapeDOM("/genre-list/");
		const data = parser.parseAllGenres(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getOngoingAnimes(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const path = `/ongoing-anime/${page ? `page/${page}/` : ""}`;
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseOngoingAnimes(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

export async function getCompletedAnimes(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const path = `/complete-anime/${page ? `page/${page}/` : ""}`;
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseCompletedAnimes(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

const SEARCH_PAGE_SIZE = 15;
const SEARCH_MAX_PAGES = 10;

export async function searchAnimes(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const q = getSearchQuery(req.query);
		const search = `?s=${encodeURIComponent(q)}&post_type=anime`;
		const data = parser.parseSearchedAnimes(await scraper.scrapeDOM(search));
		const seen = new Set(data.map((a) => a.animeId));

		// Otakudesu membatasi 15 hasil per halaman; halaman berikutnya ada di /page/N/.
		for (let page = 2; page <= SEARCH_MAX_PAGES && data.length >= (page - 1) * SEARCH_PAGE_SIZE; page++) {
			let items: typeof data;
			try {
				items = parser.parseSearchedAnimes(await scraper.scrapeDOM(`/page/${page}/${search}`));
			} catch {
				break;
			}
			for (const item of items) {
				if (seen.has(item.animeId)) continue;
				seen.add(item.animeId);
				data.push(item);
			}
			if (items.length < SEARCH_PAGE_SIZE) break;
		}

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
		// Otakudesu memakai bentuk jamak `/genres/` dan menuntut trailing slash;
		// tanpa itu server membalas 301 dan fetch gagal.
		const path = `/genres/${genreId}/page/${page}/`;
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseAnimesByGenre(doc);
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
		const { animeId } = req.params;
		const doc = await scraper.scrapeDOM(`/anime/${animeId}`);
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
		const { episodeId } = req.params;
		const doc = await scraper.scrapeDOM(`/episode/${episodeId}`);
		const data = parser.parseEpisodeDetails(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getBatchDetails(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const { batchId } = req.params;
		const doc = await scraper.scrapeDOM(`/batch/${batchId}`);
		const data = parser.parseBatchDetails(doc);
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getServerDetails(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const { serverId } = req.params;

		// serverId adalah `data-content` dari halaman episode: base64 dari
		// `{"id":<postId>,"i":<mirrorIndex>,"q":"<kualitas>"}`.
		let decoded: { id: number | string; i: number | string; q: string };
		try {
			const json = Buffer.from(String(serverId), "base64").toString("utf-8");
			decoded = JSON.parse(json);
		} catch {
			throw new BadRequestError("Invalid server ID format");
		}

		if (decoded?.id === undefined || decoded?.i === undefined) {
			throw new BadRequestError("Invalid server payload");
		}

		const body = {
			id: String(decoded.id),
			i: String(decoded.i),
			q: String(decoded.q ?? ""),
		};

		const nonce = await scraper.scrapeNonce();
		const content = await scraper.scrapeServer({ ...body, nonce });

		const match = content.match(/src=["']([^"']+)["']/i);
		const url = match ? match[1] : "";

		if (!url) {
			throw new BadGatewayError("Server stream URL not found");
		}

		const data = { title: `Server ${body.q || decoded.id}`, url };
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}
