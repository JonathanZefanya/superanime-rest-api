import type { Request, Response, NextFunction } from "express";
import * as scraper from "../scrapers/ylnime.js";
import * as parser from "../parsers/ylnime.js";
import { setPayload } from "../lib/response.js";
import { BadGatewayError, BadRequestError, NotFoundError } from "../lib/errors.js";
import { paginateAnimeList } from "../lib/anime-list.js";
import type { YLnime } from "../types/index.js";

function getPage(query: Record<string, unknown>): number {
	const page = Number.parseInt(String(query.page ?? "1"), 10);
	return Number.isFinite(page) && page > 0 ? page : 1;
}

function pageSuffix(page: number): string {
	return page > 1 ? `&page=${page}` : "";
}

const ONGOING_PAGE_SIZE = 18;
const RESOLUTIONS =["1080p", "720p", "480p", "360p"];
const resoValue = (reso: string): number => Number.parseInt(reso, 10) || 0;

export async function getRoutes(req: Request, res: Response, next: NextFunction) {
	try {
		const routes = [
			{ path: "/schedule", description: "Release schedule" },
			{ path: "/anime-list", description: "Anime A-Z (query: initial, page)" },
			{ path: "/anime/:slug", description: "Anime details" },
			{ path: "/episode/:slug", description: "Episode details" },
			{ path: "/genre", description: "All genres" },
			{ path: "/genres/:genreId", description: "Anime by genre (query: page)" },
			{ path: "/search", description: "Search anime (query: q)" },
			{ path: "/ongoing", description: "Ongoing anime" },
			{ path: "/completed", description: "Completed anime (query: page)" },
		];
		res.json(setPayload(res, { data: routes }));
	} catch (err) {
		next(err);
	}
}

export async function getOngoing(req: Request, res: Response, next: NextFunction) {
	try {
		// YLnime menampilkan semua judul ongoing di satu halaman; dipecah di sini.
		const cards = parser.parseCards(await scraper.scrapeDOM("ongoing.php"));
		const totalPages = Math.max(1, Math.ceil(cards.length / ONGOING_PAGE_SIZE));
		const page = Math.min(getPage(req.query), totalPages);
		const start = (page - 1) * ONGOING_PAGE_SIZE;

		res.json(
			setPayload(res, {
				data: cards.slice(start, start + ONGOING_PAGE_SIZE),
				pagination: {
					currentPage: page,
					prevPage: page > 1 ? page - 1 : null,
					nextPage: page < totalPages ? page + 1 : null,
					totalPages,
					hasPrevPage: page > 1,
					hasNextPage: page < totalPages,
				},
			}),
		);
	} catch (err) {
		next(err);
	}
}

export async function getCompleted(req: Request, res: Response, next: NextFunction) {
	try {
		const page = getPage(req.query);
		const doc = await scraper.scrapeDOM(page > 1 ? `completed.php?page=${page}` : "completed.php");
		res.json(setPayload(res, { data: parser.parseCards(doc), pagination: parser.parsePagination(doc, page) }));
	} catch (err) {
		next(err);
	}
}

