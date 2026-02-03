/**
 * API Cache Utility
 * 
 * Simple TTL-based cache for static API data (zones, VIN decoding, etc.)
 * Reduces redundant API calls for data that rarely changes.
 */

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class ApiCache {
    private cache = new Map<string, CacheEntry<unknown>>();

    /**
     * Get cached data if it exists and hasn't expired
     */
    get<T>(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.data as T;
    }

    /**
     * Store data in cache with TTL
     * @param key Cache key
     * @param data Data to cache
     * @param ttlMs Time-to-live in milliseconds
     */
    set<T>(key: string, data: T, ttlMs: number): void {
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + ttlMs
        });
    }

    /**
     * Check if key exists and is not expired
     */
    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * Remove specific key from cache
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Remove expired entries (cleanup)
     */
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Singleton instance
export const apiCache = new ApiCache();

// Periodic cleanup (every 5 minutes)
if (typeof window !== 'undefined') {
    setInterval(() => apiCache.cleanup(), 5 * 60 * 1000);
}

// Common TTL values (exported for convenience)
export const CacheTTL = {
    /** 5 minutes - for semi-static data like zones */
    SHORT: 5 * 60 * 1000,

    /** 1 hour - for static data like VIN decoding */
    MEDIUM: 60 * 60 * 1000,

    /** 24 hours - for very static data */
    LONG: 24 * 60 * 60 * 1000,
} as const;
