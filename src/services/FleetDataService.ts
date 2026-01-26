/**
 * Fleet Data Service
 * 
 * Provides high-level data fetching operations using the zone-first strategy.
 * All methods use batched multicall for optimal performance with 10k+ vehicles.
 */

import type { IGeotabApi } from './GeotabApiFactory';
import type {
    Zone,
    Device,
    DeviceStatusInfo,
    StatusData,
    FaultData,
    VehicleData,
    ApiCall,
    DiagnosticId,
} from '@/types/geotab';
// import { DiagnosticIds } from '@/types/geotab'; // Unused in direct string usage
import { isPointInPolygon } from '@/lib/geoUtils';
// import { processVehicleIssues, hasRecurringIssues } from './IssueService';

// =============================================================================
// Constants
// =============================================================================

const BATCH_SIZE = 5; // Small batch for progressive loading
const DORMANCY_THRESHOLD_DAYS = 14;
const SILENT_THRESHOLD_HOURS = 24;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Split array into chunks for batched processing
 */
function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Calculate hours since a date
 */
function hoursSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
}

// =============================================================================
// Fleet Data Service
// =============================================================================

import { VinDecoderService } from './VinDecoderService';

export class FleetDataService {
    private api: IGeotabApi;
    private vinDecoder: VinDecoderService;
    // private _faultLoggedOnce = false;

    constructor(api: IGeotabApi) {
        this.api = api;
        this.vinDecoder = new VinDecoderService(api);
    }

