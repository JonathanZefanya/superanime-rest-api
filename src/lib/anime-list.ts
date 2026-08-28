export type AnimeListGroup<T> = {
	initial: string;
	animeList: T[];
};

export type AnimeListPage<T> = {
	data: AnimeListGroup<T>[];
	pagination: {
		currentPage: number;
		prevPage: number | null;
		nextPage: number | null;
		totalPages: number;
		hasPrevPage: boolean;
		hasNextPage: boolean;
	};
};

export function paginateAnimeList<T>(
	groups: AnimeListGroup<T>[],
	initialQuery: unknown,
	pageQuery: unknown,
	size = 18,
): AnimeListPage<T> {
	const initial = typeof initialQuery === "string" ? initialQuery.trim().toUpperCase() : "";
	const requestedPage = Math.max(1, Number.parseInt(String(pageQuery ?? "1"), 10) || 1);
	const matchingGroups = initial === "#"
		? groups.filter((entry) => !/^[A-Z]$/.test(entry.initial.trim().toUpperCase()))
		: groups.filter((entry) => entry.initial.trim().toUpperCase() === initial);
	const items = matchingGroups.flatMap((entry) => entry.animeList);
	const totalPages = Math.max(1, Math.ceil(items.length / size));
	const currentPage = Math.min(requestedPage, totalPages);
	const start = (currentPage - 1) * size;

	return {
		data: matchingGroups.length
			? [{ initial: initial || matchingGroups[0]?.initial || "#", animeList: items.slice(start, start + size) }]
			: [],
		pagination: {
			currentPage,
			prevPage: currentPage > 1 ? currentPage - 1 : null,
			nextPage: currentPage < totalPages ? currentPage + 1 : null,
			totalPages,
			hasPrevPage: currentPage > 1,
			hasNextPage: currentPage < totalPages,
		},
	};
}
