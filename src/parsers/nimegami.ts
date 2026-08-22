import type { HTMLElement } from "node-html-parser";
import { NotFoundError } from "../lib/errors.js";
import { Text, Id, Src, Num, Attr, AnimeSrc } from "./utils.js";
import type { Nimegami, UrlLink, Format, Quality, Pagination } from "../types/index.js";
import { sources } from "../config/index.js";

const baseUrl = sources.nimegami.baseUrl;

function parseCard(el: HTMLElement): Nimegami.AnimeCard {
	const titleEl = el.querySelector('.info h2[itemprop="name"] a');
	if (!titleEl) throw new NotFoundError("Anime card title not found");

	const posterEl = el.querySelector(".thumb a img.attachment-post-thumbnail");

	const metaItems = el.querySelectorAll(".info ul li");
	let date = "";
	let episode = "";
	let studio = "";

	for (const item of metaItems) {
		const text = Text(item);
		if (/^Posted on/i.test(text)) {
			date = text.replace(/^Posted on/i, "").trim();
		} else if (/^Episode/i.test(text)) {
			episode = text.replace(/^Episode/i, "").trim();
		} else if (/^Studio/i.test(text)) {
			studio = text.replace(/^Studio/i, "").trim();
		}
	}

	const badgeLinks = el.querySelectorAll(".info .bot-post a");
	const categories: UrlLink[] = [];
	let status = "";
	let type = "";
	let isBatch = false;
	let isStreaming = false;

	for (const link of badgeLinks) {
		const href = Attr(link, "href") || "";
		const title = Text(link);
		if (href.includes("/category/")) {
			categories.push({ title, url: AnimeSrc(link, baseUrl) || "" });
		} else if (href.includes("/complete/")) {
			status = "Complete";
		} else if (title === "On-Going") {
			status = "On-Going";
		} else if (href.includes("/tag/batch")) {
			isBatch = true;
		} else if (href.includes("/type/")) {
			type = title;
		} else if (title.toLowerCase().includes("streaming")) {
			isStreaming = true;
		}
	}

	const ratingEl = el.querySelector(".info .top-post .rating");
	const rating = Text(ratingEl);

	return {
		title: Text(titleEl),
		slug: Id(titleEl),
		poster: Src(posterEl),
		rating,
		episode,
		studio,
		categories,
		status,
		type,
		isBatch,
		isStreaming,
		date,
		sourceUrl: AnimeSrc(titleEl, baseUrl),
	};
}

/**
 * Blok info pada halaman detail berbentuk tabel: `<td class="tablex">Label
 * <span>:</span></td><td>nilai</td>`. Dibaca sekali jadi peta label -> nilai.
 */
function parseInfoTable(doc: HTMLElement): Record<string, string> {
	const map: Record<string, string> = {};

	for (const row of doc.querySelectorAll(".info2 table tr, table tr")) {
		const cells = row.querySelectorAll("td");
		if (cells.length < 2) continue;

		const label = Text(cells[0]).replace(/\s*:\s*$/, "").trim().toLowerCase();
		if (!label) continue;

		map[label] ??= Text(cells[1]);
	}

	return map;
}

function pickInfo(map: Record<string, string>, ...labels: string[]): string {
	for (const label of labels) {
		const value = map[label];
		if (value && value !== "-") return value;
	}
	return "";
}

export function parseHome(doc: HTMLElement): Nimegami.Home {
	const latestCards: Nimegami.AnimeCard[] = [];
	const latestArticles = doc.querySelectorAll("div.post-article > article");
	for (const article of latestArticles) {
		try {
			latestCards.push(parseCard(article));
		} catch {
			// skip invalid cards
		}
	}

	const recommendedCards: Nimegami.AnimeCard[] = [];
	const recommendedArticles = doc.querySelectorAll("div.wrapper-2-a > article");
	for (const article of recommendedArticles) {
		try {
			recommendedCards.push(parseCard(article));
		} catch {
			// skip invalid cards
		}
	}

	if (!latestCards.length && !recommendedCards.length) {
		throw new NotFoundError("No anime found on home page");
	}

	return { latest: latestCards, recommended: recommendedCards };
}

export function parseAnimeList(doc: HTMLElement): Nimegami.AnimeCard[] {
	const articles = doc.querySelectorAll("div.post-article > article, section.post-article > article");
	if (!articles.length) throw new NotFoundError("No anime cards found");

	const result: Nimegami.AnimeCard[] = [];
	for (const article of articles) {
		try {
			result.push(parseCard(article));
		} catch {
			// skip invalid
		}
	}

	if (!result.length) throw new NotFoundError("No anime cards found");
	return result;
}

