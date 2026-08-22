import type { HTMLElement } from "node-html-parser";
import { NotFoundError } from "../lib/errors.js";
import { Text, Id, Src, Num, Attr, AnimeSrc } from "./utils.js";
import type { Oploverz, Format, Quality, UrlLink, Synopsis, Pagination, Server } from "../types/index.js";
import { sources } from "../config/index.js";

const baseUrl = sources.oploverz.baseUrl;

function parseCard(el: HTMLElement): Oploverz.AnimeCard {
	const linkEl = el.querySelector("a");
	const titleEl = el.querySelector(".tt") || el.querySelector("h2");
	if (!titleEl) throw new NotFoundError("Card title not found");

	const genres: UrlLink[] = [];
	const genreLinks = el.querySelectorAll(".inf ul li:last-child a");
	for (const g of genreLinks) {
		genres.push({ title: Text(g), url: AnimeSrc(g, baseUrl) || "" });
	}

	return {
		title: Text(titleEl),
		slug: Id(linkEl || titleEl),
		poster: Src(el.querySelector("img.ts-post-image")),
		type: Text(el.querySelector(".typez")),
		episode: Text(el.querySelector("span.epx")),
		score: Text(el.querySelector(".upscore .scr")),
		status: Text(el.querySelector(".status")),
		genres,
		seriesUrl: AnimeSrc(linkEl, baseUrl),
		postId: Attr(el.querySelector("a.tip"), "rel"),
		sourceUrl: AnimeSrc(linkEl, baseUrl),
	};
}

export function parseHome(doc: HTMLElement): Oploverz.Home {
	const popular: Oploverz.AnimeCard[] = [];
	const latest: Oploverz.AnimeCard[] = [];
	const recommended: Oploverz.AnimeCard[] = [];

	const hothome = doc.querySelector(".releases.hothome");
	if (hothome) {
		let listupd = hothome.nextElementSibling;
		while (listupd && !listupd.classList?.contains?.("listupd")) {
			listupd = listupd.nextElementSibling;
		}
		if (listupd) {
			const items = listupd.querySelectorAll("article.bs");
			for (const el of items) {
				popular.push(parseCard(el));
			}
		}
	}

	const latesthome = doc.querySelector(".releases.latesthome");
	if (latesthome) {
		let listupd = latesthome.nextElementSibling;
		while (listupd && !listupd.classList?.contains?.("listupd")) {
			listupd = listupd.nextElementSibling;
		}
		if (listupd) {
			const items = listupd.querySelectorAll("article.stylesix");
			for (const el of items) {
				latest.push(parseCard(el));
			}
		}
	}

	if (!popular.length && !latest.length) {
		throw new NotFoundError("No anime found on home page");
	}

	return { popular, latest, recommended };
}

export function parseAnimeDetails(doc: HTMLElement): Oploverz.AnimeDetails {
	const titleEl = doc.querySelector("h1.entry-title");
	if (!titleEl) throw new NotFoundError("Anime detail title not found");

	const posterEl = doc.querySelector(".thumbook .thumb img");
	const ratingEl = doc.querySelector(".rating strong");

	const speSpans = doc.querySelectorAll(".spe span");
	let status = "";
	let type = "";
	for (const span of speSpans) {
		const t = Text(span);
		if (/^status:/i.test(t)) {
			const statusLink = span.querySelector("a");
			status = statusLink ? Text(statusLink) : t.replace(/^status:\s*/i, "").trim();
		} else if (/^type:/i.test(t)) {
			type = t.replace(/^type:\s*/i, "").trim();
		}
	}

	// href pada halaman Oploverz selalu absolut, jadi harus dicocokkan dengan
	// *= (mengandung), bukan ^= (diawali).
	const studio = Text(doc.querySelector('.spe a[href*="/studio/"]'));
	const season = Text(doc.querySelector('.spe a[href*="/season/"]'));

	const synopsisEls = doc.querySelectorAll("div.bixbox.synp .entry-content p");
	const paragraphList: string[] = [];
	for (const p of synopsisEls) {
		const t = Text(p);
		if (t) paragraphList.push(t);
	}

	const genreList: UrlLink[] = [];
	for (const g of doc.querySelectorAll('div.genxed a, .genxed a[href*="/genres/"]')) {
		const title = Text(g);
		if (title) genreList.push({ title, url: AnimeSrc(g, baseUrl) || "" });
	}

	const alternativeTitle = Text(doc.querySelector("span.alter"));

	const episodeList: Oploverz.EpisodeItem[] = [];
	const epItems = doc.querySelectorAll("div.eplister ul li");
	for (const li of epItems) {
		const epLink = li.querySelector("a");
		const epNum = Num(li, /episode\s*(\d+)/i);
		episodeList.push({
			episode: epNum,
			title: Text(li.querySelector(".epl-title") || li.querySelector(".title") || epLink),
			date: Text(li.querySelector(".epl-date") || li.querySelector(".date")),
			url: AnimeSrc(epLink, baseUrl) || "",
		});
	}

	return {
		title: Text(titleEl),
		poster: Src(posterEl),
		rating: Text(ratingEl),
		status,
		studio,
		season,
		type,
		synopsis: { paragraphList },
		genreList,
		episodeList,
		alternativeTitle,
	};
}

