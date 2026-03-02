import type { ExtendedDiagnostics, VehicleData, FaultData, ExceptionEvent } from '@/types/geotab';
import type { VehicleFaultSummary } from '@/services/FaultService';
import type { RaiVehicleDetailSnapshot } from '@/features/rai/types';

function isDvirDefectOpen(defect: { isRepaired?: boolean; repairStatus?: string }): boolean {
    if (defect.isRepaired === true) return false;
    if (defect.repairStatus === 'Repaired' || defect.repairStatus === 'NotNecessary') return false;
    return true;
}

function getRecentFaultLabels(faults: FaultData[]): string[] {
    const labels = faults
        .map((fault) => fault.failureMode?.name || fault.diagnostic?.id || 'Unknown fault')
        .filter((value, index, array) => array.indexOf(value) === index);
    return labels.slice(0, 5);
}

export function buildExpandedVehicleDetailSnapshot(args: {
    vehicle: VehicleData;
    lookbackDays: number;
    analysis: VehicleFaultSummary;
    faults: FaultData[];
    exceptions: ExceptionEvent[];
    extendedDiagnostics?: ExtendedDiagnostics;
}): RaiVehicleDetailSnapshot {
    const { vehicle, lookbackDays, analysis, faults, exceptions, extendedDiagnostics } = args;

    return {
        vehicleId: vehicle.device.id,
        capturedAt: new Date().toISOString(),
        lookbackDays,
        diagnostics: {
            batteryVoltage: vehicle.batteryVoltage,
            fuelLevel: vehicle.fuelLevel,
            stateOfCharge: vehicle.stateOfCharge,
            engineHours: extendedDiagnostics?.engineHours,
            odometer: extendedDiagnostics?.odometer,
            defLevel: extendedDiagnostics?.defLevel,
            coolantTemp: extendedDiagnostics?.coolantTemp,
            engineSpeed: extendedDiagnostics?.engineSpeed,
            electricalSystemRating: extendedDiagnostics?.electricalSystemRating,
        },
        faults: {
            ongoingCount: analysis.ongoingCount,
            severeCount: analysis.severeCount,
            historicalCount: analysis.historicalCount,
            recentFaultLabels: getRecentFaultLabels(faults),
        },
        exceptions: {
            activeCount: exceptions.length,
        },
        dvir: {
            openDefectCount: vehicle.health.dvir.defects.filter(isDvirDefectOpen).length,
            latestInspectionAt: vehicle.health.dvir.lastInspectionAt,
        },
        timeline: {
            lastHeartbeat: vehicle.health.lastHeartbeat,
            dormancyDays: vehicle.dormancyDays,
            zoneDurationHours: vehicle.zoneDurationMs !== null
                ? Math.round((vehicle.zoneDurationMs / (1000 * 60 * 60)) * 10) / 10
                : null,
        },
        dataSources: ['loaded_zone_data', 'asset_health_expansion', 'fault_analysis', 'dvir'],
    };
}
