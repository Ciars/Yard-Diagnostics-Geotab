import { describe, expect, it } from 'vitest';
import { sanitizeGeotabReadGetRequest } from '@/features/rai/shared/geotabReadGuards';

describe('sanitizeGeotabReadGetRequest', () => {
    it('accepts valid read query and clamps result limits', () => {
        const guarded = sanitizeGeotabReadGetRequest({
            method: 'Get',
            typeName: 'FaultData',
            resultsLimit: 1_500,
            search: {
                deviceSearch: { id: 'b1' },
            },
        });

        expect(guarded.ok).toBe(true);
        expect(guarded.value?.resultsLimit).toBe(250);
        expect(guarded.value?.method).toBe('Get');
    });

    it('blocks non-read methods and non-whitelisted entities', () => {
        expect(sanitizeGeotabReadGetRequest({ method: 'Set', typeName: 'FaultData' }).ok).toBe(false);
        expect(sanitizeGeotabReadGetRequest({ method: 'Get', typeName: 'User' }).ok).toBe(false);
    });

    it('rejects oversized date windows', () => {
        const guarded = sanitizeGeotabReadGetRequest({
            method: 'Get',
            typeName: 'Trip',
            fromDate: '2026-01-01T00:00:00.000Z',
            toDate: '2026-03-01T00:00:00.000Z',
        });

        expect(guarded.ok).toBe(false);
        expect(guarded.error).toContain('31 days');
    });

    it('strips forbidden command-like keys from search payload', () => {
        const guarded = sanitizeGeotabReadGetRequest({
            method: 'Get',
            typeName: 'Device',
            search: {
                safeField: 'ok',
                setCommand: 'drop',
            },
        });

        expect(guarded.ok).toBe(true);
        expect(guarded.value?.search).toEqual({ safeField: 'ok' });
    });
});
