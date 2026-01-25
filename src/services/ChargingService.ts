/**
 * EV Charging Status Engine
 * 
 * Determines EV charging state and battery percentage.
 * Per DATA_LOGIC.md Section 3.
 */

import type { StatusData } from '@/types/geotab';
import { DiagnosticIds } from '@/types/geotab';

export interface ChargingStatus {
    isCharging: boolean;
    stateOfCharge: number | null;    // 0-100 percentage
    evRange: number | null;          // Miles
    isElectricVehicle: boolean;
}

/**
 * Parse charging status from StatusData array
 * 
 * Binary classification: DiagnosticChargingStateId value > 0 = Charging
 * 
 * @param statusData - Array of StatusData for the device
 * @returns Charging status result
 */
export function parseChargingStatus(statusData: StatusData[]): ChargingStatus {
    const result: ChargingStatus = {
        isCharging: false,
        stateOfCharge: null,
        evRange: null,
        isElectricVehicle: false,
    };

    if (!statusData || statusData.length === 0) {
        return result;
    }

    for (const status of statusData) {
        const diagnosticId = typeof status.diagnostic === 'string'
            ? status.diagnostic
            : status.diagnostic?.id;

        if (!diagnosticId) continue;

        switch (diagnosticId) {
            case DiagnosticIds.CHARGING_STATE:
                // Binary classification: value > 0 means charging
                result.isCharging = (status.data ?? 0) > 0;
                result.isElectricVehicle = true;
                break;

            case DiagnosticIds.STATE_OF_CHARGE:
                result.stateOfCharge = status.data ?? null;
                result.isElectricVehicle = true;
                break;

            case DiagnosticIds.EV_RANGE:
                // Convert km to miles if needed (Geotab returns km)
                const rangeKm = status.data ?? 0;
                result.evRange = Math.round(rangeKm * 0.621371);
                result.isElectricVehicle = true;
                break;
        }
    }

    return result;
}

/**
 * Get charging status display text
 */
export function formatChargingStatus(status: ChargingStatus): string {
    if (!status.isElectricVehicle) {
        return '—';
    }

    if (status.isCharging) {
        const soc = status.stateOfCharge !== null
            ? `${status.stateOfCharge}%`
            : '';
        return `⚡ Charging ${soc}`.trim();
    }

    if (status.stateOfCharge !== null) {
        return `${status.stateOfCharge}% SOC`;
    }

    return 'EV - Unknown';
}

/**
 * Get battery level indicator
 */
export function getBatteryLevelIndicator(stateOfCharge: number | null): {
    level: 'high' | 'medium' | 'low' | 'critical' | 'unknown';
    color: string;
    icon: string;
} {
    if (stateOfCharge === null) {
        return { level: 'unknown', color: '#6b7280', icon: '❓' };
    }

    if (stateOfCharge >= 80) {
        return { level: 'high', color: '#10b981', icon: '🔋' };
    }
    if (stateOfCharge >= 50) {
        return { level: 'medium', color: '#f59e0b', icon: '🔋' };
    }
    if (stateOfCharge >= 20) {
        return { level: 'low', color: '#f97316', icon: '🪫' };
    }
    return { level: 'critical', color: '#ef4444', icon: '🪫' };
}
