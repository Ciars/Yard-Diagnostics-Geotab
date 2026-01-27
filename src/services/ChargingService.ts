/**
 * EV Charging Status Engine
 * 
 * Determines EV charging state and battery percentage.
 * Per DATA_LOGIC.md Section 3.
 */

import type { StatusData, ChargeEvent } from '@/types/geotab';
import { DiagnosticIds } from '@/types/geotab';

export interface ChargingStatus {
    isCharging: boolean;
    stateOfCharge: number | null;    // 0-100 percentage
    evRange: number | null;          // Miles
    isElectricVehicle: boolean;
}

/**
 * Parse charging status from StatusData array AND ChargeEvent entities
 * 
 * Priority:
 * 1. ChargeEvent (if active)
 * 2. DiagnosticChargingStateId (if available)
 * 
 * @param statusData - Array of StatusData for the device
 * @param chargeEvents - Array of ChargeEvent for the device (optional)
 * @returns Charging status result
 */
export function parseChargingStatus(statusData: StatusData[], chargeEvents: ChargeEvent[] = []): ChargingStatus {
    const result: ChargingStatus = {
        isCharging: false,
        stateOfCharge: null,
        evRange: null,
        isElectricVehicle: false,
    };

    // 1. Check ChargeEvents (New Reliability Layer)
    if (chargeEvents && chargeEvents.length > 0) {
        // Sort by startTime desc
        const sortedEvents = chargeEvents.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        const latestEvent = sortedEvents[0];

        if (latestEvent) {
            // If ChargeEvent exists within 24h, we assume it's relevant.
            // Geotab ChargeEvent usually has non-null duration even if ongoing?
            // But if 'endStateOfCharge' is undetermined, maybe it implies active?
            // Actually, simplest check: Is startTime recent?

            // Update SOC from event if available and newer than status
            if (latestEvent.endStateOfCharge) {
                result.stateOfCharge = latestEvent.endStateOfCharge;
                result.isElectricVehicle = true;
            } else if (latestEvent.startStateOfCharge) {
                result.stateOfCharge = latestEvent.startStateOfCharge;
                result.isElectricVehicle = true;
            }

            // Determine if Active
            // A completed event usually has a defined Duration and EndStateOfCharge
            // An active event might be missing EndStateOfCharge?
            // User provided snippet says "EndStateOfCharge... at the end".
            // If it's missing, maybe it hasn't ended?
            if (latestEvent.endStateOfCharge === undefined || latestEvent.endStateOfCharge === 0) {
                // Likely active
                result.isCharging = true;
            } else {
                // It ended
                result.isCharging = false;
            }
        }
    }

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
                // Only override if we haven't already found a ChargeEvent that says otherwise
                // Actually, StatusData is raw telemetry, ChargeEvent is summary.
                // StatusData might be newer?
                // Let's trust StatusData if it says TRUE.
                if ((status.data ?? 0) > 0) {
                    result.isCharging = true;
                    result.isElectricVehicle = true;
                } else if (chargeEvents.length === 0) {
                    // Only trust '0' (Not Charging) if we don't have a ChargeEvent saying otherwise
                    // And if we haven't seen AC_POWER > 0 yet (which would set isCharging=true)
                    if (!result.isCharging) {
                        result.isCharging = false;
                    }
                }
                break;

            case DiagnosticIds.AC_INPUT_POWER:
                // Option A: Physics Check
                // If Power > 0, it IS charging.
                if ((status.data ?? 0) > 0) {
                    result.isCharging = true;
                    result.isElectricVehicle = true;
                }
                break;

            case DiagnosticIds.HV_BATTERY_POWER:
                // Option A2: Battery Power Physics
                // Negative Value = Charging (Energy into battery)
                // Positive Value = Discharging (Driving/Usage)
                // Threshold: < -0.1 kW (or -100W depending on unit). Geotab usually Watts or kW?
                // Documentation says "DiagnosticElectricVehicleBatteryPowerId"
                // Let's assume ANY negative value implies inflow.
                // To avoid noise, let's say < -50 (if Watts) or < -0.05 (if kW).
                // Usually Geotab returns raw values.
                // If we see -1500, that's definitely charging.
                if ((status.data ?? 0) < -50) {
                    result.isCharging = true;
                    result.isElectricVehicle = true;
                }
                break;

            case DiagnosticIds.STATE_OF_CHARGE:
                // Prefer StatusData SOC as it's granular telemetry
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
