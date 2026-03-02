import { describe, expect, it } from 'vitest';
import { TokenBucketRateLimiter } from '@/features/rai/server/rateLimiter';

describe('TokenBucketRateLimiter', () => {
    it('allows requests until capacity is consumed then blocks', () => {
        const limiter = new TokenBucketRateLimiter(2, 2);
        const now = 1_000;

        expect(limiter.consume('session-a', now).allowed).toBe(true);
        expect(limiter.consume('session-a', now).allowed).toBe(true);

        const blocked = limiter.consume('session-a', now);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    it('refills tokens over time', () => {
        const limiter = new TokenBucketRateLimiter(1, 60); // 1 token per second
        const now = 2_000;

        expect(limiter.consume('session-b', now).allowed).toBe(true);
        expect(limiter.consume('session-b', now).allowed).toBe(false);

        const afterRefill = limiter.consume('session-b', now + 1_200);
        expect(afterRefill.allowed).toBe(true);
    });
});
