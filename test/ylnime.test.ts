import { describe, expect, test } from "bun:test";
import * as parser from "../src/parsers/ylnime.js";
import { fixture } from "./helpers.js";

describe("ylnime tokens", () => {
	test("slug series dengan '/', '?', '#' aman di satu segmen URL", () => {
		for (const slug of ["gintama/", "(uncen)-nande-koko-ni-sensei-ga!?", "a#b", "plain-slug"]) {
			const token = parser.toSeriesToken(slug);
			expect(token).not.toMatch(/[/?#]/);
			expect(parser.fromSeriesToken(token)).toBe(slug);
		}
	});

	test("token episode memulihkan id episode dan slug series", () => {
		const token = parser.toEpisodeToken("ysysn-episode-1-sub-indo/", "yuragi-san-sub-indo/");
		expect(token).toBe("ysysn-episode-1-sub-indo~__yuragi-san-sub-indo~");
		expect(parser.fromEpisodeToken(token)).toEqual({
			episodeId: "ysysn-episode-1-sub-indo/",
			seriesSlug: "yuragi-san-sub-indo/",
		});
	});
});

describe("ylnime stream links", () => {
	test("link tersamar (~ + base64 URL terbalik) didekode", () => {
		expect(parser.decodeStreamLink("~NHBtLjIwMTQyNzQzNTA5NzEtNDc0ZC9vci9kaS5lc3JldmVtaW5hLjNzLy86c3B0dGg=")).toBe(
			"https://s3.animeverse.id/ro/d474-1790534724102.mp4",
		);
	});

	test("link biasa dibiarkan, link rusak dikosongkan", () => {
		expect(parser.decodeStreamLink("https://example.com/a.mp4")).toBe("https://example.com/a.mp4");
		expect(parser.decodeStreamLink("~bm90LWEtdXJs")).toBe("");
	});

	test("toServers hanya menyimpan URL yang bisa diputar", () => {
		const servers = parser.toServers([
			{ reso: "720p", link: parser.decodeStreamLink("~NHBtLjIwMTQyNzQzNTA5NzEtNDc0ZC9vci9kaS5lc3JldmVtaW5hLjNzLy86c3B0dGg=") },
			{ reso: "720p", link: parser.decodeStreamLink("~ZGFvbG53b2Q/Q25USml0QzIvZWxpZi9pcGEvbW9jLm5pYXJkbGV4aXAvLzpzcHR0aA==") },
			{ reso: "720p", link: "~still-encoded" },
		]);
		expect(servers).toEqual([
			{ title: "Animeverse 720p", serverId: "https://s3.animeverse.id/ro/d474-1790534724102.mp4" },
		]);
	});
});

describe("ylnime parser", () => {
	test("hasil pencarian: 20 kartu unik dengan judul dan poster", () => {
		const cards = parser.parseCards(fixture("ylnime-search.html"));
		expect(cards).toHaveLength(20);
		expect(new Set(cards.map((card) => card.slug)).size).toBe(20);
		for (const card of cards) {
			expect(card.title).not.toBe("");
			expect(card.slug).not.toMatch(/[/?#]/);
			expect(card.poster).toStartWith("http");
		}
	});

	test("katalog A-Z: satu huruf penuh dalam satu halaman", () => {
		const cards = parser.parseCards(fixture("ylnime-anime-list.html"));
		expect(cards.length).toBeGreaterThanOrEqual(100);
		expect(cards.find((card) => card.title === "I Am The Blade")?.slug).toBe("i-am-the-blade");
	});
});
