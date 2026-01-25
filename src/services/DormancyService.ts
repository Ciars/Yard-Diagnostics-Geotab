/**
 * Dormancy Calculation Engine
 * 
 * Calculates how long a vehicle has been stationary in a zone.
 * Per DATA_LOGIC.md Section 2 and Section 4.
 */

import type { Trip, DeviceStatusInfo } from '@/types/geotab';

export interface DormancyResult {
    dormancyDays: number;
    dormancyHours: number;
    lastMoveDate: Date | null;
    isDormant: boolean;      // > 14 days
    isJustArrived: boolean;  // < 5 minutes
    displayText: string;
}

// Constants
const DORMANT_THRESHOLD_DAYS = 14;
const JUST_ARRIVED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const GPS_DRIFT_THRESHOLD_METERS = 10;

/**
 * Calculate dormancy based on last trip end time
 * 
 * @param lastTrip - The most recent trip for the vehicle
 * @param deviceStatus - Current device status info
 * @returns Dormancy calculation result
 */
export function calculateDormancy(
    lastTrip: Trip | null | undefined,
    deviceStatus?: DeviceStatusInfo
): DormancyResult {
    const now = new Date();

    // If we have a last trip with a stop time, use that
    let lastMoveDate: Date | null = null;

    if (lastTrip?.stop) {
        lastMoveDate = new Date(lastTrip.stop);
    } else if (deviceStatus?.dateTime) {
        // Fall back to device status timestamp
        lastMoveDate = new Date(deviceStatus.dateTime);
    }

    if (!lastMoveDate || isNaN(lastMoveDate.getTime())) {
        return {
            dormancyDays: 0,
            dormancyHours: 0,
            lastMoveDate: null,
            isDormant: false,
            isJustArrived: false,
            displayText: 'Unknown',
        };
    }

    const msSinceMove = now.getTime() - lastMoveDate.getTime();
    const hoursSinceMove = msSinceMove / (1000 * 60 * 60);
    const daysSinceMove = hoursSinceMove / 24;

    // Check if just arrived (< 5 minutes)
    const isJustArrived = msSinceMove < JUST_ARRIVED_THRESHOLD_MS;

    // Check if dormant (> 14 days)
    const isDormant = daysSinceMove >= DORMANT_THRESHOLD_DAYS;

    return {
        dormancyDays: daysSinceMove,
        dormancyHours: hoursSinceMove,
        lastMoveDate,
        isDormant,
        isJustArrived,
        displayText: formatDormancyDuration(daysSinceMove, isJustArrived),
    };
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

    const roundedDays = Math.round(days);

    if (roundedDays >= DORMANT_THRESHOLD_DAYS) {
        return `${roundedDays}d ⚠️`; // Warning indicator for dormant
    }

    return `${roundedDays}d`;
}

/**
 * Filter out GPS drift movements
 * 
 * GPS can drift slightly even when a vehicle is stationary.
 * This function filters out movements < 10 meters when ignition is OFF.
 * 
 * @param distanceMeters - Distance of the movement
 * @param ignitionOn - Whether ignition was on during movement
 * @returns true if this is GPS drift (should be ignored)
 */
export function isGpsDrift(distanceMeters: number, ignitionOn: boolean): boolean {
    // If ignition is on, any movement is real
    if (ignitionOn) {
        return false;
    }

    // If ignition off and distance < 10m, treat as GPS drift
    return distanceMeters < GPS_DRIFT_THRESHOLD_METERS;
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
