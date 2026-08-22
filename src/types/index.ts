/* ===== Shared Types ===== */

export interface Pagination {
	currentPage: number;
	prevPage: number | null;
	nextPage: number | null;
	totalPages: number;
	hasPrevPage: boolean;
	hasNextPage: boolean;
}

export interface ApiResponse<T = unknown> {
	statusCode: number;
	statusMessage: string;
	message: string;
	data?: T;
	pagination?: Pagination | null;
}

export interface UrlLink {
	title: string;
	url: string;
}

export interface Server {
	title: string;
	serverId: string;
}

export interface Quality {
	title: string;
	size: string;
	urlList?: UrlLink[];
	serverList?: Server[];
}

export interface Format {
	title: string;
	qualityList: Quality[];
}

export interface Synopsis {
	paragraphList: string[];
}

/* ===== Otakudesu Types ===== */

export namespace Otakudesu {
	export interface OngoingCard {
		title: string; poster: string; episodes: string; animeId: string;
		releaseDay: string; releaseDate: string; sourceUrl?: string;
	}
	export interface CompletedCard {
		title: string; poster: string; episodes: string; animeId: string;
		score: string; lastRelease: string; sourceUrl?: string;
	}
	export interface Home { ongoing: OngoingCard[]; completed: CompletedCard[]; }
	export interface ScheduleCollection { day: string; animeList: UrlLink[]; }
	export interface AnimeCollection { initial: string; animeList: UrlLink[]; }
	export interface GenreCard { title: string; genreId: string; sourceUrl?: string; }
	export interface SearchedAnime {
		title: string; poster: string; score: string; status: string;
		genres: string[]; animeId: string; sourceUrl?: string;
	}
	export interface GenreFilteredAnime {
		title: string; poster: string; synopsis: string; studios: string;
		season: string; score: string; status: string; genres: UrlLink[];
		animeId: string; sourceUrl?: string;
	}
	export interface RecommendedAnime { title: string; url: string; poster: string; animeId: string; }
	export interface AnimeDetails {
		title: string; japanese: string; score: string; producers: string;
		type: string; status: string; episodes: string; duration: string;
		aired: string; studios: string; poster: string; synopsis: Synopsis;
		batchLink: UrlLink | null; genreList: UrlLink[]; episodeList: UrlLink[];
		recommendedAnimeList: RecommendedAnime[];
	}
	export interface BatchDetails { title: string; poster: string; genreList: UrlLink[]; formatList: Format[]; }
	export interface EpisodeDetails {
		title: string; navigation: { prev: UrlLink | null; next: UrlLink | null };
		defaultStreaming: string; downloadLinks: Format[]; serverList: Server[];
		info: string; genreList: UrlLink[]; episodeList: UrlLink[];
		/** Induk anime dari tautan "See All Episodes". */
		animeId: string; animeUrl?: string;
	}
	export interface ServerDetails { title: string; url: string; }
}

/* ===== Kuramanime Types ===== */

export namespace Kuramanime {
	export interface AnimeCard {
		title: string; slug: string; poster: string; type: string;
		quality: string; highlight: string; sourceUrl?: string;
	}
	export interface Home { ongoing: AnimeCard[]; completed: AnimeCard[]; movie: AnimeCard[]; }
	export interface ScheduledAnime {
		title: string; slug: string; poster: string; day: string;
		releaseTime: string; type: string; sourceUrl?: string;
	}
	export interface EpisodeCard {
		title: string; slug: string; episode: number; total: number;
		poster: string; sourceUrl?: string;
	}
	export interface PropertyCard {
		title: string; propertyId: string; propertyType: string; sourceUrl?: string;
	}
	export interface AnimeDetails {
		title: string; alternativeTitle: string; poster: string; synopsis: Synopsis;
		episodeRange: { first: number; last: number }; info: Record<string, string>;
		properties: Record<string, PropertyCard[]>; genreList: PropertyCard[];
		themeList: PropertyCard[]; demoList: PropertyCard[]; studioList: PropertyCard[];
		batchList: UrlLink[]; similarAnime: AnimeCard[];
	}
	export interface BatchDetails { title: string; poster: string; formatList: Format[]; }
	export interface EpisodeDetails {
		title: string; navigation?: { prev: EpisodeCard | null; next: EpisodeCard | null };
		streaming: UrlLink[]; downloadLinks: Format[]; lastUpdated: string; info: string;
	}
}

