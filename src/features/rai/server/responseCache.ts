interface CachedItem<T> {
    value: T;
    expiresAt: number;
}

export class TtlCache<T> {
    private items = new Map<string, CachedItem<T>>();

    constructor(private readonly ttlMs: number) { }

    get(key: string, now = Date.now()): T | null {
        const item = this.items.get(key);
        if (!item) return null;

        if (item.expiresAt <= now) {
            this.items.delete(key);
            return null;
        }

        return item.value;
    }

    set(key: string, value: T, now = Date.now()): void {
        this.items.set(key, {
            value,
            expiresAt: now + this.ttlMs,
        });
    }
}
