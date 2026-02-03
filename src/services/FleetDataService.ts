import type { IGeotabApi } from './GeotabApiFactory';
import {
    DiagnosticIds
} from '@/types/geotab';
import type {
    Device,
    DeviceStatusInfo,
    User,
    FaultData,
    VehicleData,
    Zone,
    StatusData,
    DiagnosticId,
    ExceptionEvent
} from '@/types/geotab';
import { isPointInPolygon, getPolygonBoundingBox } from '@/lib/geoUtils';
import { VinDecoderService } from './VinDecoderService';
import { apiCache, CacheTTL } from '@/lib/apiCache';

// Constants
const DORMANCY_THRESHOLD_DAYS = 7;     // 7 days

// Helper to calculate bounding box for a polygon (fast pre-filter for zone checks)

// Helper for 'Hours Since'
const SILENT_THRESHOLD_HOURS = 4 * 24; // 4 days
const hoursSince = (isoDate: string) => {
    const ms = Date.now() - new Date(isoDate).getTime();
    return ms / (1000 * 60 * 60);
};

// Helper for 'Days Since'
const daysSince = (isoDate: string) => {
    return hoursSince(isoDate) / 24;
};

// Helper: Parse ISO Duration or TimeSpan
function parseDuration(duration: string): number {
    if (!duration) return 0;

    // 1. ISO 8601 (PT...)
    if (duration.startsWith('P')) {
        const daysMatch = duration.match(/(\d+)D/);
        const hoursMatch = duration.match(/(\d+)H/);
        const minsMatch = duration.match(/(\d+)M/);
        const secsMatch = duration.match(/(\d+(?:\.\d+)?)S/);

        let ms = 0;
        if (daysMatch) ms += parseInt(daysMatch[1], 10) * 24 * 3600 * 1000;
        if (hoursMatch) ms += parseInt(hoursMatch[1], 10) * 3600 * 1000;
        if (minsMatch) ms += parseInt(minsMatch[1], 10) * 60 * 1000;
        if (secsMatch) ms += parseFloat(secsMatch[1]) * 1000;
        return ms;
    }

    // 2. .NET TimeSpan (d.hh:mm:ss)
    const timeSpanRegex = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/;
    const match = duration.match(timeSpanRegex);
    if (match) {
        const days = parseInt(match[1] || '0', 10);
        const hours = parseInt(match[2], 10);
        const mins = parseInt(match[3], 10);
        const secs = parseInt(match[4], 10);
        return ((days * 24 * 3600) + (hours * 3600) + (mins * 60) + secs) * 1000;
    }

    return 0;
}

export class FleetDataService {
    private api: IGeotabApi;

    // Request-cycle cache for DeviceStatusInfo
    // Prevents duplicate API calls when getFleetData and getZoneVehicleCounts are called together
    private _statusCache: DeviceStatusInfo[] | null = null;
    private _statusCacheTime: number = 0;
    private readonly STATUS_CACHE_TTL_MS = 30_000; // 30 seconds

    constructor(api: IGeotabApi) {
        this.api = api;
    }

