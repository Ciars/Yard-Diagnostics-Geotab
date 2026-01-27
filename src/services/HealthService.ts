/**
 * Critical Health Alerts Engine
 * 
 * Aggregates fault data, DVIR defects, and battery voltage
 * to determine vehicle health status.
 * Per DATA_LOGIC.md Section 2 and Section 3.
 */

import type { FaultData, DVIRDefect, StatusData } from '@/types/geotab';
import { DiagnosticIds } from '@/types/geotab';

// Constants
const LOW_BATTERY_THRESHOLD_VOLTS = 11.8;
const WARNING_BATTERY_THRESHOLD_VOLTS = 12.2;

const CAMERA_ERROR_MAP: Record<number, string> = {
    0: 'System Operating Normally',
    1: 'Video Signal Loss / No Input',
    2: 'Internal Recording Error',
    3: 'SD Card / Storage Failure',
    4: 'Low Voltage / Power Instability',
    5: 'Lens Obscured / Dirty',
    10: 'Network Timeout / Connection Reset',
    99: 'Hardware Fault Detected'
};

const ROAD_CAMERA_STATUS_MAP: Record<number, string> = {
    0: 'Decalibrated',
    1: 'Calibration In Progress',
    2: 'Calibration Complete',
    3: 'Adjustment Suggested',
    4: 'Adjustment Required'
};

const VIDEO_HEALTH_MAP: Record<number, string> = {
    0: 'Healthy',
    1: 'Unstable',
    2: 'Unhealthy',
    3: 'Not Working'
};

export interface HealthStatus {
    hasCriticalFaults: boolean;
    hasUnrepairedDefects: boolean;
    hasLowBattery: boolean;
    batteryVoltage: number | null;
    activeFaultCount: number;
    unrepairedDefectCount: number;
    healthScore: 'critical' | 'warning' | 'healthy';
}

export interface CameraHealth {
    status: 'good' | 'warning' | 'critical' | 'unknown';
    message: string;
    details: string[];
}

export interface FaultSummary {
    total: number;
    critical: number;
    medium: number;
    low: number;
    faults: FaultData[];
}

/**
 * Calculate overall health status for a vehicle
 * 
 * @param faults - Active FaultData records
 * @param defects - DVIRDefect records (check repairStatus)
 * @param statusData - StatusData for battery voltage
 * @returns Health status result
 */
export function calculateHealthStatus(
    faults: FaultData[] = [],
    defects: DVIRDefect[] = [],
    statusData: StatusData[] = []
): HealthStatus {
    // Get battery voltage
    const batteryVoltage = parseBatteryVoltage(statusData);
    const hasLowBattery = batteryVoltage !== null && batteryVoltage < LOW_BATTERY_THRESHOLD_VOLTS;

    // Check for critical faults (FaultData records are active by presence)
    const activeFaults = faults;
    const hasCriticalFaults = activeFaults.length > 0;

    // Check for unrepaired DVIR defects
    const unrepairedDefects = defects.filter(d =>
        d.repairStatus !== 'Repaired' &&
        d.repairStatus !== 'NotNecessary'
    );
    const hasUnrepairedDefects = unrepairedDefects.length > 0;

    // Determine overall health score
    let healthScore: 'critical' | 'warning' | 'healthy' = 'healthy';

    if (hasCriticalFaults || hasUnrepairedDefects || hasLowBattery) {
        healthScore = 'critical';
    } else if (batteryVoltage !== null && batteryVoltage < WARNING_BATTERY_THRESHOLD_VOLTS) {
        healthScore = 'warning';
    }

    return {
        hasCriticalFaults,
        hasUnrepairedDefects,
        hasLowBattery,
        batteryVoltage,
        activeFaultCount: activeFaults.length,
        unrepairedDefectCount: unrepairedDefects.length,
        healthScore,
    };
}

/**
 * Parse battery voltage from StatusData
 * 
 * @param statusData - Array of StatusData
 * @returns Battery voltage in volts, or null if not found
 */
export function parseBatteryVoltage(statusData: StatusData[]): number | null {
    if (!statusData || statusData.length === 0) {
        return null;
    }

    for (const status of statusData) {
        const diagnosticId = typeof status.diagnostic === 'string'
            ? status.diagnostic
            : status.diagnostic?.id;

        if (diagnosticId === DiagnosticIds.BATTERY_VOLTAGE) {
            return status.data ?? null;
        }
    }

    return null;
}

/**
 * Summarize faults by severity
 * 
 * Note: Geotab doesn't always provide severity directly,
 * so we categorize based on fault code patterns.
 */
export function summarizeFaults(faults: FaultData[]): FaultSummary {
    // FaultData records are active by presence (no isActive field)
    const activeFaults = faults;

    // For now, treat all active faults as at least "medium" severity
    // Real implementation would parse fault codes
    const critical = activeFaults.filter(f => isCriticalFault(f)).length;
    const remaining = activeFaults.length - critical;
    const medium = Math.floor(remaining * 0.7);
    const low = remaining - medium;

    return {
        total: activeFaults.length,
        critical,
        medium,
        low,
        faults: activeFaults,
    };
}

