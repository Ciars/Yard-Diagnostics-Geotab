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
    DiagnosticId,
    User,
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
     * Uses Parallel Single Calls (Promise.all) instead of MultiCall for maximum robustness
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
            // ====================================================================================================
            // STAGE 1: Critical Identity Data (Names & VINs) - PARALLEL SINGLE CALLS
            // Switch from MultiCall to Promise.all to prevent batch crashes
            // ====================================================================================================

            const identityPromises = batch.map(async (deviceId) => {
                try {
                    const result = await this.api.call<Device[]>('Get', {
                        typeName: 'Device',
                        search: { id: deviceId },
                        resultsLimit: 1,
                    });
                    return result?.[0] || null;
                } catch (err) {
                    console.warn(`[FleetDataService] Failed to fetch Device identity for ${deviceId}:`, err);
                    return null;
                }
            });

            const identityResults = await Promise.all(identityPromises);

            // ====================================================================================================
            // STAGE 2: Enrichment Data (Status, Driver, Fuel) - PARALLEL SETTLED
            // We fetch enrichment parallel to identity to save time? No, let's keep it sequential for now to be safe.
            // ====================================================================================================

            const enrichmentPromises = batch.map(async (deviceId) => {
                const statusInfo = statusInfos.find(s => s.device.id === deviceId);
                const driverId = statusInfo?.driver?.id;

                // We define the calls we want to make
                const fuelCall = this.api.call<StatusData[]>('Get', {
                    typeName: 'StatusData',
                    search: {
                        deviceSearch: { id: deviceId },
                        diagnosticSearch: { id: 'DiagnosticDeviceTotalFuelId' },
                        fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    },
                    resultsLimit: 1,
                });

                const socCall = this.api.call<StatusData[]>('Get', {
                    typeName: 'StatusData',
                    search: {
                        deviceSearch: { id: deviceId },
                        diagnosticSearch: { id: 'DiagnosticStateOfChargeId' },
                        fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    },
                    resultsLimit: 1,
                });

                const driverCall = driverId ? this.api.call<User[]>('Get', {
                    typeName: 'User',
                    search: { id: driverId },
                    resultsLimit: 1
                }) : Promise.resolve([]);

                // Use allSettled so one failure (e.g. Driver 403) doesn't kill Fuel
                const [fuelRes, socRes, driverRes] = await Promise.allSettled([fuelCall, socCall, driverCall]);

                return {
                    fuel: fuelRes.status === 'fulfilled' ? fuelRes.value : [],
                    soc: socRes.status === 'fulfilled' ? socRes.value : [],
                    driver: driverRes.status === 'fulfilled' ? driverRes.value : [],
                    errors: {
                        fuel: fuelRes.status === 'rejected' ? fuelRes.reason : null,
                        soc: socRes.status === 'rejected' ? socRes.reason : null,
                        driver: driverRes.status === 'rejected' ? driverRes.reason : null,
                    }
                };
            });

            const enrichmentResults = await Promise.all(enrichmentPromises);

            // MERGE RESULTS
            for (let i = 0; i < batch.length; i++) {
                const deviceId = batch[i];
                const statusInfo = statusInfos.find((s) => s.device.id === deviceId);

                if (!statusInfo) continue;

                // 1. Identity
                const device = identityResults[i];

                // 2. Enrichment
                const enrichment = enrichmentResults[i];
                const fuelLevel = enrichment.fuel?.[0]?.data;
                const stateOfCharge = enrichment.soc?.[0]?.data;

                let driverName = statusInfo.driver?.name || 'Unknown';
                // User result is likely User[]
                const userList = enrichment.driver as User[];
                const user = userList?.[0];

                if (user) {
                    if (user.firstName || user.lastName) driverName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
                    else if (user.name) driverName = user.name;
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

                // Fallback Device Object
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
}
