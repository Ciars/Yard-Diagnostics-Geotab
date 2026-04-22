/**
 * Dormancy Calculation Engine
 * 
 * Calculates how long a vehicle has been stationary from DeviceStatusInfo.
 */

import type { DeviceStatusInfo } from '@/types/geotab';

export interface DormancyResult {
    dormancyDays: number;
    dormancyHours: number;
    lastMoveDate: Date | null;
    isDormant: boolean;      // >= 14 days
    isJustArrived: boolean;  // < 5 minutes
    displayText: string;
}

const DORMANT_THRESHOLD_DAYS = 14;
const JUST_ARRIVED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Parse Geotab DeviceStatusInfo.currentStateDuration.
 *
 * Geotab can return either ISO 8601 duration strings (PT5M) or .NET
 * TimeSpan strings (30.00:00:00). Returns null only when the value is
 * missing or invalid; a zero duration is valid.
 */
export function parseCurrentStateDurationMs(duration: string | null | undefined): number | null {
    if (!duration) return null;

    if (duration.startsWith('P')) {
        const isoRegex = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
        const match = duration.match(isoRegex);
        if (!match) return null;

        const days = Number.parseFloat(match[1] || '0');
        const hours = Number.parseFloat(match[2] || '0');
        const mins = Number.parseFloat(match[3] || '0');
        const secs = Number.parseFloat(match[4] || '0');
        const ms = (((days * 24 + hours) * 60 + mins) * 60 + secs) * 1000;

        return Number.isFinite(ms) ? ms : null;
    }

    const timeSpanRegex = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;
    const match = duration.match(timeSpanRegex);
    if (!match) return null;

    const days = Number.parseInt(match[1] || '0', 10);
    const hours = Number.parseInt(match[2], 10);
    const mins = Number.parseInt(match[3], 10);
    const secs = Number.parseInt(match[4], 10);

    if (hours > 23 || mins > 59 || secs > 59) return null;

    const ms = ((days * 24 * 3600) + (hours * 3600) + (mins * 60) + secs) * 1000;
    return Number.isFinite(ms) ? ms : null;
}

function elapsedSinceStatusMs(statusDateTime: string | undefined, now: Date): number {
    if (!statusDateTime) return 0;

    const statusMs = new Date(statusDateTime).getTime();
    if (!Number.isFinite(statusMs)) return 0;

    return Math.max(0, now.getTime() - statusMs);
}

function statusAgeFallbackMs(statusDateTime: string | undefined, now: Date): number | null {
    if (!statusDateTime) return null;

    const statusMs = new Date(statusDateTime).getTime();
    if (!Number.isFinite(statusMs)) return null;

    return Math.max(0, now.getTime() - statusMs);
}

function buildDormancyResult(totalMs: number, now: Date): DormancyResult {
    const safeMs = Math.max(0, totalMs);
    const dormancyDays = Math.floor(safeMs / MS_PER_DAY);
    const dormancyHours = safeMs / MS_PER_HOUR;
    const isJustArrived = safeMs < JUST_ARRIVED_THRESHOLD_MS;
    const lastMoveDate = new Date(now.getTime() - safeMs);

    return {
        dormancyDays,
        dormancyHours,
        lastMoveDate,
        isDormant: dormancyDays >= DORMANT_THRESHOLD_DAYS,
        isJustArrived,
        displayText: formatDormancyDuration(dormancyDays, isJustArrived),
    };
}

/**
 * Calculate dormancy from DeviceStatusInfo.currentStateDuration.
 *
 * Moving vehicles are active. Missing speed is treated as stationary. When
 * currentStateDuration is missing or invalid, status timestamp age is the only
 * fallback.
 */
export function calculateDormancy(
    deviceStatus?: DeviceStatusInfo,
    now: Date = new Date()
): DormancyResult {
    const speed = typeof deviceStatus?.speed === 'number' ? deviceStatus.speed : undefined;

    if (speed !== undefined && speed >= 5) {
        return {
            dormancyDays: 0,
            dormancyHours: 0,
            lastMoveDate: now,
            isDormant: false,
            isJustArrived: false,
            displayText: 'Active',
        };
    }

    const currentStateMs = parseCurrentStateDurationMs(deviceStatus?.currentStateDuration);
    const totalMs = currentStateMs === null
        ? statusAgeFallbackMs(deviceStatus?.dateTime, now)
        : currentStateMs + elapsedSinceStatusMs(deviceStatus?.dateTime, now);

    if (totalMs === null) {
        return {
            dormancyDays: 0,
            dormancyHours: 0,
            lastMoveDate: null,
            isDormant: false,
            isJustArrived: false,
            displayText: 'Active',
        };
    }

    return buildDormancyResult(totalMs, now);
}

/**
 * Format dormancy duration for display
 * 
 * @param days - Number of days dormant
 * @param isJustArrived - Whether the vehicle just arrived
 * @returns Formatted string for UI display
 */
export function formatDormancyDuration(days: number, isJustArrived: boolean = false): string {
    if (isJustArrived) {
        return 'Just Arrived';
    }

    if (days < 0) {
        return 'Unknown';
    }

    if (days < 1) {
        const hours = Math.round(days * 24);
        return hours <= 1 ? '< 1h' : `${hours}h`;
    }

    const wholeDays = Math.floor(days);

    if (wholeDays >= DORMANT_THRESHOLD_DAYS) {
        return `${wholeDays}d`;
    }

    return `${wholeDays}d`;
}

/**
 * Get dormancy status category for KPI filtering
 */
export function getDormancyCategory(days: number): 'dormant' | 'active' | 'justArrived' {
    if (days * 24 * 60 < 5) { // < 5 minutes = just arrived
        return 'justArrived';
    }
    if (days >= DORMANT_THRESHOLD_DAYS) {
        return 'dormant';
    }
    return 'active';
}
