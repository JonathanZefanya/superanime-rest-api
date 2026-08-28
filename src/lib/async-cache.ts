type Entry<T> = {
	value?: T;
	promise?: Promise<T>;
	expiresAt: number;
};

const entries = new Map<string, Entry<unknown>>();

export function cachedAsync<T>(key: string, loader: () => Promise<T>, ttlMs = 10 * 60 * 1000): Promise<T> {
	const now = Date.now();
	const existing = entries.get(key) as Entry<T> | undefined;

	if (existing && existing.expiresAt > now) {
		return existing.promise ?? Promise.resolve(existing.value as T);
	}

	const entry: Entry<T> = { expiresAt: now + ttlMs };
	entry.promise = loader()
		.then((value) => {
			entry.value = value;
			entry.promise = undefined;
			return value;
		})
		.catch((error) => {
			entries.delete(key);
			throw error;
		});
	entries.set(key, entry as Entry<unknown>);
	return entry.promise;
}
