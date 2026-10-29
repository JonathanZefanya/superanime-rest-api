import { afterEach, describe, expect, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { paginateAnimeList } from "../src/lib/anime-list.js";
import { AppError } from "../src/lib/errors.js";
import { requireSyncSecret } from "../src/middlewares/requireSyncSecret.js";

describe("paginateAnimeList", () => {
	const groups = [
		{ initial: "A", animeList: Array.from({ length: 120 }, (_, i) => `a${i}`) },
		{ initial: "1", animeList: ["1st"] },
	];

	test("dipotong 50 per halaman", () => {
		const page = paginateAnimeList(groups, "a", "3");
		expect(page.data[0]?.animeList).toHaveLength(20);
		expect(page.pagination).toMatchObject({ currentPage: 3, totalPages: 3, hasNextPage: false });
	});

	test("'#' mengumpulkan judul yang tidak diawali huruf", () => {
		expect(paginateAnimeList(groups, "#", "1").data[0]?.animeList).toEqual(["1st"]);
	});

	test("tanpa initial mengembalikan semua grup", () => {
		const page = paginateAnimeList(groups, undefined, "1");
		expect(page.data[0]?.initial).toBe("ALL");
		expect(page.data[0]?.animeList).toHaveLength(50);
		expect(page.pagination).toMatchObject({
			currentPage: 1,
			totalPages: 3,
			hasNextPage: true,
		});
	});

	test("tanpa initial, halaman terakhir berisi sisa item", () => {
		const page = paginateAnimeList(groups, undefined, "3");
		expect(page.data[0]?.animeList).toHaveLength(21); // 120 + 1 item, 50/halaman
		expect(page.pagination).toMatchObject({ currentPage: 3, totalPages: 3, hasNextPage: false });
	});
});

describe("requireSyncSecret", () => {
	const original = { sync: process.env.SYNC_SECRET, cron: process.env.CRON_SECRET };
	afterEach(() => {
		process.env.SYNC_SECRET = original.sync ?? "";
		process.env.CRON_SECRET = original.cron ?? "";
	});

	/** Jalankan middleware dan kembalikan argumen next() (undefined = lolos). */
	const run = (authorization?: string): unknown => {
		let result: unknown = "next not called";
		const req = { get: (name: string) => (name.toLowerCase() === "authorization" ? authorization : undefined) };
		const next = ((err?: unknown) => {
			result = err;
		}) as NextFunction;
		requireSyncSecret(req as unknown as Request, {} as Response, next);
		return result;
	};
	const status = (result: unknown) => (result instanceof AppError ? result.statusCode : result);

	test("ditutup (503) bila secret belum diatur", () => {
		process.env.SYNC_SECRET = "";
		process.env.CRON_SECRET = "";
		expect(status(run("Bearer anything"))).toBe(503);
	});

	test("401 tanpa header atau dengan secret salah", () => {
		process.env.SYNC_SECRET = "s3cret";
		expect(status(run())).toBe(401);
		expect(status(run("Bearer wrong"))).toBe(401);
		expect(status(run("s3cret"))).toBe(401);
	});

	test("lolos dengan secret yang benar, termasuk CRON_SECRET", () => {
		process.env.SYNC_SECRET = "s3cret";
		expect(run("Bearer s3cret")).toBeUndefined();
		process.env.SYNC_SECRET = "";
		process.env.CRON_SECRET = "cron";
		expect(run("Bearer cron")).toBeUndefined();
	});
});
