import { describe, expect, it } from 'vitest';
import type { KpiCounts, VehicleData } from '@/types/geotab';
import type { RaiVehicleDetailSnapshot } from '@/features/rai/types';
import { buildRaiContextSnapshot, buildRaiSuggestedPrompts } from '@/features/rai/context/raiContextBuilder';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
    return {
        device: {
            id: 'v-1',
            name: 'Vehicle 1',
            serialNumber: 'SN-1',
        },
        status: {
            device: { id: 'v-1' },
            currentStateDuration: 'PT5M',
            isDeviceCommunicating: true,
            isDriving: false,
            speed: 0,
            bearing: 0,
            latitude: 53,
            longitude: -6,
            dateTime: '2026-03-02T10:00:00.000Z',
        },
        isCharging: false,
        dormancyDays: null,
        zoneDurationMs: 60 * 60 * 1000,
        hasCriticalFaults: false,
        hasUnrepairedDefects: false,
        health: {
            dvir: {
                defects: [],
                isClean: true,
            },
            issues: [],
            hasRecurringIssues: false,
            isDeviceOffline: false,
            lastHeartbeat: '2026-03-02T10:00:00.000Z',
        },
        activeFaults: [],
        ...overrides,
    } as VehicleData;
}

const KPI_COUNTS: KpiCounts = {
    critical: 2,
    silent: 1,
    dormant: 1,
    charging: 1,
    camera: 0,
};

const DETAIL: RaiVehicleDetailSnapshot = {
    vehicleId: 'v-2',
    capturedAt: '2026-03-02T12:00:00.000Z',
    lookbackDays: 30,
    diagnostics: {},
    faults: {
        ongoingCount: 3,
        severeCount: 1,
        historicalCount: 2,
        recentFaultLabels: ['Battery low'],
    },
    exceptions: { activeCount: 1 },
    dvir: { openDefectCount: 2 },
    timeline: {
        dormancyDays: 4,
        zoneDurationHours: 8,
    },
    dataSources: ['asset_health_expansion'],
};

describe('buildRaiContextSnapshot', () => {
    it('builds summary context and includes focus detail for expanded vehicle', () => {
        const vehicles = [
            vehicle(),
            vehicle({
                device: { id: 'v-2', name: 'Vehicle 2', serialNumber: 'SN-2' },
                hasCriticalFaults: true,
                hasUnrepairedDefects: true,
                dormancyDays: 4,
                isCharging: true,
            }),
        ];

        const snapshot = buildRaiContextSnapshot({
            selectedZoneId: 'zone-1',
            selectedZoneName: 'Dublin Yard',
            activeKpiFilter: 'critical',
            searchQuery: 'veh',
            sortField: 'duration',
            sortDirection: 'desc',
            expandedVehicleId: 'v-2',
            kpis: KPI_COUNTS,
            vehicles,
            visibleVehicles: vehicles,
            expandedDetailByVehicleId: {
                'v-2': DETAIL,
            },
        });

        expect(snapshot.summary.totalVehiclesInZone).toBe(2);
        expect(snapshot.summary.unrepairedDvirCount).toBe(1);
        expect(snapshot.focus.expandedVehicleName).toBe('Vehicle 2');
        expect(snapshot.focus.detail?.faults.ongoingCount).toBe(3);
        expect(snapshot.entityReferences.vehicleIds).toEqual(['v-1', 'v-2']);
    });

    it('returns context-sensitive suggested prompts', () => {
        const snapshot = buildRaiContextSnapshot({
            selectedZoneId: 'zone-1',
            selectedZoneName: 'Dublin Yard',
            activeKpiFilter: null,
            searchQuery: '',
            sortField: 'duration',
            sortDirection: 'desc',
            expandedVehicleId: null,
            kpis: KPI_COUNTS,
            vehicles: [vehicle()],
            visibleVehicles: [vehicle()],
            expandedDetailByVehicleId: {},
        });

        const prompts = buildRaiSuggestedPrompts(snapshot);
        expect(prompts.length).toBeGreaterThan(1);
        expect(prompts.some((prompt) => prompt.label.toLowerCase().includes('dispatch'))).toBe(true);
    });
});