/* ===== Oploverz Types ===== */

export namespace Oploverz {
	export interface AnimeCard {
		title: string; slug: string; poster: string; type: string;
		episode: string; score: string; status: string; seriesUrl?: string;
		genres: UrlLink[]; sourceUrl?: string; postId?: string;
	}
	export interface Home {
		popular: AnimeCard[]; latest: AnimeCard[]; recommended: AnimeCard[];
	}
	export interface AnimeDetails {
		title: string; poster: string; rating: string; status: string;
		studio: string; season: string; type: string; synopsis: Synopsis;
		genreList: UrlLink[]; episodeList: EpisodeItem[]; alternativeTitle: string;
	}
	export interface EpisodeItem {
		episode: number; title: string; date: string; url: string;
	}
	export interface EpisodeDetails {
		title: string; episode: number; poster: string; iframe: string;
		navigation: { prev: string | null; next: string | null };
		downloadLinks: Format[]; seriesUrl: string; serverList: Server[];
	}
	export interface ScheduleCollection { day: string; animeList: UrlLink[]; }
	/** Jadwal rilis dikelompokkan per hari, lengkap dengan poster tiap judul. */
	export interface ScheduleGroup { day: string; animeList: AnimeCard[]; }
	export interface AnimeCollection { initial: string; animeList: UrlLink[]; }
	export interface GenreCard { title: string; genreId: string; sourceUrl?: string; }
}

/* ===== Nimegami Types ===== */

export namespace Nimegami {
	export interface AnimeCard {
		title: string; slug: string; poster: string; rating: string;
		episode: string; studio: string; categories: UrlLink[];
		status: string; type: string; isBatch: boolean; isStreaming: boolean;
		sourceUrl?: string; date: string;
	}
	export interface Home {
		latest: AnimeCard[]; recommended: AnimeCard[];
	}
	export interface AnimeDetails {
		title: string; alternativeTitle: string; poster: string; rating: string;
		studio: string; season: string; type: string; series: string;
		categories: UrlLink[]; credit: string; synopsis: string;
		duration: string; downloadLinks: Format[]; episodeList: EpisodeItem[];
	}
	export interface EpisodeItem {
		episode: number; title: string; url: string;
	}
	/** Satu sumber video langsung (mp4) untuk sebuah resolusi. */
	export interface StreamSource { format: string; url: string }
	export interface EpisodeDetails {
		title: string; episode: number; poster: string; animeSlug: string;
		streamSources: StreamSource[]; downloadLinks: Format[];
		navigation: { prev: number | null; next: number | null };
	}
	export interface AnimeCollection { initial: string; animeList: UrlLink[]; }
	export interface ScheduleGroup { day: string; animeList: AnimeCard[]; }
}

/* ===== Doronime Types ===== */

export namespace Doronime {
	export interface AnimeCard {
		title: string; slug: string; poster: string; status: string;
		type: string; score: string; sourceUrl?: string;
	}
	export interface AnimeDetails {
		title: string; poster: string; romaji: string; english: string;
		alternativeTitle: string; status: string; duration: string;
		genreList: UrlLink[]; season: string; producer: string; studio: string;
		releaseDate: string; totalEpisode: string; score: string;
		synopsis: string; episodeList: EpisodeItem[];
	}
	export interface EpisodeItem {
		episode: number; title: string; date: string; url: string;
	}
	export interface EpisodeDetails {
		title: string; episode: number; animeSlug: string; animeUrl: string;
		navigation: { prev: string | null; next: string | null };
		downloadLinks: Format[];
	}
	export interface ScheduleGroup { day: string; animeList: UrlLink[]; }
	export interface AnimeCollection { initial: string; animeList: UrlLink[]; }
	export interface GenreCard { title: string; genreId: string; sourceUrl?: string; }
}