export function parseEpisodeDetails(doc: HTMLElement): Oploverz.EpisodeDetails {
	const titleEl = doc.querySelector("h1.entry-title");
	if (!titleEl) throw new NotFoundError("Episode title not found");

	const posterEl = doc.querySelector(".thumb img, .thumbook img, article img");
	const iframeEl = doc.querySelector("#pembed iframe") || doc.querySelector("#embed_holder iframe");
	const iframe = Src(iframeEl);

	const prevEl = doc.querySelector('.naveps .nvs a[rel="prev"]');
	const nextEl = doc.querySelector('.naveps .nvs a[rel="next"]');

	const downloadLinks: Format[] = [];
	const formatContainers = doc.querySelectorAll("div.mctnx div.soraddlx");
	for (const container of formatContainers) {
		const formatTitle = Text(container.querySelector("h3"));
		const qualityList: Quality[] = [];
		const qualityContainers = container.querySelectorAll(".soraurlx");
		for (const qc of qualityContainers) {
			const quality = Text(qc.querySelector("strong"));
			const urlList: UrlLink[] = [];
			const links = qc.querySelectorAll("a");
			for (const link of links) {
				urlList.push({ title: Text(link), url: AnimeSrc(link, baseUrl) || "" });
			}
			qualityList.push({ title: quality, size: "", urlList });
		}
		if (formatTitle) {
			downloadLinks.push({ title: formatTitle, qualityList });
		}
	}

	// Tautan "All Episodes" di blok navigasi adalah satu-satunya rujukan yang
	// pasti ke induk serinya. Mengambil `a[href*="/anime/"]` pertama pada
	// halaman justru mendapat tautan menu (mis. /anime/list-mode/).
	const seriesLink =
		doc.querySelector('.naveps .nvsc a') ??
		doc.querySelector('a[aria-label="All Episodes"]') ??
		doc.querySelector('a[href*="/anime/"]');
	const seriesUrl = AnimeSrc(seriesLink, baseUrl) || "";

	// Tiap <option> pada <select class="mirror"> memuat HTML iframe ter-encode
	// base64. Di-decode di sini supaya semua mirror bisa dipilih, bukan hanya
	// iframe bawaan yang tampil pertama kali.
	const serverList: Server[] = [];
	for (const option of doc.querySelectorAll("select.mirror option")) {
		const value = Attr(option, "value");
		if (!value) continue;

		const src = Buffer.from(value, "base64").toString("utf-8").match(/src="([^"]+)"/)?.[1];
		if (!src) continue;

		serverList.push({ title: Text(option) || "Server", serverId: src });
	}

	const epMatch = Text(titleEl).match(/episode\s*(\d+)/i);
	const episode = epMatch ? parseInt(epMatch[1], 10) : 0;

	return {
		title: Text(titleEl),
		episode,
		poster: Src(posterEl),
		iframe,
		navigation: {
			prev: prevEl ? (AnimeSrc(prevEl, baseUrl) ?? null) : null,
			next: nextEl ? (AnimeSrc(nextEl, baseUrl) ?? null) : null,
		},
		downloadLinks,
		seriesUrl,
		serverList,
	};
}

export function parseAnimeByGenre(doc: HTMLElement): Oploverz.AnimeCard[] {
	const items = doc.querySelectorAll("article.bs");
	if (!items.length) throw new NotFoundError("No anime found on this page");

	const result: Oploverz.AnimeCard[] = [];
	for (const el of items) {
		result.push(parseCard(el));
	}
	return result;
}

