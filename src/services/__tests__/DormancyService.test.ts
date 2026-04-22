import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateDormancy, parseCurrentStateDurationMs } from '@/services/DormancyService';
import type { DeviceStatusInfo } from '@/types/geotab';

const NOW = new Date('2026-04-22T12:00:00.000Z');

function createStatus(overrides: Partial<DeviceStatusInfo> = {}): DeviceStatusInfo {
    return {
        device: { id: 'device-1' },
        currentStateDuration: 'PT0S',
        isDeviceCommunicating: true,
        isDriving: false,
        speed: 0,
        bearing: 0,
        latitude: 53.3498,
        longitude: -6.2603,
        dateTime: NOW.toISOString(),
        ...overrides,
    };
}

describe('DormancyService.calculateDormancy', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('counts a parked vehicle with fresh status and 30 day currentStateDuration as dormant', () => {
        const result = calculateDormancy(createStatus({
            speed: 0,
            dateTime: NOW.toISOString(),
            currentStateDuration: '30.00:00:00',
        }));

        expect(result.dormancyDays).toBe(30);
        expect(result.isDormant).toBe(true);
    });

    it('does not count a parked vehicle with fresh status and short currentStateDuration as dormant', () => {
        const result = calculateDormancy(createStatus({
            speed: 0,
            dateTime: NOW.toISOString(),
            currentStateDuration: 'PT6H',
        }));

        expect(result.dormancyDays).toBe(0);
        expect(result.isDormant).toBe(false);
    });

    it('returns zero dormancy for a moving vehicle even when currentStateDuration is long', () => {
        const result = calculateDormancy(createStatus({
            speed: 5,
            currentStateDuration: '30.00:00:00',
        }));

        expect(result.dormancyDays).toBe(0);
        expect(result.isDormant).toBe(false);
    });

    it('falls back to status timestamp age when currentStateDuration is missing or invalid', () => {
        const oldStatusTime = new Date(NOW.getTime() - 16 * 24 * 60 * 60 * 1000).toISOString();

        const missingDuration = calculateDormancy(createStatus({
            speed: 0,
            dateTime: oldStatusTime,
            currentStateDuration: undefined as unknown as string,
        }));
        const invalidDuration = calculateDormancy(createStatus({
            speed: 0,
            dateTime: oldStatusTime,
            currentStateDuration: 'not-a-duration',
        }));

        expect(missingDuration.dormancyDays).toBe(16);
        expect(invalidDuration.dormancyDays).toBe(16);
        expect(invalidDuration.isDormant).toBe(true);
    });

    it('adds elapsed time since the status timestamp before flooring to whole days', () => {
        const staleStatusTime = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();

        const result = calculateDormancy(createStatus({
            speed: 0,
            dateTime: staleStatusTime,
            currentStateDuration: '13.23:00:00',
        }));

        expect(result.dormancyDays).toBe(14);
        expect(result.isDormant).toBe(true);
    });
});

describe('DormancyService.parseCurrentStateDurationMs', () => {
    it('parses Geotab ISO and TimeSpan currentStateDuration values', () => {
        expect(parseCurrentStateDurationMs('PT6H')).toBe(6 * 60 * 60 * 1000);
        expect(parseCurrentStateDurationMs('30.00:00:00')).toBe(30 * 24 * 60 * 60 * 1000);
    });
});
