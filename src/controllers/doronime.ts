import type { Request, Response, NextFunction } from "express";
import { parse as safeParse } from "valibot";
import * as schema from "../schemas/doronime.js";
import * as scraper from "../scrapers/doronime.js";
import * as parser from "../parsers/doronime.js";
import { setPayload } from "../lib/response.js";
import { BadRequestError } from "../lib/errors.js";
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

/** `?page=1` dihilangkan supaya URL-nya sama persis dengan yang dipakai situs. */
function pageQuery(page: string, separator = "?"): string {
	return page && page !== "1" ? `${separator}page=${page}` : "";
}

export async function getRoutes(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const routes = [
			{ path: "/", description: "Home - latest anime (query: page)" },
			{ path: "/anime", description: "All anime (query: page)" },
			{ path: "/anime-list", description: "All anime grouped A-Z" },
			{ path: "/anime/:slug", description: "Anime details" },
			{ path: "/episode/:slug/:episode", description: "Episode download links" },
			{ path: "/movie", description: "Anime movie (query: page)" },
			{ path: "/batch", description: "Anime batch (query: page)" },
			{ path: "/search", description: "Search anime (query: q)" },
			{ path: "/schedule", description: "Release schedule grouped by translator" },
			{ path: "/genre", description: "Genre list" },
			{ path: "/genre/:genreId", description: "Anime by genre (query: page)" },
			{ path: "/download/:id", description: "Resolve a download link to its host URL" },
		];
		res.json(setPayload(res, { data: routes }));
	} catch (err) {
		next(err);
	}
}

/** Beranda Doronime sekaligus daftar anime berhalaman. */
export async function getAnimeList(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const doc = await scraper.scrapeDOM(`/${pageQuery(page)}`);
		const data = parser.parseAnimeCards(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
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
		res.json(setPayload(res, { data: { latest: parser.parseAnimeCards(doc) } }));
	} catch (err) {
		next(err);
	}
}

export async function getMovies(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const doc = await scraper.scrapeDOM(`/movie${pageQuery(page)}`);
		const data = parser.parseAnimeCards(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

export async function getBatches(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const page = getPageFromQuery(req.query);
		const doc = await scraper.scrapeDOM(`/batch${pageQuery(page)}`);
		const data = parser.parseAnimeCards(doc);
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
		const keyword = getSearchQuery(req.query);
		// Form pencarian Doronime memakai parameter `s`; `q` diterima tapi
		// diabaikan sehingga yang terkirim balik adalah daftar terbaru.
		const doc = await scraper.scrapeDOM(`/search?s=${encodeURIComponent(keyword)}`);
		res.json(setPayload(res, { data: parser.parseAnimeCards(doc) }));
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
		const { slug = "" } = req.params as Record<string, string>;
		const doc = await scraper.scrapeDOM(`/anime/${encodeURIComponent(slug)}`);
		res.json(setPayload(res, { data: parser.parseAnimeDetails(doc) }));
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
		const { slug = "", episode = "" } = req.params as Record<string, string>;
		const path = `/anime/${encodeURIComponent(slug)}/${encodeURIComponent(episode)}`;
		const doc = await scraper.scrapeDOM(path);
		res.json(setPayload(res, { data: parser.parseEpisodeDetails(doc) }));
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
		// `?view=list` mengabaikan paginasi dan mengirim seluruh katalog A-Z
		// sekaligus, jadi cukup satu permintaan.
		const data = await cachedAsync("anime-list:doronime", async () => {
			const doc = await scraper.scrapeDOM("/anime?view=list");
			return parser.parseAnimeCollections(doc);
		});
		const page = paginateAnimeList(data, req.query.initial, req.query.page);
		res.json(setPayload(res, page));
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
		const doc = await scraper.scrapeDOM("/schedule");
		res.json(setPayload(res, { data: parser.parseSchedule(doc) }));
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
		const doc = await scraper.scrapeDOM("/genre");
		res.json(setPayload(res, { data: parser.parseGenreList(doc) }));
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
		const { genreId = "" } = req.params as Record<string, string>;
		const page = getPageFromQuery(req.query);
		const path = `/genre/${encodeURIComponent(genreId)}${pageQuery(page)}`;
		const doc = await scraper.scrapeDOM(path);
		const data = parser.parseAnimeCards(doc);
		const pagination = parser.parsePagination(doc);
		res.json(setPayload(res, { data, pagination }));
	} catch (err) {
		next(err);
	}
}

/**
 * Selesaikan satu tautan unduhan menjadi URL host aslinya. Dipisah dari endpoint
 * episode karena tiap tautan butuh tiga permintaan ke Doronime; menyelesaikan
 * seluruh resolusi sekaligus akan membuat halaman episode jauh lebih lambat.
 */
export async function getDownloadUrl(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const { id = "" } = req.params as Record<string, string>;

		let payload: string;
		try {
			payload = safeParse(schema.DownloadIdSchema, id);
		} catch {
			throw new BadRequestError("Invalid download id");
		}

		const url = await scraper.scrapeDownloadUrl(payload);
		res.json(setPayload(res, { data: { url } }));
	} catch (err) {
		next(err);
	}
}
