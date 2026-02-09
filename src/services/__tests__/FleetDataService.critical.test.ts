import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetDataService } from '@/services/FleetDataService';
import type { Device, DeviceStatusInfo, ExceptionEvent, FaultData, VehicleData, Zone } from '@/types/geotab';

const ZONE: Zone = {
    id: 'zone-1',
    name: 'Test Zone',
    points: [
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 }
    ]
};

const DEVICE: Device = {
    id: 'device-1',
    name: 'Vehicle 1',
    serialNumber: 'SN-1'
};

const STATUS: DeviceStatusInfo = {
    device: { id: 'device-1', name: 'Vehicle 1' },
    dateTime: new Date().toISOString(),
    latitude: 0,
    longitude: 0,
    bearing: 0,
    speed: 0,
    currentStateDuration: 'PT0S',
    isDeviceCommunicating: true,
    isDriving: false
};

function createFault(overrides: Partial<FaultData> = {}): FaultData {
    return {
        id: overrides.id ?? `fault-${Math.random()}`,
        device: overrides.device ?? { id: DEVICE.id, name: DEVICE.name },
        diagnostic: overrides.diagnostic ?? { id: 'DiagnosticEngineCheckLightId', name: 'Engine Fault' },
        controller: overrides.controller ?? { id: 'controller-1', name: 'Engine Controller' },
        failureMode: overrides.failureMode ?? { id: 'fm-1', source: 'OBD' },
        faultState: overrides.faultState ?? 'Active',
        dateTime: overrides.dateTime ?? new Date().toISOString(),
        dismissDateTime: overrides.dismissDateTime,
        dismissUser: overrides.dismissUser
    };
}

function createException(overrides: Partial<ExceptionEvent> = {}): ExceptionEvent {
    return {
        id: overrides.id ?? 'ex-1',
        activeFrom: overrides.activeFrom ?? new Date().toISOString(),
        activeTo: overrides.activeTo,
        rule: overrides.rule ?? { id: 'rule-1', name: 'Exception Rule' },
        device: overrides.device ?? { id: DEVICE.id, name: DEVICE.name },
        diagnostic: overrides.diagnostic
    };
}

function createApiMock(options?: {
    faults?: FaultData[];
    exceptions?: ExceptionEvent[];
    fallbackFault?: FaultData;
}) {
    const faults = options?.faults ?? [];
    const exceptions = options?.exceptions ?? [];
    const fallbackFault = options?.fallbackFault;
    const multiCallBatches: Array<Array<{ method: string; params: Record<string, unknown> }>> = [];

    const call = vi.fn(async (_method: string, params: Record<string, unknown>) => {
        const typeName = params.typeName as string | undefined;
        if (typeName === 'Zone') return [ZONE];
        if (typeName === 'DeviceStatusInfo') return [STATUS];
        if (typeName === 'Device') return [DEVICE];
        if (typeName === 'FaultData') return faults;
        if (typeName === 'ExceptionEvent') return exceptions;
        if (typeName === 'User') return [];
        if (typeName === 'DVIRLog') return [];
        return [];
    });

    const multiCall = vi.fn(async (calls: Array<{ method: string; params: Record<string, unknown> }>) => {
        multiCallBatches.push(calls);
        return calls.map((callEntry) => {
            const typeName = callEntry.params.typeName as string | undefined;
            if (typeName === 'FaultData' && fallbackFault) {
                const deviceSearch = callEntry.params.search as { deviceSearch?: { id?: string } } | undefined;
                return deviceSearch?.deviceSearch?.id === DEVICE.id ? [fallbackFault] : [];
            }
            return [];
        });
    });

    return {
        api: {
            call,
            multiCall,
            getSession: async () => ({ database: 'db', userName: 'user', sessionId: 'sid', path: 'my.geotab.com' }),
            isAuthenticated: () => true
        },
        multiCallBatches
    };
}

function createVehicle(): VehicleData {
    return {
        device: DEVICE,
        status: STATUS,
        driverName: 'No Driver',
        makeModel: '--',
        hasCriticalFaults: false,
        hasUnrepairedDefects: false,
        dormancyDays: 0,
        zoneDurationMs: 0,
        isCharging: false,
        health: {
            dvir: { defects: [], isClean: true },
            issues: [],
            faultAnalysis: { items: [], ongoingCount: 0, severeCount: 0, historicalCount: 0 },
            hasRecurringIssues: false,
            isDeviceOffline: false,
            lastHeartbeat: STATUS.dateTime
        },
        activeFaults: []
    };
}

