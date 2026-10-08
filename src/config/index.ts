export const appConfig = {
	port: parseInt(process.env.PORT || "3001", 10),
	sourceUrl: true,
	nodeEnv: process.env.NODE_ENV || "development",
} as const;

export const sources = {
	otakudesu: {
		baseUrl: "https://otakudesu.blog",
		name: "Otakudesu",
		enabled: true,
		cacheTtl: 10,
	},
	kuramanime: {
		baseUrl: "https://v20.kuramanime.ing",
		// Cloudflare di Kuramanime memblokir IP datacenter: dari Vercel selalu
		// dibalas 403, dari IP rumah/lokal tetap 200. Route-nya dibiarkan hidup
		// supaya bisa dipakai saat pengembangan; frontend yang menyembunyikan
		// sumber ini di build produksi.
		name: "Kuramanime",
		enabled: true,
		cacheTtl: 10,
	},
	oploverz: {
		baseUrl: "https://oploverz.am",
		name: "Oploverz",
		enabled: true,
		cacheTtl: 10,
	},
	nimegami: {
		baseUrl: "https://nimegami.id",
		name: "Nimegami",
		enabled: false,
		cacheTtl: 10,
	},
	doronime: {
		baseUrl: "https://doroni.me",
		// Doronime tidak punya pemutar sama sekali — tiap episode hanya berisi
		// tautan unduhan per resolusi, jadi namanya diberi keterangan agar
		// pengguna tidak mengira sumber ini bisa dipakai untuk menonton.
		//
		// Cloudflare-nya juga memasang Managed Challenge terhadap IP datacenter:
		// dari Vercel selalu dibalas halaman "Just a moment…" (403), dari IP
		// rumah tetap 200. Route-nya dibiarkan hidup untuk pengembangan, dan
		// frontend yang menyembunyikan sumber ini di build produksi.
		name: "Doronime (Download)",
		enabled: true,
		cacheTtl: 10,
	},
	ylnime: {
		baseUrl: "https://ylnime.com",
		name: "YLnime",
		enabled: true,
		cacheTtl: 10,
	},
	nontonanimeid: {
		baseUrl: "https://s13.nontonanimeid.boats",
		name: "NontonAnimeID",
		enabled: true,
		cacheTtl: 10,
	},
	samehadaku: {
		baseUrl: "https://v2.samehadaku.how",
		name: "Samehadaku",
		enabled: false, // Cloudflare block
		cacheTtl: 10,
	},
} as const;

export type SourceKey = keyof typeof sources;