    /**
     * Fetch complete fleet data with parallel calls
     */
    async getFleetData(): Promise<VehicleData[]> {
        // 1. Core Lists (Global Fetch)
        // We get the current snapshot of the entire fleet.
        const deviceCall = this.api.call<Device[]>('Get', {
            typeName: 'Device',
            resultsLimit: 50000
        });

        const statusCall = this.api.call<DeviceStatusInfo[]>('Get', {
            typeName: 'DeviceStatusInfo',
            resultsLimit: 50000
        });

        const driverCall = this.api.call<User[]>('Get', {
            typeName: 'User',
            resultsLimit: 50000
        });

        const faultCall = this.api.call<FaultData[]>('Get', {
            typeName: 'FaultData',
            search: {
                fromDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            },
            resultsLimit: 5000
        });

        try {
            const [devices, statuses, drivers, faults] = await Promise.all([
                deviceCall,
                statusCall,
                driverCall,
                faultCall
            ]);

            // Cache statuses for getZoneVehicleCounts to reuse
            this._statusCache = statuses;
            this._statusCacheTime = Date.now();

            // 2. "Silent Asset" Optimization
            // Goal: Avoid making 4,500+ API calls for data we already have.
            // Active vehicles usually have Fuel/SOC in their DeviceStatusInfo snapshot.
            // We only need to batch-fetch history for vehicles where this data is MISSING.

            const statusMap = new Map<string, DeviceStatusInfo>();
            statuses.forEach(s => statusMap.set(s.device.id, s));

            const silentDevices = devices.filter(d => {
                const s = statusMap.get(d.id);
                if (!s || !s.statusData) return true; // No status info? Definitely silent/missing.

                // Check if we have the essentials in the snapshot
                const hasFuel = s.statusData.some(sd =>
                    (typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id) === DiagnosticIds.FUEL_LEVEL
                );
                const hasSoc = s.statusData.some(sd =>
                    (typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id) === DiagnosticIds.STATE_OF_CHARGE
                );

                // If it's an EV, we need SOC. If ICE, we need Fuel.
                // Simplification for mixed fleet: If we have NEITHER, consider it silent.
                // (Or if we want to be strict: fetch if missing either)
                if (hasFuel || hasSoc) return false; // Contains data, no need to fetch.

                return true; // Missing data, need to fetch history.
            });

            console.log(`[FleetDataService] Optimization Analysis:
            - Total Fleet: ${devices.length}
            - Active (Snapshot Data): ${devices.length - silentDevices.length}
            - Silent (Fetching History): ${silentDevices.length}`);

            // 3. Fetch Diagnostics ONLY for Silent Assets
            // This returns a "Patch" list of StatusData
            const silentDiagnostics = await this.fetchVehicleDiagnostics(silentDevices);

            const result = this.mergeData(devices, statuses, drivers, faults, silentDiagnostics);

            // VIN Decoding - await to prevent race condition
            // Previously called in mergeData but not awaited, causing blank Make/Model
            await this.enrichVehicleMetadata(result);

            return result;
        } catch (error) {
            console.error('[FleetDataService] Critical Error:', error);
            throw error;
        }
    }

    /**
     * Fetch critical diagnostics (Vitals + Camera Health) for specific devices.
     * Strategy: "Production-Hardened" MultiCall (Seq=1, Limit=1)
     * Used mainly for "Silent" assets that are missing data in the global snapshot.
     */
    async fetchVehicleDiagnostics(devices: Device[]) {
        if (devices.length === 0) return [];

        const diagIds = [
            DiagnosticIds.FUEL_LEVEL,
            DiagnosticIds.STATE_OF_CHARGE,
            DiagnosticIds.CHARGING_STATE,
            DiagnosticIds.CAMERA_STATUS_ROAD,
            DiagnosticIds.CAMERA_STATUS_DRIVER,
            DiagnosticIds.VIDEO_DEVICE_HEALTH,
            DiagnosticIds.CAMERA_ONLINE,
            DiagnosticIds.CAMERA_VIBRATION,
            DiagnosticIds.CAMERA_SEATBELT
        ];

        // CONFIGURATION: Production Hardened
        const CALLS_PER_BATCH = 90;      // Max 100 recommended. 90 is safe.
        const RESULTS_LIMIT = 1;         // Latest snapshot only.
        // Note: Sequential processing via for-loop. Parallel risks undefined exceptions.
        const DELAY_MS = 100;            // Polite 10 batches/sec

        const LOOKBACK_DAYS = 7;
        const fromDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const allResults: StatusData[] = [];

        // Build flat call list
        const allCalls = devices.flatMap(d =>
            diagIds.map(id => ({
                method: 'Get',
                params: {
                    typeName: 'StatusData',
                    search: {
                        deviceSearch: { id: d.id },
                        diagnosticSearch: { id },
                        fromDate
                    },
                    resultsLimit: RESULTS_LIMIT
                }
            }))
        );

        // Process SEQUENTIALLY
        for (let i = 0; i < allCalls.length; i += CALLS_PER_BATCH) {
            const chunk = allCalls.slice(i, i + CALLS_PER_BATCH);

            try {
                // Use generic 'any' to avoid TS noise
                console.log(`[FleetDataService] Processing Batch ${Math.floor(i / CALLS_PER_BATCH) + 1}/${Math.floor(allCalls.length / CALLS_PER_BATCH) + 1}`);
                const batchResults = await this.api.multiCall<any[]>(chunk);

                const validResults = batchResults.flat().filter((r: any) => r && r.device);
                allResults.push(...validResults);

                if (i + CALLS_PER_BATCH < allCalls.length) {
                    await new Promise(r => setTimeout(r, DELAY_MS));
                }
            } catch (e) {
                console.error(`[FleetDataService] Batch failed`, e);
            }
        }

        return allResults;
    }