/**
 * Daftar episode ada sebagai `<li class="select-eps" data="<base64>"
 * id="play_eps_N" title="...">`. Atribut `data` memuat JSON berisi URL video
 * langsung per resolusi — tidak ada AJAX maupun token, jadi bisa dibaca utuh
 * dari halaman detail.
 */
function parseEpisodeEntries(
	doc: HTMLElement,
): { episode: number; title: string; sources: Nimegami.StreamSource[] }[] {
	const entries: { episode: number; title: string; sources: Nimegami.StreamSource[] }[] = [];

	for (const el of doc.querySelectorAll("li.select-eps, .select-eps")) {
		const raw = Attr(el, "data");
		if (!raw) continue;

		const id = Attr(el, "id");
		const episode = parseInt(id.replace(/\D/g, ""), 10);
		if (isNaN(episode)) continue;

		let sources: Nimegami.StreamSource[] = [];
		try {
			const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")) as {
				format?: string;
				url?: string[];
			}[];

			sources = decoded.flatMap((item) =>
				(item.url ?? []).map((url) => ({ format: item.format ?? "", url })),
			);
		} catch {
			continue;
		}

		if (!sources.length) continue;

		entries.push({
			episode,
			title: Attr(el, "title") || Text(el) || `Episode ${episode}`,
			sources,
		});
	}

	return entries.sort((a, b) => a.episode - b.episode);
}

/** Blok unduhan: `<h4>judul episode</h4><ul><li><strong>480p</strong><a>…` */
function parseDownloadBox(doc: HTMLElement): Format[] {
	const box = doc.querySelector(".download_box, #LinkDownload");
	if (!box) return [];

	const formats: Format[] = [];

	for (const header of box.querySelectorAll("h4")) {
		const qualityList: Quality[] = [];

		let sibling = header.nextElementSibling;
		while (sibling && sibling.rawTagName?.toLowerCase() !== "h4") {
			for (const item of sibling.querySelectorAll("li")) {
				const strongEl = item.querySelector("strong");
				const urlList: UrlLink[] = [];

				for (const link of item.querySelectorAll("a")) {
					const url = Attr(link, "href");
					if (url) urlList.push({ title: Text(link).trim(), url });
				}

				if (!urlList.length) continue;

				const text = Text(item);
				qualityList.push({
					title: strongEl ? Text(strongEl) : text.split(/\s/)[0] ?? text,
					size: text.match(/([\d.]+)\s*(Mb|MB|GB|KB)/i)?.[0] ?? "",
					urlList,
				});
			}

			sibling = sibling.nextElementSibling;
		}

		if (qualityList.length) {
			formats.push({ title: Text(header), qualityList });
		}
	}

	return formats;
}

export function parseAnimeDetails(doc: HTMLElement): Nimegami.AnimeDetails {
	const info = parseInfoTable(doc);

	const headingEl = doc.querySelector("h1.title, h1");
	const title = pickInfo(info, "judul") || Text(headingEl);
	if (!title) throw new NotFoundError("Anime detail title not found");

	const posterEl = doc.querySelector(
		".coverthumbnail img, .thumbnail img, .video-streaming img",
	);

	const categories: UrlLink[] = [];
	for (const link of doc.querySelectorAll("td.info_a a")) {
		categories.push({ title: Text(link), url: Attr(link, "href") });
	}

	const synopsisParts: string[] = [];
	for (const p of doc.querySelectorAll("#Sinopsis p, .content#Sinopsis p")) {
		const t = Text(p);
		if (t) synopsisParts.push(t);
	}

	const episodeList: Nimegami.EpisodeItem[] = parseEpisodeEntries(doc).map((entry) => ({
		episode: entry.episode,
		title: entry.title,
		url: "",
	}));

	return {
		title,
		alternativeTitle: pickInfo(info, "judul alternatif"),
		poster: Src(posterEl),
		rating: pickInfo(info, "rating"),
		studio: pickInfo(info, "studio"),
		season: pickInfo(info, "musim / rilis", "musim", "rilis"),
		type: pickInfo(info, "type", "tipe"),
		series: pickInfo(info, "series"),
		categories,
		credit: pickInfo(info, "credit"),
		synopsis: synopsisParts.join("\n\n"),
		duration: pickInfo(info, "durasi per episode", "durasi"),
		downloadLinks: parseDownloadBox(doc),
		episodeList,
	};
}

/**
 * Nimegami tidak punya halaman episode terpisah — semuanya ada di halaman
 * anime. Detail episode disusun dari entri yang cocok pada halaman itu.
 */