    /**
     * Fetch all zones (yards/depots)
     */
    async getZones(): Promise<Zone[]> {
        const zones = await this.api.call<Zone[]>('Get', {
            typeName: 'Zone',
            search: {
                // Optional: filter by zone type if needed
                // zoneTypes: [{ id: 'ZoneTypeCustomerId' }]
            },
        });

        return zones.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Fetch devices currently in a specific zone
     */
    async getDevicesInZone(zone: Zone): Promise<DeviceStatusInfo[]> {
        const allStatuses = await this.api.call<DeviceStatusInfo[]>('Get', {
            typeName: 'DeviceStatusInfo',
            search: {},
        });

        const devicesInZone = allStatuses.filter((status) => {
            return isPointInPolygon({ x: status.longitude, y: status.latitude }, zone.points);
        });

        return devicesInZone;
    }

    /**
     * Fetch complete vehicle data for devices in a zone
     * Uses Two-Stage Batched MultiCall for Fault Tolerance
     */
    async getVehicleDataForZone(zone: Zone): Promise<VehicleData[]> {
        // Step 1: Get devices in zone
        const statusInfos = await this.getDevicesInZone(zone);

        if (statusInfos.length === 0) {
            console.log('[FleetDataService] No devices found in zone.');
            return [];
        }

        console.log(`[FleetDataService] Found ${statusInfos.length} devices in zone. Fetching details...`);

        const deviceIds = statusInfos.map((s) => s.device.id);

        const vehicleData: VehicleData[] = [];
        const batches = chunk(deviceIds, BATCH_SIZE);

        for (const batch of batches) {
            // STAGE 1: Critical Identity Data (Names & VINs) - MUST SUCCEED
            const identityCalls: ApiCall[] = batch.map((deviceId) => ({
                method: 'Get',
                params: {
                    typeName: 'Device',
                    search: { id: deviceId },
                    resultsLimit: 1,
                },
            }));

            let identityResults: unknown[] | undefined;
            try {
                identityResults = await this.api.multiCall<unknown[]>(identityCalls);
            } catch (err) {
                console.error('[FleetDataService] Identity Batch Failed:', err);
                // If this fails, we fall back to StatusInfo names (Skeleton)
            }

            // STAGE 2: Enrichment Data (Status, Driver, Fuel) - OPTIONAL
            // We build specific calls for each device
            const enrichmentCalls: ApiCall[] = batch.flatMap((deviceId) => {
                const statusInfo = statusInfos.find(s => s.device.id === deviceId);
                const driverId = statusInfo?.driver?.id;

                return [
                    // Fuel
                    {
                        method: 'Get',
                        params: {
                            typeName: 'StatusData',
                            search: {
                                deviceSearch: { id: deviceId },
                                diagnosticSearch: { id: 'DiagnosticDeviceTotalFuelId' },
                                fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                            },
                            resultsLimit: 1,
                        },
                    },
                    // SOC
                    {
                        method: 'Get',
                        params: {
                            typeName: 'StatusData',
                            search: {
                                deviceSearch: { id: deviceId },
                                diagnosticSearch: { id: 'DiagnosticStateOfChargeId' },
                                fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                            },
                            resultsLimit: 1,
                        },
                    },
                    // Driver (User) - Only call if we have an ID to look up
                    driverId ? {
                        method: 'Get',
                        params: {
                            typeName: 'User',
                            search: { id: driverId },
                            resultsLimit: 1
                        }
                    } : {
                        // Dummy call to maintain array stride of 3 per vehicle
                        method: 'Get',
                        params: {
                            typeName: 'User',
                            resultsLimit: 0,
                            search: { id: 'NoDriver' }
                        }
                    }
                ];
            });

            let enrichmentResults: unknown[] | undefined;
            try {
                enrichmentResults = await this.api.multiCall<unknown[]>(enrichmentCalls);
            } catch (err) {
                console.warn('[FleetDataService] Enrichment Batch Failed (Partial Data Mode):', err);
                // We proceed with what we have from Identity
            }

            // MERGE RESULTS
            for (let i = 0; i < batch.length; i++) {
                const deviceId = batch[i];
                const statusInfo = statusInfos.find((s) => s.device.id === deviceId);

                if (!statusInfo) continue;

                // 1. Identity
                const identityData = identityResults ? (identityResults[i] as Device[]) : undefined;
                const device = identityData?.[0];

                // 2. Enrichment (Stride = 3)
                const enrichBase = i * 3;
                let fuelLevel: number | undefined;
                let stateOfCharge: number | undefined;
                let driverName = statusInfo.driver?.name || 'Unknown';

                if (enrichmentResults) {
                    const fuelData = (enrichmentResults[enrichBase] as StatusData[]) || [];
                    const socData = (enrichmentResults[enrichBase + 1] as StatusData[]) || [];
                    const userData = (enrichmentResults[enrichBase + 2] as any[]) || [];

                    fuelLevel = fuelData?.[0]?.data;
                    stateOfCharge = socData?.[0]?.data;

                    const user = userData?.[0];
                    if (user) {
                        if (user.firstName && user.lastName) driverName = `${user.firstName} ${user.lastName}`;
                        else if (user.name) driverName = user.name;
                    }
                }

                // Standard Defaults
                const isCharging = false;
                const dormancyDays = null;
                const zoneEntryTime = statusInfo.dateTime;
                const zoneDurationMs = Math.max(0, Date.now() - new Date(statusInfo.dateTime).getTime());
                const isZoneEntryEstimate = true;
                const hasCriticalFaults = false;
                const hasUnrepairedDefects = false;
                const allFaults: FaultData[] = [];
                const dvirDefectsList: any[] = [];
                const vehicleIssues: any[] = [];

                // Decode VIN for Make/Model (Cached check)
                const vin = device?.vehicleIdentificationNumber;
                let makeModel: string | undefined = undefined;
                if (vin) {
                    const cached = this.vinDecoder.getCached(vin);
                    if (cached) makeModel = VinDecoderService.formatMakeModel(cached);
                }

                // Create basic skeleton if no device - but keep statusInfo
                const finalDevice = device || {
                    id: deviceId,
                    name: statusInfo.device.name ?? 'Unknown',
                    serialNumber: 'Unknown',
                    vehicleIdentificationNumber: '?'
                };

                vehicleData.push({
                    device: finalDevice,
                    status: statusInfo,
                    driverName,
                    makeModel,
                    batteryVoltage: undefined,
                    fuelLevel,
                    stateOfCharge,
                    isCharging,
                    dormancyDays,
                    zoneEntryTime,
                    zoneDurationMs,
                    isZoneEntryEstimate,
                    hasCriticalFaults,
                    health: {
                        dvir: { isClean: true, defects: dvirDefectsList },
                        issues: vehicleIssues,
                        hasRecurringIssues: false,
                        isDeviceOffline: !statusInfo.isDeviceCommunicating,
                        lastHeartbeat: statusInfo.dateTime,
                    },
                    hasUnrepairedDefects,
                    activeFaults: allFaults,
                    lastTrip: undefined,
                    serviceDueDays: undefined,
                });
            }
        }

        // Step 3: Batch decode newly found VINs
        const allVins = vehicleData
            .map(v => v.device.vehicleIdentificationNumber)
            .filter((vin): vin is string => !!vin && vin.length >= 11 && vin !== '?');

        if (allVins.length > 0) {
            try {
                await this.vinDecoder.decodeVins(allVins);
                // Re-apply Make/Model from cache
                for (const vehicle of vehicleData) {
                    const vin = vehicle.device.vehicleIdentificationNumber;
                    if (vin && vin !== '?') {
                        const cached = this.vinDecoder.getCached(vin);
                        if (cached) vehicle.makeModel = VinDecoderService.formatMakeModel(cached);
                    }
                }
            } catch (err) {
                console.warn('[FleetDataService] VIN Decode Failed:', err);
            }
        }

        return vehicleData;
    }

    /**
     * Fetch specific diagnostic data for a device
     */
    async getDiagnosticData(
        deviceId: string,
        diagnosticId: DiagnosticId,
        fromDate?: string
    ): Promise<StatusData[]> {
        return this.api.call<StatusData[]>('Get', {
            typeName: 'StatusData',
            search: {
                deviceSearch: { id: deviceId },
                diagnosticSearch: { id: diagnosticId },
                fromDate: fromDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            },
        });
    }

    /**
     * Calculate KPI counts from vehicle data
     */
    static calculateKpis(vehicles: VehicleData[]) {
        return {
            critical: vehicles.filter(
                (v) => v.hasCriticalFaults || v.hasUnrepairedDefects
            ).length,
            silent: vehicles.filter(
                (v) => !v.status.isDeviceCommunicating ||
                    hoursSince(v.status.dateTime) > SILENT_THRESHOLD_HOURS
            ).length,
            dormant: vehicles.filter(
                (v) => v.dormancyDays === null || v.dormancyDays >= DORMANCY_THRESHOLD_DAYS
            ).length,
            charging: vehicles.filter((v) => v.isCharging).length,
            serviceDue: vehicles.filter(
                (v) => v.serviceDueDays !== undefined && v.serviceDueDays <= 14
            ).length,
        };
    }

    /**
     * Get vehicle counts for all zones
     */
    async getZoneVehicleCounts(zones: Zone[]): Promise<Record<string, number>> {
        const allStatuses = await this.api.call<DeviceStatusInfo[]>('Get', {
            typeName: 'DeviceStatusInfo',
            search: {},
        });

        const counts: Record<string, number> = {};
        zones.forEach(z => counts[z.id] = 0);

        for (const status of allStatuses) {
            const point = { x: status.longitude, y: status.latitude };
            for (const zone of zones) {
                if (isPointInPolygon(point, zone.points)) {
                    counts[zone.id]++;
                    break;
                }
            }
        }
        return counts;
    }

    /**
    * Helper to create a basic vehicle record from just StatusInfo
    * Used when enrichment APIs fail or are restricted.
    */
}
