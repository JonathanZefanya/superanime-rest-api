import { describe, expect, test } from "bun:test";
import { paginateAnimeList } from "../src/lib/anime-list.js";

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index);

const groups = [
	{ initial: "#", animeList: range(0, 10) },
	{ initial: "A", animeList: range(10, 30) },
	{ initial: "B", animeList: range(40, 30) },
];

describe("paginateAnimeList tanpa initial", () => {
	test("halaman pertama berisi seluruh katalog dengan label ALL", () => {
		const page = paginateAnimeList(groups, undefined, undefined, 50);
		expect(page.data).toEqual([{ initial: "ALL", animeList: range(0, 50) }]);
		expect(page.pagination).toMatchObject({ currentPage: 1, totalPages: 2, hasNextPage: true, nextPage: 2 });
	});

	test("halaman terakhir berisi sisa katalog", () => {
		const page = paginateAnimeList(groups, "", "2", 50);
		expect(page.data).toEqual([{ initial: "ALL", animeList: range(50, 20) }]);
		expect(page.pagination).toMatchObject({ currentPage: 2, totalPages: 2, hasNextPage: false, prevPage: 1 });
	});

	test("filter huruf tetap seperti sebelumnya", () => {
		expect(paginateAnimeList(groups, "a", undefined, 50).data).toEqual([{ initial: "A", animeList: range(10, 30) }]);
		expect(paginateAnimeList(groups, "#", undefined, 50).data).toEqual([{ initial: "#", animeList: range(0, 10) }]);
		expect(paginateAnimeList(groups, "Z", undefined, 50).data).toEqual([]);
	});
});
