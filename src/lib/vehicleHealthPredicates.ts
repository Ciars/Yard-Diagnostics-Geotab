import type { KpiCounts, KpiFilterType, VehicleData } from '@/types/geotab';

export const BATTERY_CRITICAL_VOLTS = 11.8;
export const SILENT_THRESHOLD_HOURS = 24;
export const DORMANT_THRESHOLD_DAYS = 14;

export function hoursSince(isoDate: string | undefined): number {
    if (!isoDate) return Number.POSITIVE_INFINITY;
    const timestamp = new Date(isoDate).getTime();
    if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
    return (Date.now() - timestamp) / (1000 * 60 * 60);
}

export function isVehicleCritical(vehicle: VehicleData): boolean {
    const hasLowBattery = typeof vehicle.batteryVoltage === 'number' && vehicle.batteryVoltage <= BATTERY_CRITICAL_VOLTS;
    return vehicle.hasCriticalFaults || vehicle.hasUnrepairedDefects || hasLowBattery;
}

export function isVehicleSilent(vehicle: VehicleData): boolean {
    return !vehicle.status.isDeviceCommunicating || hoursSince(vehicle.status.dateTime) > SILENT_THRESHOLD_HOURS;
}

export function isVehicleDormant(vehicle: VehicleData): boolean {
    return vehicle.dormancyDays === null || (vehicle.dormancyDays ?? 0) >= DORMANT_THRESHOLD_DAYS;
}

export function isVehicleCharging(vehicle: VehicleData): boolean {
    return vehicle.isCharging;
}

export function hasVehicleCameraIssue(vehicle: VehicleData): boolean {
    return !!vehicle.cameraStatus &&
        (vehicle.cameraStatus.health === 'critical' ||
            vehicle.cameraStatus.health === 'warning' ||
            vehicle.cameraStatus.health === 'offline');
}

export function matchesKpiFilter(vehicle: VehicleData, filter: KpiFilterType): boolean {
    switch (filter) {
        case 'critical':
            return isVehicleCritical(vehicle);
        case 'silent':
            return isVehicleSilent(vehicle);
        case 'dormant':
            return isVehicleDormant(vehicle);
        case 'charging':
            return isVehicleCharging(vehicle);
        case 'camera':
            return hasVehicleCameraIssue(vehicle);
        default:
            return true;
    }
}

export function calculateVehicleKpis(vehicles: VehicleData[]): KpiCounts {
    return {
        critical: vehicles.filter(isVehicleCritical).length,
        silent: vehicles.filter(isVehicleSilent).length,
        dormant: vehicles.filter(isVehicleDormant).length,
        charging: vehicles.filter(isVehicleCharging).length,
        camera: vehicles.filter(hasVehicleCameraIssue).length,
    };
}