export async function getSchedule(req: Request, res: Response, next: NextFunction) {
	try {
		const data = parser.parseSchedule(await scraper.scrapeDOM("jadwals.php"));
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimeCollections(req: Request, res: Response, next: NextFunction) {
	try {
		const initial = typeof req.query.initial === "string" ? req.query.initial.trim().toUpperCase() : "";
		if (!/^([A-Z]|#)$/.test(initial)) throw new BadRequestError("Query 'initial' must be # or A-Z");

		const doc = await scraper.scrapeDOM(`anime-list.php?l=${encodeURIComponent(initial)}`);
		let cards: YLnime.AnimeCard[] = [];
		try {
			cards = parser.parseCards(doc);
		} catch (err) {
			if (!(err instanceof NotFoundError)) throw err;
		}

		const animeList = cards.map((card) => ({ title: card.title, slug: card.slug, url: card.sourceUrl }));
		res.json(setPayload(res, paginateAnimeList([{ initial, animeList }], initial, req.query.page)));
	} catch (err) {
		next(err);
	}
}

export async function getGenreList(req: Request, res: Response, next: NextFunction) {
	try {
		const data = parser.parseGenres(await scraper.scrapeDOM("genre.php"));
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimesByGenre(req: Request, res: Response, next: NextFunction) {
	try {
		const genreId = String(req.params.genreId ?? "").trim();
		if (!genreId) throw new BadRequestError("Genre is required");

		const page = getPage(req.query);
		const doc = await scraper.scrapeDOM(`genre.php?g=${encodeURIComponent(genreId)}${pageSuffix(page)}`);
		res.json(setPayload(res, { data: parser.parseCards(doc), pagination: parser.parsePagination(doc, page) }));
	} catch (err) {
		next(err);
	}
}

export async function searchAnimes(req: Request, res: Response, next: NextFunction) {
	try {
		const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
		if (!q || q.length > 50) throw new BadRequestError("Invalid search query");

		const data = parser.parseCards(await scraper.scrapeDOM(`index.php?search=${encodeURIComponent(q)}`));
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}

export async function getAnimeDetails(req: Request, res: Response, next: NextFunction) {
	try {
		const slug = parser.fromSeriesToken(String(req.params.slug ?? "").trim());
		if (!slug) throw new BadRequestError("Anime slug is required");

		const doc = await scraper.scrapeDOM(`index.php?series=${encodeURIComponent(slug)}`);
		res.json(setPayload(res, { data: parser.parseAnimeDetails(doc, slug) }));
	} catch (err) {
		next(err);
	}
}

export async function getEpisodeDetails(req: Request, res: Response, next: NextFunction) {
	try {
		const { episodeId, seriesSlug } = parser.fromEpisodeToken(String(req.params.slug ?? "").trim());
		if (!episodeId || !seriesSlug) throw new BadRequestError("Invalid episode slug");

		// Endpoint JSON hanya mengembalikan satu resolusi per permintaan, dan
		// resolusi yang tidak ada dialihkan ke resolusi lain (`reso_dipakai`).
		const [doc, ...results] = await Promise.all([
			scraper.scrapeDOM(
				`index.php?series=${encodeURIComponent(seriesSlug)}&episode=${encodeURIComponent(episodeId)}`,
			),
			...RESOLUTIONS.map((reso) =>
				scraper.scrapeEpisodeJson(episodeId, seriesSlug, reso).catch(() => null),
			),
		]);
		const page = parser.parseEpisodePage(doc, seriesSlug);

		const responses = results.filter(
			(result, index): result is YLnime.EpisodeJson =>
				Boolean(result?.ok) && result?.reso_dipakai === RESOLUTIONS[index],
		);
		const first = responses[0] ?? results.find((result) => result?.ok) ?? null;
		if (!first) throw new BadGatewayError("YLnime returned no streams for this episode");

		const seen = new Set<string>();
		const streams = responses
			.flatMap((response) => response.streams ?? [])
			.filter((stream) => !seen.has(stream.link) && Boolean(seen.add(stream.link)))
			.sort((a, b) => resoValue(a.reso) - resoValue(b.reso));

		const serverList = parser.toServers(streams);
		const defaultServer = serverList.at(-1);

		const data: YLnime.EpisodeDetails = {
			title: page.title,
			animeTitle: page.animeTitle,
			animeSlug: page.animeSlug,
			navigation: {
				prev: first.prev_ep ? parser.toEpisodeToken(first.prev_ep, seriesSlug) : null,
				next: first.next_ep ? parser.toEpisodeToken(first.next_ep, seriesSlug) : null,
			},
			serverList,
			defaultStreaming: defaultServer?.serverId ?? "",
			sourceUrl: `${parser.seriesUrl(seriesSlug)}&episode=${encodeURIComponent(episodeId)}`,
		};
		res.json(setPayload(res, { data }));
	} catch (err) {
		next(err);
	}
}
