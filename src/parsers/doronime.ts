import type { HTMLElement } from "node-html-parser";
import { NotFoundError } from "../lib/errors.js";
import { Text, Id, Src, Attr, AnimeSrc } from "./utils.js";
import type { Doronime, Format, Quality, UrlLink, Pagination } from "../types/index.js";
import { sources } from "../config/index.js";

const baseUrl = sources.doronime.baseUrl;

/** Ambil nomor episode dari slug `…/episode-07` atau dari judulnya. */
function episodeNumber(value: string): number {
	const match = value.match(/episode[-\s]*0*(\d+)/i);
	return match ? parseInt(match[1], 10) : 0;
}

function parseCard(el: HTMLElement): Doronime.AnimeCard {
	// Beranda dan hasil pencarian memakai `<a class="Card">`, sedangkan movie dan
	// batch memakai `<div class="Card">` yang membungkus beberapa `<a>`.
	const link = el.tagName === "A" ? el : el.querySelector("a");
	const title = Attr(link, "title") || Text(el.querySelector(".Card__caption"));
	if (!link || !title) throw new NotFoundError("Anime card title not found");

	// Badge tidak diberi kelas pembeda; posisinya yang menentukan artinya:
	// kiri-atas status, kiri-bawah tipe, kanan skor.
	const badge = (selector: string) => Text(el.querySelector(`${selector} .Badge`));

	// Kartu movie dan batch menunjuk ke `/anime/<seri>/<movie|bd-batch>`, jadi
	// segmen terakhir bukan slug serinya. Yang dipakai selalu segmen setelah
	// `/anime/` supaya kartu apa pun mengarah ke halaman detail yang benar.
	const slug = Attr(link, "href").match(/\/anime\/([^/?#]+)/)?.[1] ?? Id(link);

	return {
		title,
		slug,
		poster: Src(el.querySelector(".Card__image img")),
		status: badge(".Card__badge:not(.Card__badge--bottom):not(.Card__badge--right)"),
		type: badge(".Card__badge--bottom"),
		score: badge(".Card__badge--right"),
		sourceUrl: AnimeSrc(link, baseUrl),
	};
}

/** Kartu anime pada beranda, hasil pencarian, movie, dan batch. */
export function parseAnimeCards(doc: HTMLElement): Doronime.AnimeCard[] {
	const result: Doronime.AnimeCard[] = [];

	for (const card of doc.querySelectorAll(".Card")) {
		// Bagian OST memakai kartu yang sama tapi menunjuk ke `/ost/…`.
		const href = Attr(card, "href") || Attr(card.querySelector("a"), "href");
		if (!/\/anime\//.test(href)) continue;

		try {
			result.push(parseCard(card));
		} catch {
			/* kartu tanpa judul dilewati */
		}
	}

	if (!result.length) throw new NotFoundError("No anime found");

	return result;
}

export function parsePagination(doc: HTMLElement): Pagination | null {
	// Halaman memuat beberapa blok paginasi (anime dan OST); yang pertama
	// selalu milik daftar utama.
	const nav = doc.querySelector(".Pagination");
	if (!nav) return null;

	const pageOf = (href: string) => parseInt(href.match(/[?&]page=(\d+)/)?.[1] ?? "", 10);

	let totalPages = 1;
	let nextPage: number | null = null;

	for (const link of nav.querySelectorAll("a")) {
		const page = pageOf(Attr(link, "href"));
		if (isNaN(page)) continue;

		if (/next/i.test(Text(link))) {
			nextPage = page;
		} else if (page > totalPages) {
			totalPages = page;
		}
	}

	const active = nav.querySelector(".page-item.active, .Pagination__page-item.active");
	const currentPage = parseInt(Text(active), 10) || (nextPage ? nextPage - 1 : 1);

	return {
		currentPage,
		prevPage: currentPage > 1 ? currentPage - 1 : null,
		nextPage: currentPage < totalPages ? currentPage + 1 : null,
		totalPages,
		hasPrevPage: currentPage > 1,
		hasNextPage: currentPage < totalPages,
	};
}

/** Metadata pada halaman detail berbentuk daftar "Label: nilai". */
function parseCaption(doc: HTMLElement): Record<string, string> {
	const info: Record<string, string> = {};

	for (const item of doc.querySelectorAll(".Content__header-caption-item")) {
		const raw = Text(item).replace(/\s+/g, " ");
		const separator = raw.indexOf(":");
		if (separator < 0) continue;

		info[raw.slice(0, separator).trim().toLowerCase()] = raw.slice(separator + 1).trim();
	}

	return info;
}

function parseTabBody(doc: HTMLElement, heading: RegExp): HTMLElement | null {
	for (const tab of doc.querySelectorAll(".Content__tabs")) {
		if (heading.test(Text(tab.querySelector(".Content__tabs-header")))) {
			return tab.querySelector(".Content__tabs-body");
		}
	}

	return null;
}

/** Tabel episode; ada di halaman detail maupun halaman episode. */
function parseEpisodeTable(doc: HTMLElement): Doronime.EpisodeItem[] {
	const result: Doronime.EpisodeItem[] = [];

	for (const row of doc.querySelectorAll(".Content__table-body")) {
		const columns = row.querySelectorAll(".col, .col-9");
		const link = row.querySelector("a");
		const url = AnimeSrc(link, baseUrl) || "";
		if (!url) continue;

		result.push({
			episode: episodeNumber(url) || episodeNumber(Text(link)),
			title: Text(columns[1]) || Text(link),
			date: Text(columns[2]),
			url,
		});
	}

	return result;
}

export function parseAnimeDetails(doc: HTMLElement): Doronime.AnimeDetails {
	const titleEl = doc.querySelector(".Content__title");
	if (!titleEl) throw new NotFoundError("Anime title not found");

	const info = parseCaption(doc);

	const genreList: UrlLink[] = [];
	for (const item of doc.querySelectorAll(".Content__header-caption-item")) {
		if (!/^genre/i.test(Text(item))) continue;

		for (const link of item.querySelectorAll("a")) {
			genreList.push({ title: Text(link), url: AnimeSrc(link, baseUrl) || "" });
		}
	}

	return {
		// Semua judul berakhiran "Subtitle Indonesia"; imbuhan itu dibuang.
		title: Text(titleEl).replace(/\s*Subtitle Indonesia\s*$/i, "").trim(),
		poster: Src(doc.querySelector(".Content__header-image img")),
		romaji: info["romaji"] ?? "",
		english: info["english"] ?? "",
		alternativeTitle: info["alternatif"] ?? "",
		status: info["status"] ?? "",
		duration: info["durasi"] ?? "",
		genreList,
		season: info["season"] ?? "",
		producer: info["produser"] ?? "",
		studio: info["studio"] ?? "",
		releaseDate: info["tanggal tayang"] ?? "",
		totalEpisode: info["total episode"] ?? "",
		score: info["skor mal"] ?? "",
		synopsis: Text(parseTabBody(doc, /sinopsis/i)),
		episodeList: parseEpisodeTable(doc),
	};
}

/**
 * Blok unduhan: `.Download__title` menyebut format (mis. H.264), lalu tiap
 * `.Download__group` memuat satu resolusi dengan beberapa host. Host yang mati
 * ditulis sebagai `<del>` tanpa tautan, jadi tidak ikut diambil.
 *
 * Tautannya sendiri masih berupa `/download?id=…` — halaman perantara Doronime.
 * URL host aslinya baru muncul setelah melewati safelink (lihat scraper).
 */
function parseDownloadLinks(doc: HTMLElement): Format[] {
	const container = doc.querySelector("#contentLink");
	if (!container) return [];

	const formats: Format[] = [];
	let current: Format | null = null;

	for (const node of container.querySelectorAll(".Download__title, .Download__group")) {
		if ((node.classNames || "").includes("Download__title")) {
			current = { title: Text(node), qualityList: [] };
			formats.push(current);
			continue;
		}

		const urlList: UrlLink[] = [];
		for (const link of node.querySelectorAll(".Download__link a")) {
			const url = AnimeSrc(link, baseUrl) || "";
			// Nama host ditulis dua kali — versi lebar dan versi ringkas untuk
			// layar kecil ("GDrive" dan "GD"); yang dipakai cukup yang pertama.
			const title = Text(link.querySelector("span")) || Text(link);
			if (url) urlList.push({ title, url });
		}

		if (!urlList.length) continue;

		const quality: Quality = {
			title: Text(node.querySelector(".Download__group-title")),
			size: "",
			urlList,
		};

		if (!current) {
			current = { title: "Download", qualityList: [] };
			formats.push(current);
		}

		current.qualityList.push(quality);
	}

	return formats.filter((format) => format.qualityList.length);
}

export function parseEpisodeDetails(doc: HTMLElement): Doronime.EpisodeDetails {
	const titleEl = doc.querySelector(".Content__title");
	if (!titleEl) throw new NotFoundError("Episode title not found");

	// Induk serinya diambil dari breadcrumb: tautan menu lain pada halaman juga
	// berpola `/anime/…` sehingga tidak bisa dibedakan lewat href saja.
	const seriesLink = doc.querySelector('.Content__breadcrumb-item a[href*="/anime/"]');
	const animeUrl = AnimeSrc(seriesLink, baseUrl) || "";

	const title = Text(titleEl).replace(/\s*Subtitle Indonesia\s*$/i, "").trim();
	const episodeList = parseEpisodeTable(doc);
	const episode = episodeNumber(title);

	// Tabel episode diurutkan dari yang terbaru, jadi episode sebelumnya berada
	// setelah episode ini di dalam daftar.
	const index = episodeList.findIndex((item) => item.episode === episode);
	const at = (offset: number) => (index < 0 ? null : (episodeList[index + offset]?.url ?? null));

	return {
		title,
		episode,
		animeSlug: animeUrl.split("/").filter(Boolean).pop() ?? "",
		animeUrl,
		navigation: { prev: at(1), next: at(-1) },
		downloadLinks: parseDownloadLinks(doc),
	};
}

/**
 * Doronime tidak menerbitkan hari tayang: seluruh isi `/schedule` berada di
 * bawah satu judul "Terserah Penerjemah". Yang benar-benar membedakan tiap baris
 * adalah nama penerjemahnya, jadi itulah yang dipakai sebagai kelompok — judul
 * bagiannya hanya dipakai kalau nama penerjemah tidak ada.
 */
export function parseSchedule(doc: HTMLElement): Doronime.ScheduleGroup[] {
	const body = parseTabBody(doc, /jadwal/i);
	if (!body) throw new NotFoundError("No schedule found");

	const groups = new Map<string, UrlLink[]>();
	let heading = "";

	for (const node of body.querySelectorAll(".Schedule__group, .Schedule__item")) {
		if ((node.classNames || "").includes("Schedule__group")) {
			heading = Text(node);
			continue;
		}

		const link = node.querySelector("a");
		const url = AnimeSrc(link, baseUrl) || "";
		if (!url) continue;

		const translator = Text(node.querySelector("span.text-danger")) || heading || "Lainnya";
		// Nama penerjemah ikut terbaca di teks tautan; hanya judulnya yang dipakai.
		const title = Attr(link, "title") || Text(link).replace(translator, "").trim();

		const list = groups.get(translator) ?? [];
		list.push({ title, url });
		groups.set(translator, list);
	}

	if (!groups.size) throw new NotFoundError("No schedule found");

	return [...groups].map(([day, animeList]) => ({ day, animeList }));
}

/**
 * Katalog A-Z pada `/anime?view=list`: `.List__container` berisi `.List__group`
 * (huruf) yang diikuti satu blok `.List` berisi judul-judulnya. Tampilan ini
 * mengabaikan `?page=`, jadi seluruh katalog datang dalam satu permintaan.
 */
export function parseAnimeCollections(doc: HTMLElement): Doronime.AnimeCollection[] {
	const container = doc.querySelector(".List__container");
	if (!container) throw new NotFoundError("No anime list found");

	const result: Doronime.AnimeCollection[] = [];
	let current: Doronime.AnimeCollection | null = null;

	for (const node of container.querySelectorAll(".List__group, .List")) {
		if ((node.classNames || "").includes("List__group")) {
			current = { initial: Text(node), animeList: [] };
			result.push(current);
			continue;
		}

		if (!current) continue;

		for (const item of node.querySelectorAll(".List__item a")) {
			const url = AnimeSrc(item, baseUrl) || "";
			const title = Attr(item, "title") || Text(item);
			if (url && title) current.animeList.push({ title, url });
		}
	}

	const collections = result.filter((entry) => entry.animeList.length);
	if (!collections.length) throw new NotFoundError("No anime list found");

	return collections;
}

export function parseGenreList(doc: HTMLElement): Doronime.GenreCard[] {
	const body = parseTabBody(doc, /genre/i) ?? doc;
	const seen = new Set<string>();
	const result: Doronime.GenreCard[] = [];

	for (const link of body.querySelectorAll('a[href*="/genre/"]')) {
		const genreId = Id(link);
		const title = Text(link);
		if (!genreId || !title || seen.has(genreId)) continue;

		seen.add(genreId);
		result.push({ title, genreId, sourceUrl: AnimeSrc(link, baseUrl) });
	}

	if (!result.length) throw new NotFoundError("No genres found");

	return result;
}
