export interface RateLimitResult {
    allowed: boolean;
    retryAfterMs: number;
    remaining: number;
}

interface BucketState {
    tokens: number;
    lastRefillAt: number;
}

export class TokenBucketRateLimiter {
    private buckets = new Map<string, BucketState>();

    constructor(
        private readonly capacity: number,
        private readonly refillPerMinute: number,
    ) { }

    consume(key: string, now = Date.now(), cost = 1): RateLimitResult {
        const bucket = this.buckets.get(key) ?? {
            tokens: this.capacity,
            lastRefillAt: now,
        };

        const elapsedMs = Math.max(0, now - bucket.lastRefillAt);
        const refillRatePerMs = this.refillPerMinute / 60_000;
        const replenished = elapsedMs * refillRatePerMs;
        bucket.tokens = Math.min(this.capacity, bucket.tokens + replenished);
        bucket.lastRefillAt = now;

        if (bucket.tokens >= cost) {
            bucket.tokens -= cost;
            this.buckets.set(key, bucket);
            return {
                allowed: true,
                retryAfterMs: 0,
                remaining: Math.floor(bucket.tokens),
            };
        }

        const missing = cost - bucket.tokens;
        const retryAfterMs = Math.ceil(missing / refillRatePerMs);
        this.buckets.set(key, bucket);

        return {
            allowed: false,
            retryAfterMs,
            remaining: 0,
        };
    }

    getBucketCount(): number {
        return this.buckets.size;
    }
}
