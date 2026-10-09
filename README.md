<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=waving&color=0:e11d48,100:6a11cb&height=200&section=header&text=superanime%20API&fontSize=60&fontColor=fff&animation=fadeIn">
  <img alt="superanime API banner" src="https://capsule-render.vercel.app/api?type=waving&color=0:e11d48,100:6a11cb&height=200&section=header&text=superanime%20API&fontSize=60&fontColor=fff&animation=fadeIn">
</picture>

<p align="center">
  <strong>REST API scraper anime subtitle Indonesia</strong><br>
  Otakudesu · Oploverz · YLnime · NontonAnimeID · Kuramanime · Doronime · Nimegami
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.3+-000?logo=bun&logoColor=fff">
  <img alt="Express" src="https://img.shields.io/badge/Express-5-000?logo=express&logoColor=fff">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=fff">
  <img alt="Vercel" src="https://img.shields.io/badge/deploy-Vercel-000?logo=vercel&logoColor=fff">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-e11d48">
</p>

<p align="center">
  <a href="#-fitur">Fitur</a> •
  <a href="#-memulai">Memulai</a> •
  <a href="#-sumber">Sumber</a> •
  <a href="#-endpoint">Endpoint</a> •
  <a href="#%EF%B8%8F-database-opsional">Database</a> •
  <a href="#%EF%B8%8F-deploy">Deploy</a> •
  <a href="#%EF%B8%8F-struktur-proyek">Struktur</a>
</p>

---

**superanime** adalah REST API yang men-scrape situs anime subtitle Indonesia dan
menyajikannya dalam format JSON yang seragam. Dibangun dengan **Bun + Express 5 +
TypeScript**, dilengkapi cache dua lapis, sinkronisasi opsional ke **Supabase**, dan siap
di-deploy ke **Vercel** sebagai serverless function.