describe('FleetDataService critical context', () => {
    beforeEach(() => {
        (FleetDataService as any)._zoneCriticalCache.clear();
        (FleetDataService as any)._zoneCriticalFetchPromises.clear();
    });

    it('marks vehicle critical for old engine Active fault', async () => {
        const oldActiveFault = createFault({
            faultState: 'Active',
            failureMode: { id: 'fm-1', source: 'OBD', severity: 'Critical' },
            dateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        });
        const { api } = createApiMock({ faults: [oldActiveFault] });
        const service = new FleetDataService(api as any);

        const result = await service.getVehicleDataForZone(ZONE.id);

        expect(result).toHaveLength(1);
        expect(result[0].hasCriticalFaults).toBe(true);
        expect(result[0].activeFaults.length).toBe(1);

        const faultCalls = (api.call as unknown as { mock: { calls: Array<[string, Record<string, unknown>]> } }).mock.calls
            .filter(([, params]) => params.typeName === 'FaultData');
        const exceptionCalls = (api.call as unknown as { mock: { calls: Array<[string, Record<string, unknown>]> } }).mock.calls
            .filter(([, params]) => params.typeName === 'ExceptionEvent');
        expect(faultCalls.length).toBe(1);
        expect(exceptionCalls.length).toBe(1);
    });

    it('does not mark telematics-only faults as critical', async () => {
        const telematicsFault = createFault({
            diagnostic: { id: 'DiagnosticDeviceUnpluggedId', name: 'Telematics Device Fault' },
            controller: { id: 'controller-2', name: 'Telematics Device' },
            failureMode: { id: 'fm-2', source: 'Telematics' }
        });
        const { api } = createApiMock({ faults: [telematicsFault] });
        const service = new FleetDataService(api as any);

        const result = await service.getVehicleDataForZone(ZONE.id);

        expect(result[0].hasCriticalFaults).toBe(false);
    });

    it('does not mark low-severity active engine faults as critical', async () => {
        const lowSeverityFault = createFault({
            faultState: 'Active',
            failureMode: { id: 'fm-3', source: 'OBD', severity: 'Info' }
        });
        const { api } = createApiMock({ faults: [lowSeverityFault] });
        const service = new FleetDataService(api as any);

        const result = await service.getVehicleDataForZone(ZONE.id);

        expect(result[0].hasCriticalFaults).toBe(false);
    });

    it('keeps active exceptions informational while surfacing summary count', async () => {
        const activeException = createException({ activeTo: '2050-01-01T00:00:00.000Z' });
        const { api } = createApiMock({ exceptions: [activeException] });
        const service = new FleetDataService(api as any);

        const result = await service.getVehicleDataForZone(ZONE.id);

        expect(result[0].hasCriticalFaults).toBe(false);
        expect(result[0].health.exceptionSummary?.activeCount).toBe(1);
    });

    it('ignores dismissed engine faults for critical status', async () => {
        const dismissedFault = createFault({
            dismissDateTime: new Date().toISOString()
        });
        const { api } = createApiMock({ faults: [dismissedFault] });
        const service = new FleetDataService(api as any);

        const result = await service.getVehicleDataForZone(ZONE.id);

        expect(result[0].hasCriticalFaults).toBe(false);
        expect(result[0].activeFaults.length).toBe(0);
    });

    it('uses fallback per-device fetch when aggregate fault result limit is hit', async () => {
        const overflowFaults = Array.from({ length: 5000 }, (_, index) => createFault({
            id: `overflow-${index}`,
            device: { id: 'other-device', name: 'Other Vehicle' }
        }));
        const fallbackFault = createFault({
            id: 'fallback-critical',
            failureMode: { id: 'fm-1', source: 'OBD', severity: 'Critical' }
        });
        const { api } = createApiMock({ faults: overflowFaults, fallbackFault });
        const service = new FleetDataService(api as any);

        const context = await (service as any).fetchZoneCriticalContext(new Set([DEVICE.id]), ZONE.id);

        expect(context.criticalByDevice.has(DEVICE.id)).toBe(true);
        expect(context.faultsByDevice.get(DEVICE.id)?.length).toBe(1);
    });
});

describe('FleetDataService enrichment performance shape', () => {
    beforeEach(() => {
        (FleetDataService as any)._zoneCriticalCache.clear();
        (FleetDataService as any)._zoneCriticalFetchPromises.clear();
    });

    it('does not issue per-device FaultData calls during enrichment', async () => {
        const { api, multiCallBatches } = createApiMock();
        const service = new FleetDataService(api as any);

        await service.enrichVehicleData([createVehicle(), createVehicle()]);

        const allCalls = multiCallBatches.flat();
        const hasFaultDataCall = allCalls.some((entry) => entry.params.typeName === 'FaultData');
        expect(hasFaultDataCall).toBe(false);
    });
});