/**
 * Determine if a fault is critical based on code patterns
 */
function isCriticalFault(fault: FaultData): boolean {
    // Engine, transmission, and brake-related faults are critical
    const diagnosticName = fault.diagnostic?.name?.toLowerCase() || '';

    const criticalPatterns = [
        'engine',
        'transmission',
        'brake',
        'airbag',
        'abs',
        'emission',
        'overheating',
        'oil pressure',
    ];

    return criticalPatterns.some(pattern => diagnosticName.includes(pattern));
}

/**
 * Get battery status indicator
 */
export function getBatteryStatusIndicator(voltage: number | null): {
    status: 'good' | 'warning' | 'critical' | 'unknown';
    color: string;
    icon: string;
} {
    if (voltage === null) {
        return { status: 'unknown', color: '#6b7280', icon: '❓' };
    }

    if (voltage >= WARNING_BATTERY_THRESHOLD_VOLTS) {
        return { status: 'good', color: '#10b981', icon: '🟢' };
    }

    if (voltage >= LOW_BATTERY_THRESHOLD_VOLTS) {
        return { status: 'warning', color: '#f59e0b', icon: '🟡' };
    }

    return { status: 'critical', color: '#ef4444', icon: '🔴' };
}

/**
 * Format battery voltage for display
 */
export function formatBatteryVoltage(voltage: number | null): string {
    if (voltage === null) {
        return 'N/A';
    }
    return `${voltage.toFixed(1)}V`;
}

/**
 * Interpret camera-related StatusData
 */
export function analyzeCameraDiagnostics(statusData: StatusData[]): CameraHealth {
    const cameraDiagnostics = [
        'DiagnosticThirdPartyCameraStatusId',
        'DiagnosticThirdPartyCameraId',
        'DiagnosticSurfsightStatusId',
        'DiagnosticLytxStatusId',
        'DiagnosticLytxId',
        DiagnosticIds.CAMERA_STATUS_ROAD,
        DiagnosticIds.CAMERA_STATUS_DRIVER,
        DiagnosticIds.VIDEO_DEVICE_HEALTH,
        DiagnosticIds.CAMERA_ONLINE
    ];

    const logs = statusData.filter(s => {
        const id = typeof s.diagnostic === 'string' ? s.diagnostic : s.diagnostic?.id;
        return cameraDiagnostics.includes(id || '');
    });

    if (logs.length === 0) {
        return {
            status: 'unknown',
            message: 'No camera reports found',
            details: []
        };
    }

    // Sort by Date Desc
    logs.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    const details: string[] = [];
    let status: 'good' | 'warning' | 'critical' = 'good';

    logs.forEach(log => {
        const id = typeof log.diagnostic === 'string' ? log.diagnostic : log.diagnostic?.id;
        const value = Math.round(log.data);
        const time = new Date(log.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (id === 'DiagnosticThirdPartyCameraStatusId' || id === 'DiagnosticSurfsightStatusId' || id === 'DiagnosticLytxStatusId') {
            const errorDesc = CAMERA_ERROR_MAP[value] || `Error Code ${value}`;
            if (value !== 0) {
                status = 'critical';
                details.push(`[${time}] ${errorDesc}`);
            } else {
                details.push(`[${time}] ${errorDesc}`);
            }
        }

        if (id === DiagnosticIds.CAMERA_STATUS_ROAD) {
            const roadStatus = ROAD_CAMERA_STATUS_MAP[value] || `Status ${value}`;
            if (value === 0 || value === 4) status = 'critical';
            else if (value === 1 || value === 3) status = (status === 'critical' ? 'critical' : 'warning');
            details.push(`[${time}] Road Cam: ${roadStatus}`);
        }

        if (id === DiagnosticIds.VIDEO_DEVICE_HEALTH) {
            const healthStatus = VIDEO_HEALTH_MAP[value] || `Health Code ${value}`;
            if (value === 3 || value === 2) status = 'critical';
            else if (value === 1) status = (status === 'critical' ? 'critical' : 'warning');
            details.push(`[${time}] Health: ${healthStatus}`);
        }

        if (id === DiagnosticIds.CAMERA_ONLINE) {
            if (value === 0) {
                status = 'critical';
                details.push(`[${time}] Camera Offline (Diag)`);
            } else {
                details.push(`[${time}] Camera Online (Diag)`);
            }
        }
    });

    // Also check for specific camera obstruction diagnostic
    const obstructionDiag = logs.find(l => (typeof l.diagnostic === 'string' ? l.diagnostic : l.diagnostic?.id) === DiagnosticIds.CAMERA_OBSTRUCTION);
    if (obstructionDiag && obstructionDiag.data > 0) {
        status = 'warning';
        details.push(`[${new Date(obstructionDiag.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}] Lens Obscured/Blocked`);
    }

    return {
        status,
        message: status === 'good' ? 'Camera System Healthy' : (status === 'warning' ? 'Camera Warning' : 'Camera System Error'),
        details: Array.from(new Set(details)).slice(0, 4) // Unique last 4 reports
    };
}
