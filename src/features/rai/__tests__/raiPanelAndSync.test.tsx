import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { KpiCounts, VehicleData } from '@/types/geotab';
import type { RaiVehicleDetailSnapshot } from '@/features/rai/types';
import { RaiPanel } from '@/features/rai/components/RaiPanel';
import { buildRaiContextSnapshot } from '@/features/rai/context/raiContextBuilder';

const noop = () => { };

describe('RaiPanel', () => {
    it('renders closed and open states', () => {
        const closedMarkup = renderToStaticMarkup(
            <RaiPanel
                isOpen={false}
                draft=""
                setDraft={noop}
                messages={[]}
                isSending={false}
                pendingToolCalls={[]}
                lastError={null}
                badges={[]}
                suggestedPrompts={[]}
                onClose={noop}
                onSend={noop}
                onCancel={noop}
                onRetry={noop}
            />
        );

        const openMarkup = renderToStaticMarkup(
            <RaiPanel
                isOpen
                draft=""
                setDraft={noop}
                messages={[]}
                isSending={false}
                pendingToolCalls={[]}
                lastError={null}
                badges={[]}
                suggestedPrompts={[]}
                onClose={noop}
                onSend={noop}
                onCancel={noop}
                onRetry={noop}
            />
        );

        expect(closedMarkup.includes('rai-panel--open')).toBe(false);
        expect(openMarkup.includes('rai-panel--open')).toBe(true);
    });
});

function makeVehicle(id: string): VehicleData {
    return {
        device: { id, name: id, serialNumber: id },
        status: {
            device: { id },
            currentStateDuration: 'PT1M',
            isDeviceCommunicating: true,
            isDriving: false,
            speed: 0,
            bearing: 0,
            latitude: 53,
            longitude: -6,
            dateTime: '2026-03-02T00:00:00.000Z',
        },
        isCharging: false,
        dormancyDays: null,
        zoneDurationMs: null,
        hasCriticalFaults: false,
        hasUnrepairedDefects: false,
        health: {
            dvir: { defects: [], isClean: true },
            issues: [],
            hasRecurringIssues: false,
            isDeviceOffline: false,
            lastHeartbeat: '2026-03-02T00:00:00.000Z',
        },
        activeFaults: [],
    } as VehicleData;
}

const KPI: KpiCounts = { critical: 0, silent: 0, dormant: 0, charging: 0, camera: 0 };

const DETAIL: RaiVehicleDetailSnapshot = {
    vehicleId: 'v-focus',
    capturedAt: '2026-03-02T00:00:00.000Z',
    lookbackDays: 30,
    diagnostics: {},
    faults: { ongoingCount: 1, severeCount: 1, historicalCount: 1, recentFaultLabels: ['Fault'] },
    exceptions: { activeCount: 0 },
    dvir: { openDefectCount: 0 },
    timeline: { dormancyDays: null, zoneDurationHours: null },
    dataSources: ['asset_health_expansion'],
};

describe('Rai context sync for expanded row detail', () => {
    it('includes expanded detail when an expanded vehicle id is present', () => {
        const snapshot = buildRaiContextSnapshot({
            selectedZoneId: 'zone-1',
            selectedZoneName: 'Zone 1',
            activeKpiFilter: null,
            searchQuery: '',
            sortField: 'duration',
            sortDirection: 'desc',
            expandedVehicleId: 'v-focus',
            kpis: KPI,
            vehicles: [makeVehicle('v-focus')],
            visibleVehicles: [makeVehicle('v-focus')],
            expandedDetailByVehicleId: {
                'v-focus': DETAIL,
            },
        });

        expect(snapshot.focus.expandedVehicleId).toBe('v-focus');
        expect(snapshot.focus.detail?.faults.severeCount).toBe(1);
    });
});