export function parseEpisodeDetails(
	doc: HTMLElement,
	animeSlug: string,
	episodeNumber: number,
): Nimegami.EpisodeDetails {
	const entries = parseEpisodeEntries(doc);
	if (!entries.length) throw new NotFoundError("No streamable episode found");

	const index = entries.findIndex((entry) => entry.episode === episodeNumber);
	if (index === -1) throw new NotFoundError(`Episode ${episodeNumber} not found`);

	const entry = entries[index];
	const posterEl = doc.querySelector(".coverthumbnail img, .thumbnail img");

	// Unduhan dikelompokkan per episode lewat judul `<h4>`; ambil yang cocok.
	const episodePattern = new RegExp(`episode\\s*0*${episodeNumber}\\b`, "i");
	const allFormats = parseDownloadBox(doc);
	const matched = allFormats.filter((format) => episodePattern.test(format.title));

	return {
		title: entry.title,
		episode: entry.episode,
		poster: Src(posterEl),
		animeSlug,
		streamSources: entry.sources,
		downloadLinks: matched.length ? matched : allFormats,
		navigation: {
			prev: index > 0 ? entries[index - 1].episode : null,
			next: index < entries.length - 1 ? entries[index + 1].episode : null,
		},
	};
}

function parseSearchCard(el: HTMLElement): Nimegami.AnimeCard {
	const titleEl = el.querySelector('h2[itemprop="name"] a');
	if (!titleEl) throw new NotFoundError("Search card title not found");

	const posterEl = el.querySelector(".thumbnail a img");
	const ratingEl = el.querySelector(".rating-archive");
	const epsEl = el.querySelector(".eps-archive");

	const statusEl = el.querySelector(".term_tag-a a");
	const categories: UrlLink[] = [];
	let type = "";
	const tagLinks = el.querySelectorAll(".terms_tag a");
	for (const link of tagLinks) {
		const href = Attr(link, "href") || "";
		if (href.includes("/type/")) {
			type = Text(link);
		}
	}

	return {
		title: Text(titleEl),
		slug: Id(titleEl),
		poster: Src(posterEl),
		rating: Text(ratingEl),
		episode: Text(epsEl).replace(/^Ep\.?\s*/i, ""),
		studio: "",
		categories,
		status: Text(statusEl),
		type,
		isBatch: false,
		isStreaming: false,
		sourceUrl: AnimeSrc(titleEl, baseUrl),
		date: "",
	};
}

export function parseSearchResults(doc: HTMLElement): Nimegami.AnimeCard[] {
	const articles = doc.querySelectorAll("article");
	if (!articles.length) throw new NotFoundError("No search results found");

	const result: Nimegami.AnimeCard[] = [];
	for (const article of articles) {
		try {
			result.push(parseSearchCard(article));
		} catch {
			// skip invalid
		}
	}

	if (!result.length) throw new NotFoundError("No search results found");
	return result;
}

export function parsePagination(doc: HTMLElement): Pagination | null {
	const nav = doc.querySelector("ul.pagination");
	if (!nav) return null;

	const items = nav.querySelectorAll("li");
	if (!items.length) return null;

	let currentPage = 1;
	let totalPages = 1;
	let hasPrev = false;
	let hasNext = false;

	for (const item of items) {
		const cls = item.classNames || "";
		const span = item.querySelector("span.page-numbers");
		const link = item.querySelector("a.page-numbers");
		const text = link ? Text(link) : span ? Text(span) : Text(item);
		const href = link ? Attr(link, "href") : "";

		if (cls.includes("active")) {
			const num = parseInt(text, 10);
			if (!isNaN(num)) currentPage = num;
		}

		if (/prev/i.test(text) || cls.includes("prev")) {
			hasPrev = !!href;
		}

		if (/next/i.test(text) || cls.includes("next")) {
			hasNext = !!href;
		}

		const num = parseInt(text, 10);
		if (!isNaN(num) && num > totalPages) {
			totalPages = num;
		}
	}

	if (hasPrev || hasNext || totalPages > 1) {
		return {
			currentPage,
			prevPage: hasPrev ? currentPage - 1 : null,
			nextPage: hasNext ? currentPage + 1 : null,
			totalPages,
			hasPrevPage: hasPrev,
			hasNextPage: hasNext,
		};
	}

	return null;
}

function parseTerbaruCard(el: HTMLElement): Nimegami.AnimeCard {
	const titleLink = el.querySelector("h3 a");
	if (!titleLink) throw new NotFoundError("Terbaru card title not found");

	const posterEl = el.querySelector(".thumb a img");
	const epsEl = el.querySelector(".eps_ongo");
	const catEl = el.querySelector(".live-action-live a");
	const descEl = el.querySelector(".snippet p");

	const categories: UrlLink[] = [];
	if (catEl) {
		categories.push({
			title: Text(catEl),
			url: Attr(catEl, "href") || "",
		});
	}

	return {
		title: Text(titleLink),
		slug: Id(titleLink),
		poster: Src(posterEl),
		rating: "",
		episode: Text(epsEl).replace(/^Eps\.?\s*/i, ""),
		studio: "",
		categories,
		status: "",
		type: "",
		isBatch: false,
		isStreaming: false,
		sourceUrl: AnimeSrc(titleLink, baseUrl),
		date: "",
	};
}

