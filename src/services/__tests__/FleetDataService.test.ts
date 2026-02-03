/**
 * Unit tests for FleetDataService.calculateKpis
 * 
 * Tests the KPI calculation logic for critical faults, silent assets, 
 * dormant vehicles, and charging status.
 */

import { describe, it, expect } from 'vitest';
import { FleetDataService } from '@/services/FleetDataService';
import type { VehicleData } from '@/types/geotab';

describe('FleetDataService.calculateKpis', () => {
    it('should calculate zero KPIs for empty vehicle list', () => {
        const kpis = FleetDataService.calculateKpis([]);

        expect(kpis).toEqual({
            critical: 0,
            silent: 0,
            dormant: 0,
            charging: 0,
        });
    });

    it('should count vehicles with critical faults', () => {
        const vehicles: VehicleData[] = [
            createMockVehicle({ hasCriticalFaults: true }),
            createMockVehicle({ hasCriticalFaults: false }),
            createMockVehicle({ hasUnrepairedDefects: true }), // Also counts as critical
        ];

        const kpis = FleetDataService.calculateKpis(vehicles);

        expect(kpis.critical).toBe(2);
    });

    it('should count vehicles with unrepaired defects as critical', () => {
        const vehicles: VehicleData[] = [
            createMockVehicle({ hasUnrepairedDefects: true }),
        ];

        const kpis = FleetDataService.calculateKpis(vehicles);

        expect(kpis.critical).toBe(1);
    });

    it('should count silent assets (not communicating)', () => {
        const vehicles: VehicleData[] = [
            createMockVehicle({ isDeviceCommunicating: false }),
            createMockVehicle({ isDeviceCommunicating: true }),
        ];

        const kpis = FleetDataService.calculateKpis(vehicles);

        expect(kpis.silent).toBe(1);
    });

    it('should count silent assets (old data, > 24h)', () => {
        const now = new Date();
        const vehicles: VehicleData[] = [
            createMockVehicle({
                isDeviceCommunicating: true,
                statusDateTime: new Date(now.getTime() - 25 * 60 * 60 * 1000) // 25 hours ago
            }),
            createMockVehicle({
                isDeviceCommunicating: true,
                statusDateTime: new Date(now.getTime() - 1 * 60 * 60 * 1000) // 1 hour ago
            }),
        ];

        const kpis = FleetDataService.calculateKpis(vehicles);

        expect(kpis.silent).toBe(1);
    });

    it('should count dormant vehicles (>= 7 days)', () => {
        const vehicles: VehicleData[] = [
            createMockVehicle({ dormancyDays: 10 }),
            createMockVehicle({ dormancyDays: 7 }), // Exactly 7 = dormant
            createMockVehicle({ dormancyDays: 6 }),
            createMockVehicle({ dormancyDays: undefined }), // Missing data
        ];

        const kpis = FleetDataService.calculateKpis(vehicles);

        expect(kpis.dormant).toBe(2);
    });

    it('should count charging vehicles', () => {
        const vehicles: VehicleData[] = [
            createMockVehicle({ isCharging: true }),
            createMockVehicle({ isCharging: false }),
            createMockVehicle({ isCharging: true }),
        ];

        const kpis = FleetDataService.calculateKpis(vehicles);

        expect(kpis.charging).toBe(2);
    });

    it('should handle vehicles with multiple KPI flags', () => {
        const vehicles: VehicleData[] = [
            createMockVehicle({
                hasCriticalFaults: true,
                isDeviceCommunicating: false,
                dormancyDays: 10,
                isCharging: false
            }),
        ];

        const kpis = FleetDataService.calculateKpis(vehicles);

        expect(kpis.critical).toBe(1);
        expect(kpis.silent).toBe(1);
        expect(kpis.dormant).toBe(1);
        expect(kpis.charging).toBe(0);
    });
});

// Helper to create mock vehicle data
function createMockVehicle(overrides: Partial<{
    hasCriticalFaults: boolean;
    hasUnrepairedDefects: boolean;
    isDeviceCommunicating: boolean;
    statusDateTime: Date;
    dormancyDays: number | undefined;
    isCharging: boolean;
}> = {}): VehicleData {
    const now = new Date();

    return {
        device: {
            id: 'device-' + Math.random(),
            name: 'Test Vehicle',
            serialNumber: '123456',
            vehicleIdentificationNumber: 'VIN123',
            deviceType: { id: 'GO9', name: 'GO9' },
            groups: [],
            comments: '',
        },
        status: {
            device: { id: 'device-1' },
            dateTime: overrides.statusDateTime?.toISOString() || now.toISOString(),
            latitude: 0,
            longitude: 0,
            bearing: 0,
            speed: 0,
            isDeviceCommunicating: overrides.isDeviceCommunicating ?? true,
        },
        driver: null,
        make: 'TestMake',
        model: 'TestModel',
        year: 2023,
        diagnostics: {
            fuelLevel: 0,
            stateOfCharge: 0,
            batteryVoltage: 0,
            currentDriver: null,
        },
        hasCriticalFaults: overrides.hasCriticalFaults ?? false,
        hasUnrepairedDefects: overrides.hasUnrepairedDefects ?? false,
        dormancyDays: overrides.dormancyDays,
        stayDuration: null,
        isCharging: overrides.isCharging ?? false,
    };
}