    private mergeData(
        devices: Device[],
        statuses: DeviceStatusInfo[],
        drivers: User[],
        faults: FaultData[],
        patchDiagnostics: StatusData[]
    ): VehicleData[] {
        const vehicleMap = new Map<string, VehicleData>();
        const cameras: Device[] = [];
        const vehiclesRaw: Device[] = [];

        // Separate Cameras from Vehicles
        devices.forEach(d => {
            const name = (d.name || '').toLowerCase();
            const isCamera = d.deviceType === 'GO9Camera' ||
                name.includes('camera') ||
                name.includes('surfsight') ||
                name.includes('lytx');
            if (isCamera) {
                cameras.push(d);
            } else {
                vehiclesRaw.push(d);
            }
        });

        // Map statuses
        const statusMap = new Map<string, DeviceStatusInfo>();
        statuses.forEach(s => statusMap.set(s.device.id, s));

        // Driver Map
        const driverMap = new Map<string, string>();
        drivers.forEach(d => {
            const name = (d.firstName && d.lastName) ? `${d.firstName} ${d.lastName}` : d.name;
            driverMap.set(d.id, name);
        });

        // Build Vitals Map from the "Patch" (Silent) results
        const patchMap = new Map<string, Map<string, StatusData>>();
        patchDiagnostics.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
        patchDiagnostics.forEach(r => {
            const devId = r.device.id;
            const diagId = typeof r.diagnostic === 'string' ? r.diagnostic : r.diagnostic.id;
            if (!patchMap.has(devId)) patchMap.set(devId, new Map());
            patchMap.get(devId)!.set(diagId, r);
        });

        // Pre-parse camera presence (Check both Snapshot and Patch)
        const diagCameraPresence = new Set<string>();
        const cameraRelatedIds = new Set<string>([
            DiagnosticIds.CAMERA_STATUS_ROAD,
            DiagnosticIds.CAMERA_STATUS_DRIVER,
            DiagnosticIds.VIDEO_DEVICE_HEALTH,
            DiagnosticIds.CAMERA_ONLINE,
            DiagnosticIds.CAMERA_VIBRATION,
            DiagnosticIds.CAMERA_SEATBELT
        ]);

        // Helper to find data in Snapshot (DeviceStatusInfo)
        const getFromSnapshot = (s: DeviceStatusInfo | undefined, diagId: string): any => {
            if (!s || !s.statusData) return undefined;
            const found = s.statusData.find((sd: any) => {
                const id = typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id;
                return id === diagId;
            });
            return found ? found.data : undefined;
        };

        // Helper to find data (Priority: Patch -> Snapshot)
        const getDiagnosticValue = (deviceId: string, s: DeviceStatusInfo | undefined, diagId: string) => {
            // 1. Try Patch (History for silent)
            const patchVal = patchMap.get(deviceId)?.get(diagId);
            if (patchVal) return patchVal.data;

            // 2. Try Snapshot (Active)
            return getFromSnapshot(s, diagId);
        };

        // Populate diagCameraPresence from both sources
        patchDiagnostics.forEach(d => {
            const id = typeof d.diagnostic === 'string' ? d.diagnostic : d.diagnostic.id;
            if (cameraRelatedIds.has(id)) diagCameraPresence.add(d.device.id);
        });
        // Check snapshots for camera data
        statuses.forEach(s => {
            if (s.statusData) {
                s.statusData.forEach((sd: any) => {
                    const id = typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id;
                    if (cameraRelatedIds.has(id)) diagCameraPresence.add(s.device.id);
                });
            }
        });

        // 1. Map Vehicles
        vehiclesRaw.forEach(d => {
            const s = statusMap.get(d.id);

            // Fetch Vitals (Hybrid: Patch or Snapshot)
            const fuelLevel = getDiagnosticValue(d.id, s, DiagnosticIds.FUEL_LEVEL);
            const soc = getDiagnosticValue(d.id, s, DiagnosticIds.STATE_OF_CHARGE);
            const chargingState = getDiagnosticValue(d.id, s, DiagnosticIds.CHARGING_STATE);

            // Charging Logic
            let isCharging = false;
            if (chargingState && chargingState > 0) isCharging = true; // Works for boolean 1/0 or number

            // Find linked camera
            const camera = cameras.find(c => {
                const cName = (c.name || '').toLowerCase();
                const vName = (d.name || '').toLowerCase();
                return cName.includes(vName) || vName.includes(cName);
            });

            const camStatus = camera ? statusMap.get(camera.id) : undefined;
            const hasCameraViaDiag = diagCameraPresence.has(d.id);

            // Determine Camera Health
            let camHealth: 'good' | 'warning' | 'critical' | 'offline' | undefined = undefined;
            if (camera || hasCameraViaDiag) {
                camHealth = 'good'; // Default if present

                // We need to check both Patch and Snapshot for these specifics
                // But simplified: we just check existence of "Offline" signals or "Critical" signals

                const getDiag = (id: string) => getDiagnosticValue(d.id, s, id);

                const healthVal = getDiag(DiagnosticIds.VIDEO_DEVICE_HEALTH);
                const roadVal = getDiag(DiagnosticIds.CAMERA_STATUS_ROAD);
                const onlineVal = getDiag(DiagnosticIds.CAMERA_ONLINE);

                // Online/Offline check first
                if (onlineVal !== undefined && onlineVal === 0) {
                    camHealth = 'offline';
                } else if (camStatus && !camStatus.isDeviceCommunicating) {
                    if (camera) camHealth = 'offline';
                } else {
                    // Critical health states
                    if (healthVal === 2 || healthVal === 3) camHealth = 'critical';
                    else if (roadVal === 0 || roadVal === 4) camHealth = 'critical';
                    // Warning health states
                    else if (healthVal === 1) camHealth = 'warning';
                    else if (roadVal === 1 || roadVal === 3) camHealth = 'warning';
                }
            }

            vehicleMap.set(d.id, {
                device: d,
                status: s || {
                    device: { id: d.id },
                    isDeviceCommunicating: false,
                    dateTime: new Date(0).toISOString(),
                    currentStateDuration: 'PT0S'
                } as any,
                activeFaults: [],
                hasCriticalFaults: false,
                hasUnrepairedDefects: false,

                // Charging
                isCharging,

                driverName: 'No Driver',
                makeModel: '--',

                fuelLevel: fuelLevel,
                stateOfCharge: soc,

                dormancyDays: null,
                zoneDurationMs: null,
                cameraStatus: (camera || hasCameraViaDiag) ? {
                    isOnline: camHealth !== 'offline',
                    health: camHealth,
                    lastHeartbeat: camStatus?.dateTime || s?.dateTime,
                    deviceId: camera?.id || d.id, // Fallback to GO device ID if only diag present
                    name: camera?.name || 'On-Board Camera'
                } : undefined,
                health: {
                    dvir: { defects: [], isClean: true },
                    issues: [],
                    faultAnalysis: { items: [], ongoingCount: 0, severeCount: 0, historicalCount: 0 },
                    hasRecurringIssues: false,
                    isDeviceOffline: s ? !s.isDeviceCommunicating : true,
                    lastHeartbeat: s?.dateTime
                }
            });
        });

        // 2. Merge Status (Drivers / Durations)
        statuses.forEach(s => {
            const v = vehicleMap.get(s.device.id);
            if (v) {
                // Driver
                if (s.driver && s.driver.id) {
                    v.driverName = driverMap.get(s.driver.id) || s.driver.name || 'Unknown Driver';
                }
                if (v.driverName === 'UnknownDriver') v.driverName = 'No Driver';

                // Duration / Stay (Logic for Silent vehicles)
                if (s.currentStateDuration) {
                    let duration = parseDuration(s.currentStateDuration);
                    if (s.speed < 5) {
                        const elapsedSinceLog = Date.now() - new Date(s.dateTime).getTime();
                        if (elapsedSinceLog > 0) duration += elapsedSinceLog;
                    }
                    v.zoneDurationMs = duration;
                }

                // Dormancy
                v.dormancyDays = (s.speed < 5 && hoursSince(s.dateTime) > 24) ? Math.floor(daysSince(s.dateTime)) : 0;
            }
        });

        // 3. Merge Faults
        faults.forEach(f => {
            const v = vehicleMap.get(f.device.id);
            if (v) {
                v.activeFaults.push(f);
                if (f.controller && f.controller.name !== 'Telematics Device') {
                    v.hasCriticalFaults = true;
                    v.health.hasRecurringIssues = true;
                }
            }
        });

        const vehicles = Array.from(vehicleMap.values());

        // NOTE: VIN enrichment moved to getFleetData() to properly await it
        // This fixes race condition where Make/Model appeared blank on first render

        return vehicles;
    }

