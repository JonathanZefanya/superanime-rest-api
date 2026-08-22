import { fetchDOM } from "../lib/fetcher.js";
import { sources } from "../config/index.js";
import { BadGatewayError } from "../lib/errors.js";
import type { HTMLElement } from "node-html-parser";

const BASE = sources.doronime.baseUrl;

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function scrapeDOM(
	pathname: string,
	ref?: string,
	sanitize = false,
): Promise<HTMLElement> {
	return fetchDOM(`${BASE}${pathname}`, { ref, sanitize });
}

function collectCookies(res: Response, jar: Map<string, string>): void {
	for (const cookie of res.headers.getSetCookie()) {
		const [pair] = cookie.split(";");
		const separator = pair.indexOf("=");
		if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
	}
}

/**
 * Ubah tautan `/download?id=…` menjadi URL host aslinya (Google Drive, AceFile).
 *
 * Doronime menyembunyikan tujuannya di balik safelink bertahap:
 *   1. `GET /download?id=…` menerbitkan cookie sesi dan `<meta name="csrf-token">`
 *   2. `POST /safelink` membalas `{ data: { url: "/go/<base64>" } }`
 *   3. `GET /go/<base64>` membalas 302 ke tautan hostnya
 *
 * Hitungan mundur "tunggu 4 detik" di halamannya hanya berjalan di sisi klien,
 * jadi tidak perlu ditiru. Karena satu episode punya enam tautan, resolusi
 * dibiarkan sebagai endpoint tersendiri dan tidak dijalankan saat memuat
 * episode — biar halaman episode tetap satu permintaan.
 */
export async function scrapeDownloadUrl(id: string): Promise<string> {
	const jar = new Map<string, string>();
	const cookie = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
	const referer = `${BASE}/download?id=${id}`;

	const page = await fetch(referer, {
		headers: { "User-Agent": USER_AGENT, Referer: `${BASE}/` },
	});

	if (!page.ok) throw new BadGatewayError(`Doronime returned ${page.status} for download page`);
	collectCookies(page, jar);

	const csrf = (await page.text()).match(/name="csrf-token" content="([^"]+)"/)?.[1];
	if (!csrf) throw new BadGatewayError("Doronime download page has no CSRF token");

	const safelink = await fetch(`${BASE}/safelink`, {
		method: "POST",
		headers: {
			"User-Agent": USER_AGENT,
			Referer: referer,
			Cookie: cookie(),
			"X-CSRF-TOKEN": csrf,
			"X-XSRF-TOKEN": decodeURIComponent(jar.get("XSRF-TOKEN") ?? ""),
			"X-Requested-With": "XMLHttpRequest",
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json, text/javascript, */*; q=0.01",
		},
		body: new URLSearchParams({ id, _token: csrf }),
	});

	if (!safelink.ok) throw new BadGatewayError(`Doronime safelink returned ${safelink.status}`);
	collectCookies(safelink, jar);

	const payload = (await safelink.json()) as { data?: { url?: string } };
	const gate = payload.data?.url;
	if (!gate) throw new BadGatewayError("Doronime safelink returned no URL");

	const redirect = await fetch(gate, {
		method: "GET",
		redirect: "manual",
		headers: { "User-Agent": USER_AGENT, Referer: referer, Cookie: cookie() },
	});

	const location = redirect.headers.get("location");
	if (!location) throw new BadGatewayError("Doronime gate did not redirect to a host");

	// Tujuannya masih dibungkus pemendek (`sfl.gl/st/?…&url=<host>`); URL host
	// aslinya ada di parameter `url` sehingga bisa dibuka tanpa lompatan lagi.
	const wrapped = new URL(location).searchParams.get("url");

	return wrapped ?? location;
}
