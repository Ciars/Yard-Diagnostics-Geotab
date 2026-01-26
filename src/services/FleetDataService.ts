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
    Trip,
    VehicleData,
    ApiCall,
    DiagnosticId,
} from '@/types/geotab';
// import { DiagnosticIds } from '@/types/geotab'; // Unused in Identity Only mode
import { isPointInPolygon } from '@/lib/geoUtils';
import { processVehicleIssues, hasRecurringIssues } from './IssueService';

// =============================================================================
// Constants
// =============================================================================

const BATCH_SIZE = 5; // Keep small to show progressive loading updates
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
 * Calculate days since a date
 */
function daysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    // Cap at 999 days to prevent display issues or unrealistic data
    return Math.min(days, 999);
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
    private _faultLoggedOnce = false;

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
     * This is the "zone-first" strategy for performance
     * 
     * Uses DeviceStatusInfo with zone filtering to only get vehicles
     * that are physically located within the zone boundaries.
     */
    async getDevicesInZone(zone: Zone): Promise<DeviceStatusInfo[]> {
        // First try: Get all DeviceStatusInfo and filter by those in the target zone
        const allStatuses = await this.api.call<DeviceStatusInfo[]>('Get', {
            typeName: 'DeviceStatusInfo',
            search: {},
        });

        // Filter to only devices that have this zone in their currentZones
        // Geotab stores zones each device is currently in
        const devicesInZone = allStatuses.filter((status) => {
            // Check if device is currently in the target zone
            return isPointInPolygon({ x: status.longitude, y: status.latitude }, zone.points);
        });

        return devicesInZone;
    }

    /**
     * Fetch complete vehicle data for devices in a zone
     * Uses batched multicall for performance
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

        // Note: MaintenanceReminder API is not available in dev mode (DevAuthShim limitation)
        // SERVICE column is hidden until production deployment

        // Step 2: Batch fetch diagnostics and faults
        // const now = new Date().toISOString();
        // Extend lookback to find all faults and trips for report fidelity (e.g. 1 year)
        // const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
        // const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const vehicleData: VehicleData[] = [];
        const batches = chunk(deviceIds, BATCH_SIZE);

        for (const batch of batches) {
            const calls: ApiCall[] = batch.flatMap((deviceId) => [
                // Get device details (Re-enabled: Essential for Name/VIN)
                {
                    method: 'Get',
                    params: {
                        typeName: 'Device',
                        search: { id: deviceId },
                        resultsLimit: 1,
                    },
                },

                // ISOLATION MODE: Commenting out StatusData to find the crash culprit
                /*
                // Get latest battery voltage
                {
                    method: 'Get',
                    params: {
                        typeName: 'StatusData',
                        search: {
                            deviceSearch: { id: deviceId },
                            diagnosticSearch: { id: DiagnosticIds.BATTERY_VOLTAGE },
                            fromDate: dayAgo,
                        },
                        resultsLimit: 1,
                    },
                },
                // Get latest fuel level
                {
                    method: 'Get',
                    params: {
                        typeName: 'StatusData',
                        search: {
                            deviceSearch: { id: deviceId },
                            diagnosticSearch: { id: DiagnosticIds.FUEL_LEVEL },
                            fromDate: dayAgo,
                        },
                        resultsLimit: 1,
                    },
                },
                // Get latest state of charge (EVs)
                {
                    method: 'Get',
                    params: {
                        typeName: 'StatusData',
                        search: {
                            deviceSearch: { id: deviceId },
                            diagnosticSearch: { id: DiagnosticIds.STATE_OF_CHARGE },
                            fromDate: dayAgo,
                        },
                        resultsLimit: 1,
                    },
                },
                // Get charging state (EVs)
                {
                    method: 'Get',
                    params: {
                        typeName: 'StatusData',
                        search: {
                            deviceSearch: { id: deviceId },
                            diagnosticSearch: { id: DiagnosticIds.CHARGING_STATE },
                            fromDate: dayAgo,
                        },
                        resultsLimit: 1,
                    },
                },
                */
                // SAFE MODE: Risky calls remain commented out until we prove identity works
                /*
                // Get active faults ...
                */
            ]);

            // FALLBACK LOGIC: Try Multicall, if fail, create skeletons
            let results: unknown[] | undefined;
            try {
                results = await this.api.multiCall<unknown[]>(calls);
            } catch (err) {
                console.error('[FleetDataService] MultiCall Batch Failed:', err);
                // We will handle the missing results in the loop below
            }

            // Process results (1 result per device in ISOLATION MODE)
            const safeModeStride = 1;
            for (let i = 0; i < batch.length; i++) {
                const baseIndex = i * safeModeStride;
                const deviceId = batch[i];
                const statusInfo = statusInfos.find((s) => s.device.id === deviceId);

                if (!statusInfo) continue;

                // Defensive check: Ensure we have results for this vehicle
                // If multicall partial failed, we might have undefined here
                if (!results || !results[baseIndex]) {
                    console.warn(`[FleetDataService] Missing enrichment data for device ${deviceId}. Using basic info.`);
                    // FALLBACK: Push skeleton record so the table isn't empty
                    vehicleData.push(this.createSkeletonVehicle(statusInfo, deviceId));
                    continue;
                }

                const devices = (results[baseIndex] as Device[]) || [];
                // const batteryData = (results[baseIndex + 1] as StatusData[]) || [];
                // const fuelData = (results[baseIndex + 2] as StatusData[]) || [];
                // const socData = (results[baseIndex + 3] as StatusData[]) || [];
                // const chargingData = (results[baseIndex + 4] as StatusData[]) || [];

                const batteryData: StatusData[] = [];
                const fuelData: StatusData[] = [];
                const socData: StatusData[] = [];
                const chargingData: StatusData[] = [];

                // SAFE MODE DEFAULTS
                const faults: FaultData[] = [];
                const trips: Trip[] = [];
                // const dvirDefects: any[] = []; // Unused in Safe Mode
                const users: any[] = [];
                const maintenanceReminders: any[] = [];

                const device = devices?.[0];
                const lastTrip = trips?.[0]; // Will be undefined
                const driver = users?.[0]; // Will be undefined

                // Real diagnostic values (no more mocking!)
                const batteryVoltage = batteryData?.[0]?.data;
                const fuelLevel = fuelData?.[0]?.data; // Real fuel level %
                const stateOfCharge = socData?.[0]?.data; // Real SOC %
                const chargingState = chargingData?.[0]?.data;
                const isCharging = chargingState !== undefined && chargingState > 0;

                // Calculate service due days from maintenance reminders (currently not available in dev mode)
                let serviceDueDays: number | undefined = undefined;
                if (maintenanceReminders && maintenanceReminders.length > 0) {
                    const now = Date.now();
                    for (const reminder of maintenanceReminders) {
                        if (reminder.dueDate) {
                            const dueDate = new Date(reminder.dueDate).getTime();
                            const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
                            // Use the nearest due date
                            if (serviceDueDays === undefined || daysUntilDue < serviceDueDays) {
                                serviceDueDays = daysUntilDue;
                            }
                        }
                    }
                }

                const dormancyDays = lastTrip ? daysSince(lastTrip.stop) : null;

                // Calculate zone entry time using contiguous presence strategy
                // Find the earliest trip in the current "chain" of trips inside the zone
                let zoneEntryTime: string | undefined = undefined;
                let isZoneEntryEstimate = false;

                // Fallback: If no trips in 30 days, or no trips in zone found (but vehicle is here)
                if (!zoneEntryTime) {
                    if (statusInfo.dateTime) {
                        // Use last heartbeat
                        zoneEntryTime = statusInfo.dateTime;
                        isZoneEntryEstimate = true;
                    } else {
                        // Absolute fallback: 1 year ago
                        const oneYearAgo = new Date();
                        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                        zoneEntryTime = oneYearAgo.toISOString();
                        isZoneEntryEstimate = true;
                    }
                }

                const hasCriticalFaults = faults?.some(
                    (f) => f.failureMode?.severity === 'Critical'
                ) ?? false;

                // Get Make/Model from VIN decoding (cached)
                const vin = device?.vehicleIdentificationNumber;
                let makeModel: string | undefined = undefined;
                if (vin) {
                    const cached = this.vinDecoder.getCached(vin);
                    if (cached) {
                        makeModel = VinDecoderService.formatMakeModel(cached);
                    }
                }

                // Robust Driver Name: Handle missing firstName/lastName
                let driverName = 'No Driver';
                if (driver) {
                    if (driver.firstName || driver.lastName) {
                        driverName = `${driver.firstName || ''} ${driver.lastName || ''}`.trim();
                    } else {
                        driverName = driver.name || driver.id || 'No Driver';
                    }
                }

                // Calculate zone duration with robust clamping
                // Pure data: No arbitrary caps, just prevent negative clock skew
                let zoneDurationMs: number | null = null;
                if (zoneEntryTime) {
                    const diffMs = Date.now() - new Date(zoneEntryTime).getTime();
                    zoneDurationMs = Math.max(0, diffMs);
                }

                // Categorize Faults using unified Issue Service
                const allFaults = faults || [];

                // DEBUG: Log first fault's full structure to understand data shape
                if (allFaults.length > 0 && !this._faultLoggedOnce) {
                    console.log('[FAULT-DEBUG] Sample fault data:', JSON.stringify(allFaults[0], null, 2));
                    this._faultLoggedOnce = true;
                }
                const vehicleIssues = processVehicleIssues(allFaults);
                const hasRecurring = hasRecurringIssues(vehicleIssues);
                const isDeviceOffline = !statusInfo.isDeviceCommunicating;

                // Calculate active status strictly based on unrepaired items
                // Default clean in Safe Mode
                const hasUnrepairedDefects = false;
                const dvirDefectsList: any[] = [];

                vehicleData.push({
                    device: device || { id: deviceId, name: statusInfo.device.name ?? 'Unknown', serialNumber: 'Unknown' },
                    status: statusInfo,
                    driverName,
                    makeModel,
                    batteryVoltage,
                    fuelLevel,
                    stateOfCharge,
                    isCharging,
                    dormancyDays,
                    zoneEntryTime,
                    zoneDurationMs,
                    isZoneEntryEstimate,
                    hasCriticalFaults,
                    // Unified Structured Health Data
                    health: {
                        dvir: {
                            isClean: !hasUnrepairedDefects,
                            defects: dvirDefectsList
                        },
                        issues: vehicleIssues,
                        hasRecurringIssues: hasRecurring,
                        isDeviceOffline,
                        lastHeartbeat: statusInfo.dateTime,
                    },
                    hasUnrepairedDefects,
                    activeFaults: allFaults,
                    lastTrip,
                    serviceDueDays,
                });
            }
        }

        // Step 3: Batch decode VINs to get Make/Model
        const allVins = vehicleData
            .map(v => v.device.vehicleIdentificationNumber)
            .filter((vin): vin is string => !!vin && vin.length >= 11);

        if (allVins.length > 0) {
            await this.vinDecoder.decodeVins(allVins);

            // Update makeModel from decoded VINs
            for (const vehicle of vehicleData) {
                const vin = vehicle.device.vehicleIdentificationNumber;
                if (vin) {
                    const decoded = this.vinDecoder.getCached(vin);
                    if (decoded) {
                        vehicle.makeModel = VinDecoderService.formatMakeModel(decoded);
                    }
                }
            }
        }

        // Step 4: Final verification
        console.log(`[FleetDataService] Returning ${vehicleData.length} fully enriched vehicles.`);
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
     * Performs a single fetch of all device locations and maps them to zones
     */
    async getZoneVehicleCounts(zones: Zone[]): Promise<Record<string, number>> {
        // Fetch positions of ALL devices
        const allStatuses = await this.api.call<DeviceStatusInfo[]>('Get', {
            typeName: 'DeviceStatusInfo',
            search: {},
        });

        const counts: Record<string, number> = {};

        // Initialize counts
        zones.forEach(z => counts[z.id] = 0);

        // For each device, find which zone it's in
        // Optimization: A device can only be in one zone (physically), so break after finding it
        for (const status of allStatuses) {
            const point = { x: status.longitude, y: status.latitude };

            for (const zone of zones) {
                if (isPointInPolygon(point, zone.points)) {
                    counts[zone.id]++;
                    break; // Found the zone for this device
                }
            }
        }

        return counts;
    }

    /**
     * Helper to create a basic vehicle record from just StatusInfo
     * Used when enrichment APIs fail or are restricted.
     */
    private createSkeletonVehicle(statusInfo: DeviceStatusInfo, deviceId: string): VehicleData {
        return {
            device: { id: deviceId, name: statusInfo.device.name ?? 'Unknown', serialNumber: 'Unknown' },
            status: statusInfo,
            driverName: '--',
            makeModel: undefined,
            batteryVoltage: undefined,
            fuelLevel: undefined,
            stateOfCharge: undefined,
            isCharging: false,
            dormancyDays: null,
            zoneEntryTime: statusInfo.dateTime,
            zoneDurationMs: Math.max(0, Date.now() - new Date(statusInfo.dateTime).getTime()),
            isZoneEntryEstimate: true,
            hasCriticalFaults: false,
            health: {
                dvir: { isClean: true, defects: [] },
                issues: [],
                hasRecurringIssues: false,
                isDeviceOffline: !statusInfo.isDeviceCommunicating,
                lastHeartbeat: statusInfo.dateTime,
            },
            hasUnrepairedDefects: false,
            activeFaults: [],
            lastTrip: undefined,
            serviceDueDays: undefined,
        };
    }
}