API ini adalah backend untuk frontend
[**SatoruStream**](https://github.com/JonathanZefanya/satorustream).

## ✨ Fitur

| Fitur | Keterangan |
| --- | --- |
| 🔌 **7 sumber** | Satu bentuk respons untuk semua sumber. |
| ⚡ **Cache 2 lapis** | LRU di server (100 entri, TTL per rute) + header `Cache-Control` untuk klien. |
| 🧪 **Validasi** | Parameter divalidasi dengan Valibot. |
| 🧼 **Sanitasi** | HTML hasil scrape dibersihkan dengan `sanitize-html`. |
| 🗄️ **Supabase sync** | Opsional: data hasil scrape disimpan ke PostgreSQL dan bisa di-query lewat API. |
| 🚀 **Serverless** | Entry point Vercel di [api/index.ts](api/index.ts), error saat boot dikembalikan sebagai JSON. |

## 🚀 Memulai

Prasyarat: [Bun](https://bun.sh) ≥ 1.3. Akun [Supabase](https://supabase.com) hanya perlu
kalau ingin memakai fitur sync.

```bash
git clone https://github.com/JonathanZefanya/superanime-rest-api.git
cd superanime-rest-api
bun install

cp .env.example .env   # opsional, hanya untuk Supabase
bun dev                # http://localhost:3001
```

| Perintah | Kegunaan |
| --- | --- |
| `bun dev` | Dev server dengan hot reload. |
| `bun start` | Menjalankan server tanpa hot reload. |
| `bun typecheck` | Pemeriksaan tipe dengan `tsc --noEmit`. |

### Environment

| Variabel | Wajib | Default | Keterangan |
| --- | --- | --- | --- |
| `PORT` | tidak | `3001` | Port server lokal. |
| `SUPABASE_URL` | untuk sync | — | URL project Supabase. |
| `SUPABASE_ANON_KEY` | untuk sync | — | Anon key Supabase. |

Tanpa kredensial Supabase, rute `/sync` dan `/db` tidak dipasang; semua rute scraping
tetap berjalan normal.

## 🌐 Sumber

Daftar sumber dan base URL-nya diatur di [src/config/index.ts](src/config/index.ts).
Domain situs anime sering berganti; cukup ubah `baseUrl` di sana.

| Sumber | Prefix | Status | Catatan |
| --- | --- | --- | --- |
| Otakudesu | `/otakudesu` | ✅ aktif | Paling lengkap, streaming dengan banyak mirror. |
| Oploverz | `/oploverz` | ✅ aktif | Streaming lewat satu iframe + tautan unduhan. |
| YLnime | `/ylnime` | ✅ aktif | |
| NontonAnimeID | `/nontonanimeid` | ⚠️ lokal saja | Cloudflare Managed Challenge menolak IP datacenter. |
| Kuramanime | `/kuramanime` | ⚠️ lokal saja | Cloudflare menolak IP datacenter (403 dari Vercel). |
| Doronime | `/doronime` | ⚠️ lokal saja | Hanya tautan unduhan, tanpa pemutar. Cloudflare menolak IP datacenter. |
| Nimegami | `/nimegami` | ⛔ nonaktif | Rute tetap terpasang, tapi tidak tercantum di `GET /`. |

"Lokal saja" berarti rute berjalan dari IP rumah (mis. saat `bun dev`), tetapi gagal saat
di-deploy ke Vercel.

## 📡 Endpoint

`GET /` mengembalikan daftar sumber aktif beserta status database. Setiap sumber juga
punya `GET /<sumber>/` yang mendaftar rute miliknya.

### Otakudesu — `/otakudesu`

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/home` | Ongoing + completed |
| `GET` | `/schedule` | Jadwal rilis per hari |
| `GET` | `/anime` | Katalog A-Z |
| `GET` | `/genre` | Daftar genre |
| `GET` | `/genre/:genreId` | Anime per genre (`?page=`) |
| `GET` | `/ongoing` | Anime ongoing (`?page=`) |
| `GET` | `/completed` | Anime selesai (`?page=`) |
| `GET` | `/search?q=` | Pencarian |
| `GET` | `/anime/:animeId` | Detail anime |
| `GET` | `/episode/:episodeId` | Detail episode + server + unduhan |
| `GET` `POST` | `/server/:serverId` | URL stream untuk satu server |
| `GET` | `/batch/:batchId` | Unduhan batch |

### Oploverz — `/oploverz`

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/home` | Populer, terbaru, rekomendasi |
| `GET` | `/schedule` | Jadwal rilis |
| `GET` | `/anime` | Daftar anime |
| `GET` | `/anime-list` | Koleksi anime A-Z |
| `GET` | `/genre` | Daftar genre |
| `GET` | `/genres/:genreId` | Anime per genre |
| `GET` | `/ongoing` | Anime ongoing |
| `GET` | `/completed` | Anime selesai |
| `GET` | `/search?q=` | Pencarian |
| `GET` | `/anime/:slug` | Detail anime |
| `GET` | `/episode/:slug` | Detail episode + tautan unduhan |

### YLnime — `/ylnime`

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/schedule` | Jadwal rilis |
| `GET` | `/anime-list` | Koleksi anime A-Z |
| `GET` | `/genre` | Daftar genre |
| `GET` | `/genres/:genreId` | Anime per genre |
| `GET` | `/ongoing` | Anime ongoing |
| `GET` | `/completed` | Anime selesai |
| `GET` | `/search?q=` | Pencarian |
| `GET` | `/anime/:slug` | Detail anime |
| `GET` | `/episode/:slug` | Detail episode |

### NontonAnimeID — `/nontonanimeid`

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/latest` | Episode terbaru |
| `GET` | `/schedule` | Jadwal rilis |
| `GET` | `/anime-list` | Koleksi anime A-Z |
| `GET` | `/genre` | Daftar genre |
| `GET` | `/genres/:genreId` | Anime per genre |
| `GET` | `/ongoing` | Anime ongoing |
| `GET` | `/completed` | Anime selesai |
| `GET` | `/search?q=` | Pencarian |
| `GET` | `/anime/:slug` | Detail anime |
| `GET` | `/episode/:slug` | Detail episode |
| `GET` | `/server/:serverId` | URL stream untuk satu server |

### Kuramanime — `/kuramanime`

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/home` | Ongoing, completed, movie |
| `GET` | `/anime` | Daftar anime (`?search=`, `?status=`, `?sort=`) |
| `GET` | `/schedule?scheduled_day=` | Jadwal rilis per hari |
| `GET` | `/episodes` | Episode terbaru |
| `GET` | `/properties/:propertyType` | Daftar properti (genre, season, studio, dll.) |
| `GET` | `/properties/:propertyType/:propertyId` | Anime per properti |
| `GET` | `/anime/:animeId/:animeSlug` | Detail anime |
| `GET` | `/episode/:animeId/:animeSlug/:episodeId` | Detail episode |
| `GET` | `/batch/:animeId/:animeSlug/:batchId` | Unduhan batch |

### Doronime — `/doronime`

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/home` | Beranda |
| `GET` | `/anime` | Daftar anime |
| `GET` | `/anime-list` | Koleksi anime A-Z |
| `GET` | `/movie` | Daftar movie |
| `GET` | `/batch` | Daftar batch |
| `GET` | `/schedule` | Jadwal rilis |
| `GET` | `/genre` | Daftar genre |
| `GET` | `/genre/:genreId` | Anime per genre |
| `GET` | `/search?q=` | Pencarian |
| `GET` | `/anime/:slug` | Detail anime |
| `GET` | `/episode/:slug/:episode` | Tautan unduhan per resolusi |
| `GET` | `/download/:id` | Resolusi tautan unduhan akhir |

### Nimegami — `/nimegami` (nonaktif)

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/home` | Terbaru + rekomendasi |
| `GET` | `/anime` | Daftar anime |
| `GET` | `/anime-list` | Koleksi anime A-Z |
| `GET` | `/schedule` | Jadwal ongoing |
| `GET` | `/genre` | Daftar genre |
| `GET` | `/genre/:genreId` | Anime per genre |
| `GET` | `/ongoing` | Anime ongoing |
| `GET` | `/search?q=` | Pencarian |
| `GET` | `/anime/:slug` | Detail anime |
| `GET` | `/episode/:slug/:episode` | Detail episode |

### Format respons

Semua endpoint memakai bentuk yang sama:

```json
{
  "statusCode": 200,
  "statusMessage": "OK",
  "message": "",
  "data": {},
  "pagination": {
    "currentPage": 1,
    "prevPage": null,
    "nextPage": 2,
    "totalPages": 10,
    "hasPrevPage": false,
    "hasNextPage": true
  }
}
```

`pagination` hanya ada di endpoint berhalaman. Error memakai bentuk yang sama dengan
`statusCode` 4xx/5xx dan pesan di `message`.

## 🗄️ Database (opsional)

1. Buat project Supabase.
2. Jalankan [supabase-schema.sql](supabase-schema.sql) di SQL Editor.
3. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `.env`.

| Tabel | Isi |
| --- | --- |
| `anime` | Entri anime (upsert per sumber + slug) |
| `episodes` | Episode per anime |
| `genres` | Genre per sumber |
| `anime_genres` | Relasi anime ↔ genre |
| `home_cache` | Snapshot beranda |
| `sync_log` | Riwayat dan status sinkronisasi |

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `POST` | `/sync/:source/:type` | Scrape lalu simpan ke database |
| `GET` | `/sync/status` | Riwayat sinkronisasi |
| `GET` | `/db/anime?source_id=&search=&page=` | Query anime dari database |

- `:source` — `otakudesu`, `kuramanime`, `oploverz`, `nimegami`, atau `all`
- `:type` — `home`, `anime`, `schedule`, `genres`, atau `full`

Sync baru mendukung empat sumber di atas. Selain sync manual, middleware auto-sync
menyimpan data setiap kali endpoint scraping dipanggil, tanpa menahan respons.

## ☁️ Deploy

Proyek dikonfigurasi untuk Vercel: [vercel.json](vercel.json) mengarahkan semua rute ke
[api/index.ts](api/index.ts).

```bash
npm i -g vercel
vercel --prod
```

Isi variabel Supabase di dashboard Vercel bila memakai sync. Ingat bahwa sumber bertanda
"lokal saja" akan dibalas 403 dari Vercel; jalankan API di server ber-IP residensial bila
sumber tersebut dibutuhkan di produksi.

## 🏗️ Struktur proyek

```
api/index.ts            entry point serverless Vercel
src/
├── index.ts            entry point server lokal
├── app.ts              aplikasi Express, CORS, rute, error handler
├── config/index.ts     konfigurasi aplikasi + daftar sumber
├── routes/             definisi rute per sumber, sync, db
├── controllers/        handler request per sumber
├── scrapers/           pengambilan HTML per sumber
├── parsers/            HTML → JSON per sumber + utilitas bersama
├── schemas/            skema validasi Valibot
├── lib/                fetcher, cache, error, formatter respons, Supabase, sync
├── middlewares/        error handler global, auto-sync
└── types/              tipe bersama
supabase-schema.sql     skema database untuk fitur sync
```

### Menambah sumber

1. Tambahkan entri di `sources` pada [src/config/index.ts](src/config/index.ts).
2. Buat `scrapers/<sumber>.ts`, `parsers/<sumber>.ts`, `controllers/<sumber>.ts`, dan
   `routes/<sumber>.ts`, mengikuti sumber yang sudah ada.
3. Daftarkan router di [src/routes/index.ts](src/routes/index.ts).

## 📦 Tech stack

| Teknologi | Kegunaan |
| --- | --- |
| [Bun](https://bun.sh) | Runtime, package manager, dev server |
| [Express 5](https://expressjs.com) | HTTP framework |
| [TypeScript](https://typescriptlang.org) | Tipe statis |
| [node-html-parser](https://github.com/taoqf/node-html-parser) | Parsing HTML |
| [lru-cache](https://github.com/isaacs/node-lru-cache) | Cache server |
| [Valibot](https://valibot.dev) | Validasi input |
| [sanitize-html](https://github.com/apostrophecms/sanitize-html) | Sanitasi HTML |
| [Supabase](https://supabase.com) | PostgreSQL untuk sync |

## 🤝 Kontribusi

1. Fork repository.
2. Buat branch: `git checkout -b feat/nama-fitur`.
3. Commit: `git commit -m "feat: tambah fitur"`.
4. Push lalu buka Pull Request.

## ⚠️ Disclaimer

API ini hanya mengambil dan menata ulang data yang tersedia publik di situs pihak ketiga
dan tidak menyimpan berkas video apa pun. Gunakan untuk keperluan belajar dan hormati
ketentuan situs sumber.

## 📄 Lisensi

[MIT](LICENSE) © [JonathanZefanya](https://github.com/JonathanZefanya)
