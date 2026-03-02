import type { KpiCounts, VehicleData } from '@/types/geotab';
import type {
    RaiContextSnapshot,
    RaiSuggestedPrompt,
    RaiVehicleDetailSnapshot,
    RaiVehicleReference,
} from '@/features/rai/types';

const MAX_VISIBLE_CONTEXT_VEHICLES = 40;

export interface BuildRaiContextArgs {
    selectedZoneId: string | null;
    selectedZoneName: string | null;
    activeKpiFilter: string | null;
    searchQuery: string;
    sortField: string;
    sortDirection: string;
    expandedVehicleId: string | null;
    kpis: KpiCounts;
    vehicles: VehicleData[];
    visibleVehicles: VehicleData[];
    expandedDetailByVehicleId: Record<string, RaiVehicleDetailSnapshot>;
}

function toZoneDurationHours(zoneDurationMs: number | null): number | null {
    if (zoneDurationMs === null) return null;
    if (!Number.isFinite(zoneDurationMs)) return null;
    return Math.round((zoneDurationMs / (1000 * 60 * 60)) * 10) / 10;
}

function toVehicleReference(vehicle: VehicleData): RaiVehicleReference {
    return {
        id: vehicle.device.id,
        name: vehicle.device.name,
        driverName: vehicle.driverName,
        isOffline: vehicle.health.isDeviceOffline,
        isCharging: vehicle.isCharging,
        hasCriticalFaults: vehicle.hasCriticalFaults,
        hasUnrepairedDefects: vehicle.hasUnrepairedDefects,
        dormancyDays: vehicle.dormancyDays,
        zoneDurationHours: toZoneDurationHours(vehicle.zoneDurationMs),
    };
}

export function buildRaiContextSnapshot(args: BuildRaiContextArgs): RaiContextSnapshot {
    const {
        selectedZoneId,
        selectedZoneName,
        activeKpiFilter,
        searchQuery,
        sortField,
        sortDirection,
        expandedVehicleId,
        kpis,
        vehicles,
        visibleVehicles,
        expandedDetailByVehicleId,
    } = args;

    const expandedVehicle = expandedVehicleId
        ? vehicles.find((vehicle) => vehicle.device.id === expandedVehicleId) ?? null
        : null;

    const visibleReferences = visibleVehicles
        .slice(0, MAX_VISIBLE_CONTEXT_VEHICLES)
        .map(toVehicleReference);

    return {
        builtAt: new Date().toISOString(),
        app: {
            selectedZoneId,
            selectedZoneName,
            activeKpiFilter,
            searchQuery,
            sortField,
            sortDirection,
            expandedVehicleId,
            kpis,
        },
        summary: {
            totalVehiclesInZone: vehicles.length,
            visibleVehicles: visibleVehicles.length,
            criticalCount: kpis.critical,
            silentCount: kpis.silent,
            chargingCount: kpis.charging,
            dormantCount: kpis.dormant,
            unrepairedDvirCount: vehicles.filter((vehicle) => vehicle.hasUnrepairedDefects).length,
        },
        focus: {
            expandedVehicleId,
            expandedVehicleName: expandedVehicle?.device.name ?? null,
            detail: expandedVehicleId ? expandedDetailByVehicleId[expandedVehicleId] ?? null : null,
        },
        visibleVehicles: visibleReferences,
        entityReferences: {
            zoneId: selectedZoneId,
            vehicleIds: vehicles.map((vehicle) => vehicle.device.id),
            visibleVehicleIds: visibleVehicles.map((vehicle) => vehicle.device.id),
        },
    };
}

export function buildRaiSuggestedPrompts(context: RaiContextSnapshot): RaiSuggestedPrompt[] {
    const prompts: RaiSuggestedPrompt[] = [];

    if (context.app.selectedZoneName) {
        prompts.push({
            id: 'dispatch-risk',
            label: 'Top dispatch risks',
            prompt: `What are my top dispatch risks in ${context.app.selectedZoneName} right now?`,
        });
    }

    if (context.summary.criticalCount > 0 || context.summary.unrepairedDvirCount > 0) {
        prompts.push({
            id: 'critical-triage',
            label: 'Critical triage plan',
            prompt: 'Rank the highest-risk vehicles and give a next-hour triage plan.',
        });
    }

    if (context.summary.silentCount > 0 || context.summary.dormantCount > 0) {
        prompts.push({
            id: 'silent-dormant',
            label: 'Silent and dormant focus',
            prompt: 'Which silent or dormant assets should dispatch or maintenance investigate first?',
        });
    }

    if (context.focus.expandedVehicleId && context.focus.expandedVehicleName) {
        prompts.push({
            id: 'focused-vehicle',
            label: 'Analyze focused vehicle',
            prompt: `Analyze ${context.focus.expandedVehicleName} and explain immediate actions with confidence levels.`,
        });
    }

    prompts.push({
        id: 'operational-brief',
        label: 'Shift handover brief',
        prompt: 'Create a concise shift handover brief with ranked risks and recommended actions.',
    });

    return prompts.slice(0, 4);
}