export function parseScheduleOrOngoing(doc: HTMLElement): Nimegami.AnimeCard[] {
	// Try homepage card format first
	const articles = doc.querySelectorAll("div.post-article > article");
	if (articles.length) {
		const result: Nimegami.AnimeCard[] = [];
		for (const article of articles) {
			try { result.push(parseCard(article)); } catch { /* skip */ }
		}
		if (result.length) return result;
	}

	// Try all article elements with terbaru format
	const allArticles = doc.querySelectorAll("article");
	const result: Nimegami.AnimeCard[] = [];
	for (const article of allArticles) {
		try { result.push(parseTerbaruCard(article)); } catch {
			try { result.push(parseSearchCard(article)); } catch { /* skip */ }
		}
	}
	if (!result.length) throw new NotFoundError("No schedule/ongoing items found");
	return result;
}

/**
 * Halaman `/anime-terbaru-sub-indo/` mengelompokkan rilisan per hari lewat
 * `div.wrapper-3` yang `id`-nya adalah nama hari (senin…minggu). Blok teratas
 * memakai hari berjalan, jadi hari yang sama bisa muncul dua kali dan digabung.
 */
export function parseScheduleGroups(doc: HTMLElement): Nimegami.ScheduleGroup[] {
	const groups = new Map<string, Nimegami.AnimeCard[]>();

	for (const section of doc.querySelectorAll("div.wrapper-3")) {
		const day = (Attr(section, "id") || "").toLowerCase();
		if (!day) continue;

		const animeList = groups.get(day) ?? [];
		for (const article of section.querySelectorAll("article")) {
			try {
				animeList.push(parseTerbaruCard(article));
			} catch {
				/* kartu tanpa judul dilewati */
			}
		}

		if (animeList.length) groups.set(day, animeList);
	}

	if (!groups.size) throw new NotFoundError("No schedule groups found");

	// Blok teratas memakai hari berjalan, jadi urutan di halaman tidak dimulai
	// dari Senin. Diurutkan ulang supaya jadwalnya terbaca normal.
	const order = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];

	return [...groups]
		.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
		.map(([day, animeList]) => ({
			day: day.charAt(0).toUpperCase() + day.slice(1),
			animeList,
		}));
}

/**
 * Daftar A-Z pada `/anime-list/`: tiap `div.lettergroup` berisi satu inisial
 * (`.letter-cell a`) dan seluruh judul yang diawalinya.
 */
export function parseAnimeCollections(doc: HTMLElement): Nimegami.AnimeCollection[] {
	const result: Nimegami.AnimeCollection[] = [];

	for (const group of doc.querySelectorAll("div.lettergroup")) {
		const initialEl = group.querySelector(".letter-cell a");
		if (!initialEl) continue;

		const animeList: UrlLink[] = [];
		for (const link of group.querySelectorAll("ul li a")) {
			// Teks tautan menempel status ("Judul (Complete)") pada sebuah <span>.
			// Atribut `title` lebih bersih, tapi rusak untuk judul yang memuat
			// tanda kutip — jadi status di ujung teks tetap dibuang manual.
			const status = Text(link.querySelector("span"));
			const raw = Attr(link, "title") || Text(link);
			const title = status
				? raw.replace(new RegExp(`\\s*\\(\\s*${status}\\s*\\)\\s*$`, "i"), "").trim()
				: raw.trim();

			const url = AnimeSrc(link, baseUrl) || "";
			if (title && url) animeList.push({ title, url });
		}

		if (animeList.length) result.push({ initial: Text(initialEl), animeList });
	}

	if (!result.length) throw new NotFoundError("No anime list found");

	return result;
}

export function parseGenreCategories(doc: HTMLElement): UrlLink[] {
	const links = doc.querySelectorAll('a[href*="/category/"]');
	const seen = new Set<string>();
	const result: UrlLink[] = [];

	for (const link of links) {
		const href = Attr(link, "href") || "";
		const title = Text(link);
		if (title && href && !seen.has(href)) {
			seen.add(href);
			result.push({ title, url: href });
		}
	}

	if (!result.length) throw new NotFoundError("No genre categories found");
	return result;
}

export function parseAnimeByGenre(doc: HTMLElement): Nimegami.AnimeCard[] {
	const articles = doc.querySelectorAll("article");
	if (!articles.length) throw new NotFoundError("No anime found for this genre");

	const result: Nimegami.AnimeCard[] = [];
	for (const article of articles) {
		try { result.push(parseCard(article)); } catch {
			try { result.push(parseSearchCard(article)); } catch { /* skip */ }
		}
	}

	if (!result.length) throw new NotFoundError("No anime found for this genre");
	return result;
}
