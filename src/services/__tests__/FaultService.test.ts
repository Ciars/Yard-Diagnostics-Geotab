import { describe, expect, it } from 'vitest';
import { isActiveExceptionCritical, isOngoingEngineFault, isRoadworthyCriticalEngineFault } from '@/services/FaultService';
import type { ExceptionEvent, FaultData } from '@/types/geotab';

function createFault(overrides: Partial<FaultData> = {}): FaultData {
    return {
        id: overrides.id ?? 'fault-1',
        device: overrides.device ?? { id: 'device-1', name: 'Vehicle 1' },
        diagnostic: overrides.diagnostic ?? { id: 'DiagnosticEngineCheckLightId', name: 'Engine Fault' },
        controller: overrides.controller ?? { id: 'controller-1', name: 'Engine Controller' },
        failureMode: overrides.failureMode ?? { id: 'fm-1', source: 'OBD' },
        faultState: overrides.faultState ?? 'Active',
        dateTime: overrides.dateTime ?? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        dismissDateTime: overrides.dismissDateTime,
        dismissUser: overrides.dismissUser
    };
}

function createException(overrides: Partial<ExceptionEvent> = {}): ExceptionEvent {
    return {
        id: overrides.id ?? 'ex-1',
        activeFrom: overrides.activeFrom ?? new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        activeTo: overrides.activeTo,
        rule: overrides.rule ?? { id: 'rule-1', name: 'Engine Alert Rule' },
        device: overrides.device ?? { id: 'device-1', name: 'Vehicle 1' },
        diagnostic: overrides.diagnostic
    };
}

describe('isOngoingEngineFault', () => {
    it('treats engine Active state as ongoing even when older than 24h', () => {
        const fault = createFault({
            faultState: 'Active',
            dateTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        });

        expect(isOngoingEngineFault(fault)).toBe(true);
    });

    it('excludes telematics faults', () => {
        const fault = createFault({
            diagnostic: { id: 'DiagnosticDeviceUnpluggedId', name: 'Telematics Device Fault' },
            controller: { id: 'controller-2', name: 'Telematics Device' },
            failureMode: { id: 'fm-2', source: 'Telematics' }
        });

        expect(isOngoingEngineFault(fault)).toBe(false);
    });

    it('ignores dismissed faults', () => {
        const fault = createFault({
            dismissDateTime: new Date().toISOString()
        });

        expect(isOngoingEngineFault(fault)).toBe(false);
    });

    it('does not treat missing fault state as ongoing', () => {
        const fault = createFault();
        delete (fault as { faultState?: string }).faultState;

        expect(isOngoingEngineFault(fault)).toBe(false);
    });

    it('does not treat pending-only engine faults as ongoing list issues', () => {
        const fault = createFault({
            faultState: 'Pending'
        });

        expect(isOngoingEngineFault(fault)).toBe(false);
    });
});

describe('isRoadworthyCriticalEngineFault', () => {
    it('marks severe active engine faults as critical', () => {
        const fault = createFault({
            faultState: 'Active',
            failureMode: { id: 'fm-1', source: 'OBD', severity: 'Critical' }
        });

        expect(isRoadworthyCriticalEngineFault(fault)).toBe(true);
    });

    it('keeps non-severe active engine faults out of critical', () => {
        const fault = createFault({
            faultState: 'Active',
            failureMode: { id: 'fm-1', source: 'OBD', severity: 'Info' }
        });

        expect(isRoadworthyCriticalEngineFault(fault)).toBe(false);
    });

    it('keeps pending-active engine faults out of critical when no severe signal exists', () => {
        const fault = createFault({
            faultState: 'PendingActive',
            failureMode: { id: 'fm-1', source: 'OBD', severity: 'Info' }
        });

        expect(isRoadworthyCriticalEngineFault(fault)).toBe(false);
    });
});

describe('isActiveExceptionCritical', () => {
    it('returns true for open-ended exceptions', () => {
        const exception = createException({ activeTo: undefined });
        expect(isActiveExceptionCritical(exception)).toBe(true);
    });

    it('returns true for max-date exceptions', () => {
        const exception = createException({ activeTo: '2050-01-01T00:00:00.000Z' });
        expect(isActiveExceptionCritical(exception)).toBe(true);
    });

    it('returns false for expired exceptions', () => {
        const exception = createException({ activeTo: '2024-01-01T00:00:00.000Z' });
        expect(isActiveExceptionCritical(exception, new Date('2026-01-01T00:00:00.000Z').getTime())).toBe(false);
    });
});