    private async enrichVehicleMetadata(vehicles: VehicleData[]) {
        const vinsToDecode: string[] = [];
        const vinService = new VinDecoderService(this.api);

        // First pass: Fill from cache immediately
        vehicles.forEach(v => {
            const vin = v.device.vehicleIdentificationNumber;
            if (vin) {
                const cached = vinService.getCached(vin);
                if (cached) {
                    v.makeModel = VinDecoderService.formatMakeModel(cached);
                } else {
                    vinsToDecode.push(vin);
                }
            }
        });

        // Second pass: Fetch missing (Async)
        if (vinsToDecode.length > 0) {
            await vinService.decodeVins(vinsToDecode);
        }
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
     * Fetch Zones (Geofences)
     * Cached for 5 minutes since zones rarely change
     */
    async getZones(): Promise<Zone[]> {
        const CACHE_KEY = 'zones';

        // Check cache first
        const cached = apiCache.get<Zone[]>(CACHE_KEY);
        if (cached) {
            return cached;
        }

        // Fetch from API
        const zones = await this.api.call<Zone[]>('Get', {
            typeName: 'Zone',
            resultsLimit: 50000
        });

        const filtered = zones
            .filter(z => {
                // Remove zones that are categorized as "Home" using official ZoneType ID
                // This avoids filtering by the string "Home" in the name itself
                const isHomeZone = z.zoneTypes?.some(t => t.id === 'ZoneTypeHomeId');
                return !isHomeZone;
            })
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        // Cache for 5 minutes
        apiCache.set(CACHE_KEY, filtered, CacheTTL.SHORT);

        return filtered;
    }

    /**
     * Get vehicles in a specific zone
     * OPTIMIZED: Filters to zone FIRST, then enriches only those vehicles.
     * 
     * Previously: getFleetData() → 5,000 vehicles with diagnostics → filter to zone (8+ min)
     * Now: Filter to zone → enrich only ~150 vehicles → return (< 10 sec)
     */
    async getVehicleDataForZone(zoneId: string): Promise<VehicleData[]> {
        const startTime = Date.now();
        console.log(`[getVehicleDataForZone] Starting for zone: ${zoneId}`);

        try {
            const zones = await this.getZones();
            const targetZone = zones.find(z => z.id === zoneId);

            if (!targetZone || !targetZone.points) {
                console.warn(`[getVehicleDataForZone] Zone not found or has no points: ${zoneId}`);
                return [];
            }

            console.log(`[getVehicleDataForZone] Zone found: ${targetZone.name}, fetching lightweight data...`);

            // TASK 1: FAST PATH - Only fetch essential data (Device + Status)
            // Drivers and faults will be fetched in enrichment phase if needed
            const fetchStart = Date.now();
            const [devices, statuses] = await Promise.all([
                this.api.call<Device[]>('Get', {
                    typeName: 'Device',
                    resultsLimit: 50000
                }),
                this.api.call<DeviceStatusInfo[]>('Get', {
                    typeName: 'DeviceStatusInfo',
                    search: {},
                    resultsLimit: 50000
                })
            ]);

            console.log(`[getVehicleDataForZone] Fast fetch completed in ${Date.now() - fetchStart}ms:`, {
                devices: devices.length,
                statuses: statuses.length
            });

            // Cache statuses for other methods to reuse
            this._statusCache = statuses;
            this._statusCacheTime = Date.now();

            // STEP 2: Filter to zone using bounding box optimization - FAST
            const filterStart = Date.now();
            const bbox = getPolygonBoundingBox(targetZone.points);
            const statusMap = new Map<string, DeviceStatusInfo>();
            statuses.forEach(s => statusMap.set(s.device.id, s));

            const candidateStatuses = statuses.filter(s => {
                const lat = s.latitude;
                const lng = s.longitude;
                return lat >= bbox.minLat && lat <= bbox.maxLat &&
                    lng >= bbox.minLng && lng <= bbox.maxLng;
            });

            // Precise polygon check
            const zoneStatuses = candidateStatuses.filter(s => {
                const point = { x: s.longitude, y: s.latitude };
                return isPointInPolygon(point, targetZone.points);
            });

            // Get only devices in zone
            const zoneDeviceIds = new Set(zoneStatuses.map(s => s.device.id));
            const zoneDevices = devices.filter(d => zoneDeviceIds.has(d.id));

            console.log(`[getVehicleDataForZone] Zone filtering completed in ${Date.now() - filterStart}ms:`, {
                candidates: candidateStatuses.length,
                inZone: zoneStatuses.length,
                zoneDevices: zoneDevices.length
            });

            // TASK 6 FIX: Skip diagnostic fetch entirely - use statusData snapshots only
            // The multiCall for diagnostics fails with GenericException in production.
            // DeviceStatusInfo.statusData already contains fuel/SOC snapshots for active vehicles.
            // Trade-off: Slightly less fresh data (acceptable for yard monitoring).
            const silentDiagnostics: StatusData[] = [];

            // STEP 4: Merge and return
            const mergeStart = Date.now();
            // Pass empty arrays for drivers/faults - will be enriched later if needed
            const result = this.mergeData(zoneDevices, zoneStatuses, [], [], silentDiagnostics);
            console.log(`[getVehicleDataForZone] Merge completed in ${Date.now() - mergeStart}ms, ${result.length} vehicles`);

            // TASK 4: VIN Decoding - non-blocking background call
            // Don't await - let the UI render immediately while VIN data populates
            this.enrichVehicleMetadata(result).then(() => {
                console.log(`[getVehicleDataForZone] VIN enrichment completed (background)`);
            }).catch(err => {
                console.warn(`[getVehicleDataForZone] VIN enrichment failed (non-critical):`, err);
            });

            console.log(`[getVehicleDataForZone] TOTAL TIME: ${Date.now() - startTime}ms`);
            return result;
        } catch (error) {
            console.error(`[getVehicleDataForZone] ERROR after ${Date.now() - startTime}ms:`, error);
            throw error;
        }
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
                (v) => (v.dormancyDays ?? 0) >= DORMANCY_THRESHOLD_DAYS
            ).length,
            charging: vehicles.filter((v) => v.isCharging).length,
        };
    }

    /**
     * Get vehicle counts for all zones
     * Uses cached statuses if available (from getFleetData) to prevent duplicate API calls
     */
    async getZoneVehicleCounts(zones: Zone[]): Promise<Record<string, number>> {
        // Use cached statuses if available and not stale
        const isCacheValid = this._statusCache &&
            (Date.now() - this._statusCacheTime) < this.STATUS_CACHE_TTL_MS;

        const allStatuses = isCacheValid
            ? this._statusCache!
            : await this.api.call<DeviceStatusInfo[]>('Get', {
                typeName: 'DeviceStatusInfo',
                search: {},
                resultsLimit: 50000
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
     * Fetch deep health history for a specific asset (On-Demand)
     * Fetches 12 months of Faults and Exceptions to catch long-standing issues.
     */
    async getAssetHealthDetails(deviceId: string) {
        // Window: 12 Months
        const fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

        // 1. FaultData (Raw DTCs)
        const faultCall = this.api.call<FaultData[]>('Get', {
            typeName: 'FaultData',
            search: {
                deviceSearch: { id: deviceId },
                fromDate
            },
            resultsLimit: 5000 // Safety Limit
        });

        // 2. ExceptionEvents (Rule Violations) - ALL Rules (No Filter)
        const exceptionCall = this.api.call<ExceptionEvent[]>('Get', {
            typeName: 'ExceptionEvent',
            search: {
                deviceSearch: { id: deviceId },
                fromDate
            },
            resultsLimit: 5000 // Safety Limit
        });

        // 3. Recent Status Snapshots (Last 7 Days for context)
        const statusIds = [
            'DiagnosticInternalDeviceVoltageId',
            'DiagnosticFuelLevelId',
            'DiagnosticStateOfChargeId',
            'DiagnosticOdometerId',
            'DiagnosticDeviceUnpluggedId',
            // Camera Specifics
            DiagnosticIds.CAMERA_STATUS_ROAD,
            DiagnosticIds.CAMERA_STATUS_DRIVER,
            DiagnosticIds.VIDEO_DEVICE_HEALTH,
            DiagnosticIds.CAMERA_ONLINE,
            'DiagnosticThirdPartyCameraStatusId',
            'DiagnosticThirdPartyCameraId',
            'DiagnosticSurfsightStatusId',
            'DiagnosticLytxStatusId',
            'DiagnosticLytxId',
            'DiagnosticAux1Id'
        ].filter(Boolean);

        // Helper for safe individual fetching
        const fetchSafe = async (id: string, fromDate: string, limit: number) => {
            try {
                return await this.api.call<StatusData[]>('Get', {
                    typeName: 'StatusData',
                    search: {
                        deviceSearch: { id: deviceId },
                        diagnosticSearch: { id },
                        fromDate
                    },
                    resultsLimit: limit
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn(`[FleetDataService] Failed to fetch details for ${id}: ${msg}`);
                return [] as StatusData[];
            }
        };

        const statusFromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Execute Calls Safely
        let faults: FaultData[] = [];
        let exceptions: ExceptionEvent[] = [];
        let statusData: StatusData[] = [];

        try {
            // Core Data (Critical)
            [faults, exceptions] = await Promise.all([faultCall, exceptionCall]);
        } catch (e) {
            console.error('[FleetDataService] Failed to load core faults/exceptions', e);
            throw e; // RETHROW: If we can't get faults, the whole view is useless.
        }

        // Context Data (Non-Critical) - Parallel Individual Calls
        try {
            const statusPromises = statusIds.map(id => fetchSafe(id, statusFromDate, 100));
            const statusResults = await Promise.all(statusPromises);
            statusData = statusResults.flat();
        } catch (e) {
            console.error('[FleetDataService] This should not happen due to fetchSafe, but catching just in case', e);
        }

        return {
            faults,
            exceptions,
            statusData
        };
    }


    /**
     * BACKGROUND ENRICHMENT: Fetch drivers and faults for the given vehicles.
     * This is intended to be called after the initial fast render.
     */
    async enrichVehicleData(vehicles: VehicleData[]): Promise<VehicleData[]> {
        if (!vehicles.length) return vehicles;

        const startTime = Date.now();
        try {
            console.log(`[enrichVehicleData] Starting optimized enrichment for ${vehicles.length} vehicles...`);

            // 1. Gather all unique IDs to minimize calls
            const deviceIds = vehicles.map(v => v.device.id);
            const driverIds = Array.from(new Set(
                vehicles.map(v => v.status.driver?.id).filter(Boolean)
            )) as string[];

            // 2. Build targeted multiCall pool
            const enrichCalls: any[] = [];

            // A. SOC and Fuel Diagnostics (2 calls per device)
            const telemetryDiagIds = [DiagnosticIds.FUEL_LEVEL, DiagnosticIds.STATE_OF_CHARGE];
            vehicles.forEach(v => {
                telemetryDiagIds.forEach(diagId => {
                    enrichCalls.push({
                        method: 'Get',
                        params: {
                            typeName: 'StatusData',
                            search: {
                                deviceSearch: { id: v.device.id },
                                diagnosticSearch: { id: diagId },
                                resultsLimit: 1
                            }
                        }
                    });
                });
            });

            // B. Targeted Driver Name Fetch (1 call per unique driver ID)
            driverIds.forEach(id => {
                enrichCalls.push({
                    method: 'Get',
                    params: {
                        typeName: 'User',
                        search: { id },
                        resultsLimit: 1
                    }
                });
            });

            // C. Targeted Fault Fetch (1 call per device for last 30 days)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            deviceIds.forEach(id => {
                enrichCalls.push({
                    method: 'Get',
                    params: {
                        typeName: 'FaultData',
                        search: {
                            deviceSearch: { id },
                            fromDate: thirtyDaysAgo
                        },
                        resultsLimit: 50 // Enough to catch recent history per device
                    }
                });
            });

            console.log(`[enrichVehicleData] Total targeted calls to execute: ${enrichCalls.length}`);

            // 3. Execute in parallel batches
            const BATCH_SIZE = 90;
            const batchPromises: Promise<any[]>[] = [];
            for (let i = 0; i < enrichCalls.length; i += BATCH_SIZE) {
                const chunk = enrichCalls.slice(i, i + BATCH_SIZE);
                batchPromises.push(this.api.multiCall<any[]>(chunk));
            }

            const allBatchResults = await Promise.all(batchPromises);
            const flatResults = allBatchResults.flat();

            // 4. Process Results into lookup maps
            const driverMap = new Map<string, string>();
            const faultMap = new Map<string, FaultData[]>();
            const diagMap = new Map<string, Map<string, number>>();

            flatResults.forEach((result: any) => {
                if (!result) return;

                // Handle arrays (likely FaultData results) vs single objects (likely User/StatusData)
                const items = Array.isArray(result) ? result : [result];
                if (items.length === 0) return;

                items.forEach((item: any) => {
                    if (!item) return;

                    // It's a User (Driver)
                    if (item.name && !item.device && !item.diagnostic) {
                        const name = (item.firstName && item.lastName) ? `${item.firstName} ${item.lastName}` : item.name;
                        driverMap.set(item.id, name);
                    }
                    // It's FaultData
                    else if (item.device && item.diagnostic && item.controller) {
                        const devId = item.device.id;
                        if (!faultMap.has(devId)) faultMap.set(devId, []);
                        faultMap.get(devId)!.push(item as FaultData);
                    }
                    // It's StatusData (Telemetry)
                    else if (item.device && item.diagnostic && typeof item.data === 'number') {
                        const devId = item.device.id;
                        const diagId = typeof item.diagnostic === 'string' ? item.diagnostic : item.diagnostic.id;
                        if (!diagMap.has(devId)) diagMap.set(devId, new Map());
                        diagMap.get(devId)!.set(diagId, item.data);
                    }
                });
            });

            // 5. Build enriched vehicle list
            const enrichedVehicles = vehicles.map(v => {
                const deviceId = v.device.id;
                const vFaults = faultMap.get(deviceId) || [];

                const fuelLevel = diagMap.get(deviceId)?.get(DiagnosticIds.FUEL_LEVEL);
                const soc = diagMap.get(deviceId)?.get(DiagnosticIds.STATE_OF_CHARGE);

                // Recalculate KPI flags based on new fault data
                const hasCriticalFaults = vFaults.some(f =>
                    f.diagnostic?.id?.includes('Critical') ||
                    f.diagnostic?.name?.includes('Critical')
                );

                return {
                    ...v,
                    activeFaults: vFaults,
                    hasCriticalFaults,
                    fuelLevel: fuelLevel ?? v.fuelLevel,
                    stateOfCharge: soc ?? v.stateOfCharge,
                    driverName: (v.status.driver && driverMap.get(v.status.driver.id)) || 'No Driver'
                };
            });

            console.log(`[enrichVehicleData] Enrichment complete in ${Date.now() - startTime}ms`);
            return enrichedVehicles;
        } catch (error) {
            console.warn(`[enrichVehicleData] Enrichment failed after ${Date.now() - startTime}ms:`, error);
            return vehicles;
        }
    }
}