export function parsePagination(doc: HTMLElement): Pagination | null {
	const nav = doc.querySelector("div.pagination");
	if (!nav) return null;

	const links = nav.querySelectorAll("a");
	const currentEl = nav.querySelector(".current, span.current, a.current");

	let currentPage = 1;
	let totalPages = 1;
	let hasPrev = false;
	let hasNext = false;

	if (currentEl) {
		currentPage = parseInt(Text(currentEl), 10) || 1;
	}

	for (const link of links) {
		const text = Text(link);
		const cls = link.classNames || "";

		if (/prev/i.test(text) || cls.includes("prev")) hasPrev = true;
		if (/next/i.test(text) || cls.includes("next")) hasNext = true;

		const num = parseInt(text, 10);
		if (!isNaN(num) && num > totalPages) {
			totalPages = num;
		}
	}

	if (!hasPrev && !hasNext && totalPages <= 1) return null;

	return {
		currentPage,
		prevPage: hasPrev ? currentPage - 1 : null,
		nextPage: hasNext ? currentPage + 1 : null,
		totalPages,
		hasPrevPage: hasPrev,
		hasNextPage: hasNext,
	};
}

export function parseAnimeList(doc: HTMLElement): Oploverz.AnimeCollection[] {
	// `/anime/list-mode/` menaruh tiap inisial pada `.soralist .blix`, dengan
	// hurufnya di `span > a[name]` dan judulnya di `ul li a.series`.
	const letterContainers = doc.querySelectorAll(".soralist .blix");
	if (!letterContainers.length) throw new NotFoundError("No anime list found");

	const result: Oploverz.AnimeCollection[] = [];
	for (const container of letterContainers) {
		const initialEl = container.querySelector("span a, b");
		if (!initialEl) continue;

		const animeList: UrlLink[] = [];
		const linkEls = container.querySelectorAll("ul li a");
		for (const link of linkEls) {
			animeList.push({
				title: Text(link),
				url: AnimeSrc(link, baseUrl) || "",
			});
		}

		if (animeList.length) {
			result.push({ initial: Text(initialEl), animeList });
		}
	}

	if (!result.length) throw new NotFoundError("No anime list found");
	return result;
}

/**
 * Jadwal dikelompokkan per hari lewat blok `.bixbox.schedulepage.sch_<hari>`,
 * dengan nama hari pada `.releases h3`. Hari tanpa rilis tetap ada di halaman
 * tapi kosong, jadi dilewati.
 */
export function parseSchedules(doc: HTMLElement): Oploverz.ScheduleGroup[] {
	const sections = doc.querySelectorAll(".bixbox.schedulepage, .schedulepage");
	const result: Oploverz.ScheduleGroup[] = [];

	for (const section of sections) {
		const day = Text(section.querySelector(".releases h3, .releases h2, .releases span"));
		if (!day) continue;

		const animeList: Oploverz.AnimeCard[] = [];
		for (const el of section.querySelectorAll(".listupd .bs .bsx, .listupd .bsx")) {
			try {
				animeList.push(parseCard(el));
			} catch { /* lewati kartu tidak lengkap */ }
		}

		if (animeList.length) result.push({ day, animeList });
	}

	if (!result.length) throw new NotFoundError("No schedule data found");
	return result;
}

export function parseGenreList(doc: HTMLElement): Oploverz.GenreCard[] {
	const genreLinks = doc.querySelectorAll("ul.genres li a");
	if (genreLinks.length) {
		const result: Oploverz.GenreCard[] = [];
		for (const el of genreLinks) {
			result.push({
				title: Text(el),
				genreId: Id(el),
				sourceUrl: AnimeSrc(el, baseUrl),
			});
		}
		return result;
	}

	const genreInputs = doc.querySelectorAll('input[name="genre[]"]');
	if (genreInputs.length) {
		const result: Oploverz.GenreCard[] = [];
		const seen = new Set<string>();
		for (const input of genreInputs) {
			const val = Attr(input, "value");
			if (val && !seen.has(val)) {
				seen.add(val);
				const slug = val.toLowerCase().replace(/\s+/g, "-");
				result.push({
					title: val,
					genreId: slug,
					sourceUrl: `${baseUrl}/genres/${slug}/`,
				});
			}
		}
		if (result.length) return result;
	}

	const sidebarLinks = doc.querySelectorAll(".genres a, .genxed a[href*='/genres/']");
	if (sidebarLinks.length) {
		const result: Oploverz.GenreCard[] = [];
		const seen = new Set<string>();
		for (const el of sidebarLinks) {
			const id = Id(el);
			if (id && !seen.has(id)) {
				seen.add(id);
				result.push({
					title: Text(el),
					genreId: id,
					sourceUrl: AnimeSrc(el, baseUrl),
				});
			}
		}
		if (result.length) return result;
	}

	throw new NotFoundError("No genres found");
}

export function parseAnimeByStatus(doc: HTMLElement): Oploverz.AnimeCard[] {
	const items = doc.querySelectorAll("article.bs");
	if (!items.length) throw new NotFoundError("No anime found");

	const result: Oploverz.AnimeCard[] = [];
	for (const el of items) {
		result.push(parseCard(el));
	}
	return result;
}
