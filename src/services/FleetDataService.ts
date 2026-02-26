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
    ZoneType,
    StatusData,
    DiagnosticId,
    ExceptionEvent
} from '@/types/geotab';
import { isPointInPolygon, getPolygonBoundingBox } from '@/lib/geoUtils';
import { calculateVehicleKpis, hoursSince } from '@/lib/vehicleHealthPredicates';
import { isActiveExceptionCritical, isRoadworthyCriticalEngineFault } from './FaultService';
import { VinDecoderService } from './VinDecoderService';
import { apiCache, CacheTTL } from '@/lib/apiCache';

// Helper to calculate bounding box for a polygon (fast pre-filter for zone checks)

// Helper for 'Days Since'
const daysSince = (isoDate: string) => {
    return hoursSince(isoDate) / 24;
};

const VERBOSE_FLEET_LOGS = import.meta.env.DEV && import.meta.env.VITE_VERBOSE_FLEET_LOGS === '1';

interface ZoneCriticalContext {
    faultsByDevice: Map<string, FaultData[]>;
    exceptionCountByDevice: Map<string, number>;
    criticalByDevice: Set<string>;
}

interface ZoneCriticalCacheEntry {
    context: ZoneCriticalContext;
    cachedAt: number;
}

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
    private _statusFetchPromise: Promise<DeviceStatusInfo[]> | null = null;
    private readonly STATUS_CACHE_TTL_MS = 30_000; // 30 seconds
    private static _sharedStatusCache: DeviceStatusInfo[] | null = null;
    private static _sharedStatusCacheTime: number = 0;
    private static _sharedStatusFetchPromise: Promise<DeviceStatusInfo[]> | null = null;

    // Device snapshot cache to avoid per-device Get calls (quota heavy in DevAuthShim)
    private _deviceCache: Device[] | null = null;
    private _deviceCacheTime: number = 0;
    private _deviceFetchPromise: Promise<Device[]> | null = null;
    private readonly DEVICE_CACHE_TTL_MS = 15 * 60_000; // 15 minutes
    private static _sharedDeviceCache: Device[] | null = null;
    private static _sharedDeviceCacheTime: number = 0;
    private static _sharedDeviceFetchPromise: Promise<Device[]> | null = null;
    private readonly ZONE_CRITICAL_CACHE_TTL_MS = 60_000;
    private static _zoneCriticalCache = new Map<string, ZoneCriticalCacheEntry>();
    private static _zoneCriticalFetchPromises = new Map<string, Promise<ZoneCriticalContext>>();

    constructor(api: IGeotabApi) {
        this.api = api;
    }

    private isDeviceActiveNow(device: Device, nowMs = Date.now()): boolean {
        const activeFromMs = device.activeFrom ? new Date(device.activeFrom).getTime() : undefined;
        if (activeFromMs !== undefined && Number.isFinite(activeFromMs) && activeFromMs > nowMs) {
            return false;
        }

        const activeToMs = device.activeTo ? new Date(device.activeTo).getTime() : undefined;
        if (activeToMs !== undefined && Number.isFinite(activeToMs) && activeToMs < nowMs) {
            return false;
        }

        return true;
    }

    private isStatusCacheFresh(timestamp: number): boolean {
        return (Date.now() - timestamp) < this.STATUS_CACHE_TTL_MS;
    }

    private cacheStatuses(statuses: DeviceStatusInfo[]): void {
        const now = Date.now();
        this._statusCache = statuses;
        this._statusCacheTime = now;
        FleetDataService._sharedStatusCache = statuses;
        FleetDataService._sharedStatusCacheTime = now;
    }

    private async getAllStatuses(): Promise<DeviceStatusInfo[]> {
        if (this._statusCache && this.isStatusCacheFresh(this._statusCacheTime)) {
            return this._statusCache;
        }

        if (
            FleetDataService._sharedStatusCache &&
            this.isStatusCacheFresh(FleetDataService._sharedStatusCacheTime)
        ) {
            this._statusCache = FleetDataService._sharedStatusCache;
            this._statusCacheTime = FleetDataService._sharedStatusCacheTime;
            return FleetDataService._sharedStatusCache;
        }

        if (this._statusFetchPromise) {
            return this._statusFetchPromise;
        }

        if (FleetDataService._sharedStatusFetchPromise) {
            const sharedStatuses = await FleetDataService._sharedStatusFetchPromise;
            this.cacheStatuses(sharedStatuses);
            return sharedStatuses;
        }

        const fetchPromise = this.api.call<DeviceStatusInfo[]>('Get', {
            typeName: 'DeviceStatusInfo',
            search: {},
            resultsLimit: 50000
        });

        this._statusFetchPromise = fetchPromise;
        FleetDataService._sharedStatusFetchPromise = fetchPromise;

        try {
            const statuses = await fetchPromise;
            this.cacheStatuses(statuses);
            return statuses;
        } finally {
            this._statusFetchPromise = null;
            FleetDataService._sharedStatusFetchPromise = null;
        }
    }

    private isDeviceCacheFresh(timestamp: number): boolean {
        return (Date.now() - timestamp) < this.DEVICE_CACHE_TTL_MS;
    }

    private cacheDevices(devices: Device[]): void {
        const now = Date.now();
        this._deviceCache = devices;
        this._deviceCacheTime = now;
        FleetDataService._sharedDeviceCache = devices;
        FleetDataService._sharedDeviceCacheTime = now;
    }

    private async getAllDevices(): Promise<Device[]> {
        if (this._deviceCache) {
            if (!this.isDeviceCacheFresh(this._deviceCacheTime)) {
                // Return stale cache immediately and refresh in background.
                void this.refreshAllDevices();
            }
            return this._deviceCache;
        }

        if (FleetDataService._sharedDeviceCache) {
            this._deviceCache = FleetDataService._sharedDeviceCache;
            this._deviceCacheTime = FleetDataService._sharedDeviceCacheTime;
            if (!this.isDeviceCacheFresh(FleetDataService._sharedDeviceCacheTime)) {
                // Shared stale cache still gives us fast UI; refresh asynchronously.
                void this.refreshAllDevices();
            }
            return FleetDataService._sharedDeviceCache;
        }

        if (this._deviceFetchPromise) {
            return this._deviceFetchPromise;
        }

        if (FleetDataService._sharedDeviceFetchPromise) {
            const sharedDevices = await FleetDataService._sharedDeviceFetchPromise;
            this.cacheDevices(sharedDevices);
            return sharedDevices;
        }

        return this.refreshAllDevices();
    }

    private async refreshAllDevices(): Promise<Device[]> {
        if (this._deviceFetchPromise) {
            return this._deviceFetchPromise;
        }
        if (FleetDataService._sharedDeviceFetchPromise) {
            const sharedDevices = await FleetDataService._sharedDeviceFetchPromise;
            this.cacheDevices(sharedDevices);
            return sharedDevices;
        }

        const fetchPromise = this.api.call<Device[]>('Get', {
            typeName: 'Device',
            resultsLimit: 50000
        });

        this._deviceFetchPromise = fetchPromise;
        FleetDataService._sharedDeviceFetchPromise = fetchPromise;

        try {
            const devices = await fetchPromise;
            const activeDevices = devices.filter((device) => this.isDeviceActiveNow(device));
            this.cacheDevices(activeDevices);
            return activeDevices;
        } finally {
            this._deviceFetchPromise = null;
            FleetDataService._sharedDeviceFetchPromise = null;
        }
    }

    private normalizeZoneTypeEntry(entry: unknown): Pick<ZoneType, 'id' | 'name' | 'comment'> | undefined {
        if (typeof entry === 'string') {
            return { id: entry };
        }
        if (!entry || typeof entry !== 'object') {
            return undefined;
        }

        const raw = entry as Record<string, unknown>;
        const id = typeof raw.id === 'string' ? raw.id : undefined;
        const name = typeof raw.name === 'string' ? raw.name : undefined;
        const comment = typeof raw.comment === 'string' ? raw.comment : undefined;

        if (!id && !name && !comment) {
            return undefined;
        }

        return { id: id ?? '', name, comment };
    }

    private zoneTypeIdMatchesHome(zoneTypeId: string | undefined): boolean {
        if (!zoneTypeId) return false;
        const normalized = zoneTypeId.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalized === 'zonetypehomeid';
    }

    private isZoneTypeHome(zoneType: Pick<ZoneType, 'id' | 'name' | 'comment'> | undefined): boolean {
        if (!zoneType) return false;

        if (this.zoneTypeIdMatchesHome(zoneType.id)) return true;

        const name = (zoneType.name || '').trim().toLowerCase();
        // Keep this strict: user requested exclusion by Zone Type "Home", not fuzzy name/comment matches.
        return name === 'home';
    }

    private isZoneCriticalCacheFresh(entry: ZoneCriticalCacheEntry | undefined): entry is ZoneCriticalCacheEntry {
        if (!entry) return false;
        return (Date.now() - entry.cachedAt) < this.ZONE_CRITICAL_CACHE_TTL_MS;
    }

    private setZoneCriticalCache(zoneId: string, context: ZoneCriticalContext): void {
        FleetDataService._zoneCriticalCache.set(zoneId, {
            context,
            cachedAt: Date.now()
        });
    }

    private async getZoneCriticalContext(zoneId: string, zoneDeviceIds: Set<string>): Promise<ZoneCriticalContext> {
        if (zoneDeviceIds.size === 0) {
            return {
                faultsByDevice: new Map(),
                exceptionCountByDevice: new Map(),
                criticalByDevice: new Set()
            };
        }

        const cached = FleetDataService._zoneCriticalCache.get(zoneId);
        if (this.isZoneCriticalCacheFresh(cached)) {
            return cached.context;
        }

        const inflight = FleetDataService._zoneCriticalFetchPromises.get(zoneId);
        if (inflight) {
            return inflight;
        }

        const fetchPromise = this.fetchZoneCriticalContext(zoneDeviceIds, zoneId);
        FleetDataService._zoneCriticalFetchPromises.set(zoneId, fetchPromise);
        try {
            const context = await fetchPromise;
            this.setZoneCriticalCache(zoneId, context);
            return context;
        } finally {
            FleetDataService._zoneCriticalFetchPromises.delete(zoneId);
        }
    }

    private async fetchZoneCriticalContext(zoneDeviceIds: Set<string>, zoneId: string): Promise<ZoneCriticalContext> {
        const LOOKBACK_DAYS = 30;
        const FROM_DATE = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const RESULTS_LIMIT = 5000;

        const faultsByDevice = new Map<string, FaultData[]>();
        const exceptionCountByDevice = new Map<string, number>();
        const criticalByDevice = new Set<string>();
        const seenFaultIds = new Set<string>();
        const seenExceptionIds = new Set<string>();

        const addFault = (fault: FaultData) => {
            const deviceId = fault.device?.id;
            if (!deviceId || !zoneDeviceIds.has(deviceId)) return;
            const state = (fault.faultState || '').toLowerCase();
            if (fault.dismissDateTime || state === 'none') return;
            if (seenFaultIds.has(fault.id)) return;

            seenFaultIds.add(fault.id);
            const bucket = faultsByDevice.get(deviceId) ?? [];
            bucket.push(fault);
            faultsByDevice.set(deviceId, bucket);

            if (isRoadworthyCriticalEngineFault(fault)) {
                criticalByDevice.add(deviceId);
            }
        };

        const addException = (exception: ExceptionEvent) => {
            const deviceId = exception.device?.id;
            if (!deviceId || !zoneDeviceIds.has(deviceId)) return;
            if (seenExceptionIds.has(exception.id)) return;
            if (!isActiveExceptionCritical(exception)) return;

            seenExceptionIds.add(exception.id);
            const count = exceptionCountByDevice.get(deviceId) ?? 0;
            exceptionCountByDevice.set(deviceId, count + 1);
        };

        const [faultsRaw, exceptionsRaw] = await Promise.all([
            this.api.call<FaultData[]>('Get', {
                typeName: 'FaultData',
                search: { fromDate: FROM_DATE },
                resultsLimit: RESULTS_LIMIT
            }),
            this.api.call<ExceptionEvent[]>('Get', {
                typeName: 'ExceptionEvent',
                search: { fromDate: FROM_DATE },
                resultsLimit: RESULTS_LIMIT
            })
        ]);

        faultsRaw.forEach(addFault);
        exceptionsRaw.forEach(addException);

        const reachedFaultLimit = faultsRaw.length >= RESULTS_LIMIT;
        const reachedExceptionLimit = exceptionsRaw.length >= RESULTS_LIMIT;
        if (reachedFaultLimit || reachedExceptionLimit) {
            const MAX_FALLBACK_DEVICES = 300;
            const fallbackDeviceIds = Array.from(zoneDeviceIds).slice(0, MAX_FALLBACK_DEVICES);
            if (VERBOSE_FLEET_LOGS && zoneDeviceIds.size > MAX_FALLBACK_DEVICES) {
                console.debug('[getVehicleDataForZone] Critical fallback device cap applied', {
                    zoneId,
                    requested: zoneDeviceIds.size,
                    using: fallbackDeviceIds.length
                });
            }

            const CALLS_PER_BATCH = 25;
            if (reachedFaultLimit) {
                const faultCalls = fallbackDeviceIds.map((id) => ({
                    method: 'Get',
                    params: {
                        typeName: 'FaultData',
                        search: {
                            deviceSearch: { id },
                            fromDate: FROM_DATE
                        },
                        resultsLimit: 200
                    }
                }));

                for (let i = 0; i < faultCalls.length; i += CALLS_PER_BATCH) {
                    const chunk = faultCalls.slice(i, i + CALLS_PER_BATCH);
                    const batch = await this.api.multiCall<any[]>(chunk);
                    batch.flatMap((entry) => Array.isArray(entry) ? entry : []).forEach((fault) => addFault(fault as FaultData));
                }
            }

            if (reachedExceptionLimit) {
                const exceptionCalls = fallbackDeviceIds.map((id) => ({
                    method: 'Get',
                    params: {
                        typeName: 'ExceptionEvent',
                        search: {
                            deviceSearch: { id },
                            fromDate: FROM_DATE
                        },
                        resultsLimit: 200
                    }
                }));

                for (let i = 0; i < exceptionCalls.length; i += CALLS_PER_BATCH) {
                    const chunk = exceptionCalls.slice(i, i + CALLS_PER_BATCH);
                    const batch = await this.api.multiCall<any[]>(chunk);
                    batch.flatMap((entry) => Array.isArray(entry) ? entry : []).forEach((exception) => addException(exception as ExceptionEvent));
                }
            }
        }

        return {
            faultsByDevice,
            exceptionCountByDevice,
            criticalByDevice
        };
    }

    private mapVideoDeviceHealthToCameraHealth(value: unknown): 'good' | 'warning' | 'critical' | undefined {
        if (typeof value !== 'number') return undefined;
        if (value === 0) return 'good';
        if (value === 1 || value === 2) return 'warning';
        if (value === 3) return 'critical';
        return undefined;
    }

    /**
     * Fetch complete fleet data with parallel calls
     */
    async getFleetData(): Promise<VehicleData[]> {
        // 1. Core Lists (Global Fetch)
        // We get the current snapshot of the entire fleet.
        const deviceCall = this.getAllDevices();

        const statusCall = this.getAllStatuses();

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
            this.cacheStatuses(statuses);
            this.cacheDevices(devices);

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
    async fetchVehicleDiagnostics(
        devices: Device[],
        options?: {
            diagnosticIds?: string[];
            lookbackDays?: number;
            callsPerBatch?: number;
            delayMs?: number;
        }
    ) {
        if (devices.length === 0) return [];

        const diagIds = options?.diagnosticIds ?? [
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
        const CALLS_PER_BATCH = options?.callsPerBatch ?? 90; // Max 100 recommended. 90 is safe.
        const RESULTS_LIMIT = 1;                               // Latest snapshot only.
        // Note: Sequential processing via for-loop. Parallel risks undefined exceptions.
        const DELAY_MS = options?.delayMs ?? 100;              // Polite 10 batches/sec

        const LOOKBACK_DAYS = options?.lookbackDays ?? 7;
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
                if (VERBOSE_FLEET_LOGS) {
                    console.debug(`[FleetDataService] Processing Batch ${Math.floor(i / CALLS_PER_BATCH) + 1}/${Math.floor(allCalls.length / CALLS_PER_BATCH) + 1}`);
                }
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
        patchDiagnostics: StatusData[],
        criticalContext?: {
            criticalByDevice?: Set<string>;
            exceptionCountByDevice?: Map<string, number>;
        }
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
            const acInputPower = getDiagnosticValue(d.id, s, DiagnosticIds.AC_INPUT_POWER);

            // Charging Logic
            let isCharging = false;
            if (typeof chargingState === 'number' && chargingState > 0) isCharging = true;
            // Fallback for EVs where charging-state diagnostic is sparse but charger power is present.
            if (!isCharging && typeof acInputPower === 'number' && acInputPower > 0) isCharging = true;

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
                const onlineVal = getDiag(DiagnosticIds.CAMERA_ONLINE);
                const mappedHealth = this.mapVideoDeviceHealthToCameraHealth(healthVal);

                // Online/Offline check first
                if (onlineVal !== undefined && onlineVal === 0) {
                    camHealth = 'offline';
                } else if (camStatus && !camStatus.isDeviceCommunicating) {
                    if (camera) camHealth = 'offline';
                } else {
                    // Summary health for list/KPI is based on Video Device Health.
                    // Road cam state (e.g., decalibrated) is still shown in detailed logs.
                    camHealth = mappedHealth ?? 'good';
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
                    exceptionSummary: undefined,
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
                    const safeDuration = Math.max(0, duration);
                    v.zoneDurationMs = safeDuration;
                    if (safeDuration > 0) {
                        v.zoneEntryTime = new Date(Date.now() - safeDuration).toISOString();
                        v.isZoneEntryEstimate = true;
                    }
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
                if (isRoadworthyCriticalEngineFault(f)) {
                    v.hasCriticalFaults = true;
                    v.health.hasRecurringIssues = true;
                }
            }
        });

        const criticalByDevice = criticalContext?.criticalByDevice;
        const exceptionCountByDevice = criticalContext?.exceptionCountByDevice;
        if (criticalByDevice || exceptionCountByDevice) {
            vehicleMap.forEach((vehicle, deviceId) => {
                const exceptionCount = exceptionCountByDevice?.get(deviceId) ?? 0;
                if (criticalByDevice?.has(deviceId)) {
                    vehicle.hasCriticalFaults = true;
                    vehicle.health.hasRecurringIssues = true;
                }
                if (exceptionCount > 0) {
                    vehicle.health.exceptionSummary = { activeCount: exceptionCount };
                }
            });
        }

        const vehicles = Array.from(vehicleMap.values());

        // NOTE: VIN enrichment moved to getFleetData() to properly await it
        // This fixes race condition where Make/Model appeared blank on first render

        return vehicles;
    }

    /**
     * Extract the latest value for a specific diagnostic from StatusData array
     */
    private getLatestDiagnosticValue(statusData: StatusData[], diagnosticId: string): number | undefined {
        const readings = statusData.filter(sd => {
            const id = typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id;
            return id === diagnosticId;
        });

        if (readings.length === 0) return undefined;

        // Sort by dateTime descending, take latest numeric value
        const sorted = readings.sort((a, b) =>
            new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
        );

        for (const reading of sorted) {
            const parsed = this.toFiniteNumber(reading.data);
            if (parsed !== undefined) {
                return parsed;
            }
        }

        return undefined;
    }

    private toFiniteNumber(value: unknown): number | undefined {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return undefined;
    }

    private normalizeStatusOdometerKm(rawValue: number | undefined): number | undefined {
        if (rawValue === undefined) return undefined;
        if (rawValue < 0) return undefined;

        // Geotab StatusData odometer (DiagnosticOdometerId) is generally returned in meters.
        // Allow explicit override for tenant-specific behavior.
        const configuredUnit = (import.meta.env.VITE_ODOMETER_STATUSDATA_UNIT || 'm').toLowerCase();
        if (configuredUnit === 'km') {
            return rawValue;
        }

        return rawValue / 1000;
    }

    /**
     * Calculate Electrical System Rating (ESR) based on battery voltage health
     * Algorithm:
     * - Good (>12.5V) = 90-100%
     * - Marginal (12-12.5V) = 50-89%
     * - Poor (<12V) = 0-49%
     */
    private calculateESR(statusData: StatusData[]): number {
        const voltageReadings = statusData
            .filter(sd => {
                const id = typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id;
                return id === DiagnosticIds.BATTERY_VOLTAGE;
            })
            .slice(-20); // Last 20 readings for averaging

        if (voltageReadings.length === 0) return 100; // Default healthy if no data

        const voltages = voltageReadings
            .map(r => this.toFiniteNumber(r.data))
            .filter((v): v is number => v !== undefined);

        if (voltages.length === 0) return 100;

        const avgVoltage = voltages.reduce((a, b) => a + b, 0) / voltages.length;

        // Scoring algorithm
        if (avgVoltage >= 12.5) {
            // Excellent: 90-100%
            return Math.min(100, Math.round(90 + (avgVoltage - 12.5) * 20));
        }
        if (avgVoltage >= 12.0) {
            // Marginal: 50-89%
            return Math.round(50 + (avgVoltage - 12.0) / 0.5 * 39);
        }
        // Poor: 0-49%
        return Math.max(0, Math.round(avgVoltage / 12 * 50));
    }

    private async enrichVehicleMetadata(vehicles: VehicleData[]) {
        const vinsToDecode = new Set<string>();
        const vehiclesByVin = new Map<string, VehicleData[]>();
        const vinService = new VinDecoderService(this.api);

        // First pass: Fill from cache immediately
        vehicles.forEach(v => {
            const vin = v.device.vehicleIdentificationNumber?.trim().toUpperCase();
            if (vin) {
                const list = vehiclesByVin.get(vin) ?? [];
                list.push(v);
                vehiclesByVin.set(vin, list);

                const cached = vinService.getCached(vin);
                const formatted = VinDecoderService.formatMakeModel(cached);
                if (formatted) {
                    v.makeModel = formatted;
                } else {
                    vinsToDecode.add(vin);
                }
            }
        });

        // Second pass: Fetch missing (Async)
        if (vinsToDecode.size > 0) {
            const decoded = await vinService.decodeVins(Array.from(vinsToDecode));
            vehiclesByVin.forEach((bucket, vin) => {
                const formatted = VinDecoderService.formatMakeModel(decoded.get(vin));
                if (formatted) {
                    bucket.forEach((vehicle) => {
                        vehicle.makeModel = formatted;
                    });
                }
            });
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
        const HOME_ZONE_TYPE_IDS_CACHE_KEY = 'home-zone-type-ids';

        // Check cache first
        const cached = apiCache.get<Zone[]>(CACHE_KEY);
        if (cached) {
            return cached;
        }

        const zones = await this.api.call<Zone[]>('Get', {
            typeName: 'Zone',
            resultsLimit: 50000
        });

        const cachedHomeZoneTypeIds = apiCache.get<string[]>(HOME_ZONE_TYPE_IDS_CACHE_KEY);
        const homeZoneTypeIds = new Set<string>(cachedHomeZoneTypeIds ?? ['ZoneTypeHomeId']);
        if (!cachedHomeZoneTypeIds) {
            const rawZoneTypes = await this.api.call<unknown[]>('Get', {
                typeName: 'ZoneType',
                resultsLimit: 50000
            }).catch((error) => {
                console.warn('[getZones] Failed to fetch ZoneType metadata, using ID/name fallback:', error);
                return [] as unknown[];
            });

            rawZoneTypes.forEach((zoneTypeEntry) => {
                const zoneType = this.normalizeZoneTypeEntry(zoneTypeEntry);
                if (this.isZoneTypeHome(zoneType) && zoneType?.id) {
                    homeZoneTypeIds.add(zoneType.id);
                }
            });

            apiCache.set(HOME_ZONE_TYPE_IDS_CACHE_KEY, Array.from(homeZoneTypeIds), CacheTTL.MEDIUM);
        }

        const filtered = zones
            .filter(z => {
                const isHomeZone = (z.zoneTypes ?? []).some((zoneTypeEntry) => {
                    const zoneType = this.normalizeZoneTypeEntry(zoneTypeEntry);
                    if (zoneType?.id && (homeZoneTypeIds.has(zoneType.id) || this.zoneTypeIdMatchesHome(zoneType.id))) {
                        return true;
                    }
                    return this.isZoneTypeHome(zoneType);
                });
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
            const zonePoints = targetZone.points;

            console.log(`[getVehicleDataForZone] Zone found: ${targetZone.name}, fetching lightweight data...`);

            const deviceSnapshotPromise = this.getAllDevices()
                .then((devices) => ({ devices, hasDeviceSnapshot: true as const }))
                .catch((error) => {
                    console.warn('[getVehicleDataForZone] Device snapshot fetch failed, using status-only fallback:', error);
                    return { devices: [] as Device[], hasDeviceSnapshot: false as const };
                });

            const fetchStart = Date.now();
            let zoneStatuses: DeviceStatusInfo[] = [];
            const filterStatusesToZone = (statuses: DeviceStatusInfo[]): DeviceStatusInfo[] => {
                const bbox = getPolygonBoundingBox(zonePoints);
                return statuses.filter((s) => {
                    const lat = s.latitude;
                    const lng = s.longitude;

                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
                    if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) {
                        return false;
                    }

                    const point = { x: lng, y: lat };
                    return isPointInPolygon(point, zonePoints);
                });
            };

            try {
                zoneStatuses = await this.api.call<DeviceStatusInfo[]>('Get', {
                    typeName: 'DeviceStatusInfo',
                    search: {
                        currentZoneSearch: { id: zoneId }
                    },
                    resultsLimit: 50000
                });
            } catch (e) {
                console.warn('[getVehicleDataForZone] currentZoneSearch failed, falling back to polygon filter:', e);
            }

            // Always verify server-side filter with local geometry.
            if (zoneStatuses.length > 0) {
                const beforeFilter = zoneStatuses.length;
                zoneStatuses = filterStatusesToZone(zoneStatuses);
                if (beforeFilter > zoneStatuses.length * 2) {
                    console.warn('[getVehicleDataForZone] currentZoneSearch appears broad; local polygon filter applied', {
                        before: beforeFilter,
                        after: zoneStatuses.length
                    });
                }
            } else {
                // Fallback path: if server-side currentZone index has no hits, do client-side polygon filtering.
                const allStatuses = await this.getAllStatuses();
                zoneStatuses = filterStatusesToZone(allStatuses);
            }

            const { devices: allDevices, hasDeviceSnapshot } = await deviceSnapshotPromise;

            const activeDeviceIdSet = new Set(allDevices.map((device) => device.id));
            if (hasDeviceSnapshot) {
                const beforeActiveFilter = zoneStatuses.length;
                zoneStatuses = zoneStatuses.filter((status) => activeDeviceIdSet.has(status.device.id));
                if (VERBOSE_FLEET_LOGS && beforeActiveFilter !== zoneStatuses.length) {
                    console.debug('[getVehicleDataForZone] Filtered inactive devices from zone status set', {
                        before: beforeActiveFilter,
                        after: zoneStatuses.length
                    });
                }
            }

            const zoneDeviceIdSet = new Set(zoneStatuses.map((s) => s.device.id));
            const devices = allDevices.filter((d) => zoneDeviceIdSet.has(d.id));

            console.log(`[getVehicleDataForZone] Fast fetch completed in ${Date.now() - fetchStart}ms:`, {
                zoneStatuses: zoneStatuses.length,
                zoneDevices: devices.length
            });

            // Ensure we always have a device object for each zone status, even if Device lookup partially fails.
            const deviceById = new Map(devices.map((d) => [d.id, d]));
            const zoneDevices = zoneStatuses.flatMap((status) => {
                const existing = deviceById.get(status.device.id);
                if (existing) return [existing];
                if (hasDeviceSnapshot) return [];
                return [{
                    id: status.device.id,
                    name: status.device.name || status.device.id,
                    serialNumber: ''
                } as Device];
            });

            const statusMap = new Map<string, DeviceStatusInfo>();
            zoneStatuses.forEach((s) => statusMap.set(s.device.id, s));
            const zoneCriticalContext = await this.getZoneCriticalContext(zoneId, zoneDeviceIdSet);
            const zoneFaults = Array.from(zoneCriticalContext.faultsByDevice.values()).flat();

            const missingVitalsDevices = zoneDevices.filter((device) => {
                const status = statusMap.get(device.id);
                if (!status?.statusData) return true;
                const hasFuel = status.statusData.some((sd) => {
                    const diagnosticId = typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id;
                    return diagnosticId === DiagnosticIds.FUEL_LEVEL;
                });
                const hasSoc = status.statusData.some((sd) => {
                    const diagnosticId = typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id;
                    return diagnosticId === DiagnosticIds.STATE_OF_CHARGE;
                });
                return !hasFuel && !hasSoc;
            });

            const MAX_ZONE_PATCH_DEVICES = 150;
            const missingVitalsSorted = [...missingVitalsDevices].sort((a, b) => {
                const aTime = new Date(statusMap.get(a.id)?.dateTime || 0).getTime();
                const bTime = new Date(statusMap.get(b.id)?.dateTime || 0).getTime();
                return bTime - aTime;
            });
            const missingVitalsSubset = missingVitalsSorted.slice(0, MAX_ZONE_PATCH_DEVICES);
            if (missingVitalsDevices.length > MAX_ZONE_PATCH_DEVICES && VERBOSE_FLEET_LOGS) {
                console.debug('[getVehicleDataForZone] Limiting fallback diagnostics for performance', {
                    requested: missingVitalsDevices.length,
                    using: missingVitalsSubset.length
                });
            }

            // Camera diagnostics are fetched for all in-zone devices so camera detection remains accurate.
            const cameraDiagnostics = await this.fetchVehicleDiagnostics(zoneDevices, {
                diagnosticIds: [
                    DiagnosticIds.CAMERA_ONLINE,
                    DiagnosticIds.VIDEO_DEVICE_HEALTH,
                    DiagnosticIds.CHARGING_STATE,
                    DiagnosticIds.AC_INPUT_POWER
                ],
                lookbackDays: 3,
                callsPerBatch: 60,
                delayMs: 120
            });

            const vitalsDiagnostics = await this.fetchVehicleDiagnostics(missingVitalsSubset, {
                diagnosticIds: [
                    DiagnosticIds.FUEL_LEVEL,
                    DiagnosticIds.STATE_OF_CHARGE,
                    DiagnosticIds.CHARGING_STATE
                ],
                lookbackDays: 3,
                callsPerBatch: 60,
                delayMs: 120
            });
            const silentDiagnostics = [...cameraDiagnostics, ...vitalsDiagnostics];

            const mergeStart = Date.now();
            const result = this.mergeData(zoneDevices, zoneStatuses, [], zoneFaults, silentDiagnostics, {
                criticalByDevice: zoneCriticalContext.criticalByDevice,
                exceptionCountByDevice: zoneCriticalContext.exceptionCountByDevice
            });
            console.log(`[getVehicleDataForZone] Merge completed in ${Date.now() - mergeStart}ms, ${result.length} vehicles`);

            await this.enrichVehicleMetadata(result);
            console.log(`[getVehicleDataForZone] VIN enrichment completed`);

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
        return calculateVehicleKpis(vehicles);
    }

    /**
     * Get vehicle counts for all zones
     * Uses cached statuses if available (from getFleetData) to prevent duplicate API calls
     */
    async getZoneVehicleCounts(zones: Zone[]): Promise<Record<string, number>> {
        const [allStatuses, activeDevices] = await Promise.all([
            this.getAllStatuses(),
            this.getAllDevices().catch((error) => {
                console.warn('[getZoneVehicleCounts] Active device filter unavailable, using status-only counts:', error);
                return null as Device[] | null;
            })
        ]);
        let statusesForCounting = allStatuses;

        if (activeDevices) {
            const activeDeviceIds = new Set(activeDevices.map((device) => device.id));
            statusesForCounting = allStatuses.filter((status) => activeDeviceIds.has(status.device.id));
        }

        const counts: Record<string, number> = {};
        zones.forEach((z) => {
            counts[z.id] = 0;
        });

        const zoneGeometries = zones.map((zone) => ({
            id: zone.id,
            points: zone.points,
            bbox: getPolygonBoundingBox(zone.points ?? [])
        }));

        for (const status of statusesForCounting) {
            const lat = status.latitude;
            const lng = status.longitude;

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

            const point = { x: status.longitude, y: status.latitude };
            for (const zone of zoneGeometries) {
                if (
                    lat < zone.bbox.minLat ||
                    lat > zone.bbox.maxLat ||
                    lng < zone.bbox.minLng ||
                    lng > zone.bbox.maxLng
                ) {
                    continue;
                }

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
     * Fetches 3 months of Faults and Exceptions for actionable diagnostics.
     */
    async getAssetHealthDetails(deviceId: string) {
        // Window: 3 Months
        const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

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

        // 3. Status snapshots split by expected update frequency.
        // Slow-changing metrics (odometer/engine hours/DEF) need a wider window.
        const historicalStatusIds = [
            DiagnosticIds.ODOMETER,
            DiagnosticIds.ENGINE_HOURS,
            DiagnosticIds.DEF_LEVEL
        ].filter(Boolean);

        const recentStatusIds = [
            DiagnosticIds.BATTERY_VOLTAGE,
            DiagnosticIds.FUEL_LEVEL,
            DiagnosticIds.STATE_OF_CHARGE,
            DiagnosticIds.COOLANT_TEMP,
            DiagnosticIds.ENGINE_SPEED,
            DiagnosticIds.DEVICE_UNPLUGGED,
            // Camera specifics
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

        const recentStatusFromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const historicalStatusFromDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

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
            const statusPromises = [
                ...historicalStatusIds.map(id => fetchSafe(id, historicalStatusFromDate, 250)),
                ...recentStatusIds.map(id => fetchSafe(id, recentStatusFromDate, 100))
            ];
            const statusResults = await Promise.all(statusPromises);
            statusData = statusResults.flat();
        } catch (e) {
            console.error('[FleetDataService] This should not happen due to fetchSafe, but catching just in case', e);
        }

        // --- ENRICHMENT STEP: Fetch Diagnostic Names ---
        const diagnosticIds = new Set<string>();
        faults.forEach(f => {
            if (f.diagnostic?.id) diagnosticIds.add(f.diagnostic.id);
        });
        exceptions.forEach(ex => {
            if (ex.diagnostic?.id) diagnosticIds.add(ex.diagnostic.id);
        });

        if (diagnosticIds.size > 0) {
            try {
                const diagnostics: any[] = [];
                const diagnosticCalls = Array.from(diagnosticIds).map((id) => ({
                    method: 'Get',
                    params: {
                        typeName: 'Diagnostic',
                        search: { id }
                    }
                }));

                const CALLS_PER_BATCH = 25;
                for (let i = 0; i < diagnosticCalls.length; i += CALLS_PER_BATCH) {
                    const chunk = diagnosticCalls.slice(i, i + CALLS_PER_BATCH);
                    const batch = await this.api.multiCall<any[]>(chunk);
                    batch.forEach((entry) => {
                        if (Array.isArray(entry)) {
                            diagnostics.push(...entry);
                        } else if (entry && typeof entry === 'object') {
                            diagnostics.push(entry);
                        }
                    });
                }

                const diagMap = new Map<string, any>();
                diagnostics.forEach(d => diagMap.set(d.id, d));

                // Map results back to objects
                faults.forEach(f => {
                    if (f.diagnostic?.id && diagMap.has(f.diagnostic.id)) {
                        f.diagnostic = diagMap.get(f.diagnostic.id);
                    }
                });
                exceptions.forEach(ex => {
                    if (ex.diagnostic?.id && diagMap.has(ex.diagnostic.id)) {
                        ex.diagnostic = diagMap.get(ex.diagnostic.id);
                    }
                });
            } catch (e) {
                console.warn('[FleetDataService] Failed to enrich diagnostic metadata:', e);
            }
        }

        // --- EXTENDED DIAGNOSTICS CALCULATION ---
        const rawOdometer = this.getLatestDiagnosticValue(statusData, DiagnosticIds.ODOMETER);
        const extendedDiagnostics = {
            odometer: this.normalizeStatusOdometerKm(rawOdometer),
            engineHours: this.getLatestDiagnosticValue(statusData, DiagnosticIds.ENGINE_HOURS),
            defLevel: this.getLatestDiagnosticValue(statusData, DiagnosticIds.DEF_LEVEL),
            coolantTemp: this.getLatestDiagnosticValue(statusData, DiagnosticIds.COOLANT_TEMP),
            engineSpeed: this.getLatestDiagnosticValue(statusData, DiagnosticIds.ENGINE_SPEED),
            batteryVoltage: this.getLatestDiagnosticValue(statusData, DiagnosticIds.BATTERY_VOLTAGE),
            electricalSystemRating: this.calculateESR(statusData)
        };

        return {
            faults,
            exceptions,
            statusData,
            extendedDiagnostics
        };
    }

    private normalizeRepairStatus(status: unknown): string | undefined {
        if (typeof status !== 'string' || status.trim() === '') return undefined;
        const normalized = status.toLowerCase();
        if (normalized === 'repaired') return 'Repaired';
        if (normalized === 'notnecessary' || normalized === 'not_necessary') return 'NotNecessary';
        if (normalized === 'notrepaired' || normalized === 'not_repaired') return 'NotRepaired';
        return status;
    }

    private isDefectUnrepaired(defect: { repairStatus?: string; isRepaired?: boolean }): boolean {
        if (defect.isRepaired === true) return false;
        return defect.repairStatus !== 'Repaired' && defect.repairStatus !== 'NotNecessary';
    }

    private extractDvirDefects(logs: unknown[], fallbackDriverName?: string): VehicleData['health']['dvir']['defects'] {
        if (!Array.isArray(logs) || logs.length === 0) return [];

        const defects: VehicleData['health']['dvir']['defects'] = [];
        const seen = new Set<string>();

        logs.forEach((entry, entryIndex) => {
            const log = entry as Record<string, any>;
            const defectCandidates = Array.isArray(log.defects)
                ? log.defects
                : Array.isArray(log.defectRemarks)
                    ? log.defectRemarks
                    : Array.isArray(log.defectList)
                        ? log.defectList
                        : [];

            defectCandidates.forEach((rawDefect: Record<string, any>, defectIndex: number) => {
                const repairStatus = this.normalizeRepairStatus(
                    rawDefect.repairStatus ??
                    rawDefect.repairState ??
                    rawDefect.state ??
                    log.repairStatus
                );
                const isRepaired = repairStatus === 'Repaired' || repairStatus === 'NotNecessary';

                const defectName =
                    rawDefect.defectName ??
                    rawDefect.name ??
                    rawDefect.defect?.name ??
                    rawDefect.comment ??
                    'Reported defect';

                const id = String(
                    rawDefect.id ??
                    `${log.id ?? 'dvir'}-${entryIndex}-${defectIndex}`
                );
                const dvirLogId = String(
                    rawDefect.dvirLog?.id ??
                    rawDefect.dvirLogId ??
                    rawDefect.dvir?.id ??
                    log.id ??
                    ''
                ) || undefined;
                const dedupeKey = `${id}-${repairStatus ?? 'unknown'}`;
                if (seen.has(dedupeKey)) return;
                seen.add(dedupeKey);

                defects.push({
                    id,
                    dvirLogId,
                    defectName: String(defectName),
                    comment: rawDefect.comment ?? log.comment,
                    date: String(rawDefect.dateTime ?? rawDefect.date ?? log.dateTime ?? new Date().toISOString()),
                    driverName: String(rawDefect.driver?.name ?? log.driver?.name ?? fallbackDriverName ?? 'Unknown Driver'),
                    repairStatus,
                    isRepaired,
                    certifiedBy: rawDefect.certifiedBy?.name ?? log.certifiedBy?.name
                });
            });
        });

        return defects;
    }

    private getLatestDvirInspectionAt(logs: unknown[]): string | undefined {
        if (!Array.isArray(logs) || logs.length === 0) return undefined;

        let latestMs = Number.NEGATIVE_INFINITY;
        let latestIso: string | undefined;

        logs.forEach((entry) => {
            const log = entry as Record<string, unknown>;
            const raw = log.dateTime ?? log.date;
            if (typeof raw !== 'string') return;
            const ms = new Date(raw).getTime();
            if (Number.isNaN(ms)) return;
            if (ms > latestMs) {
                latestMs = ms;
                latestIso = raw;
            }
        });

        return latestIso;
    }


    /**
     * BACKGROUND ENRICHMENT: Fetch drivers and faults for the given vehicles.
     * This is intended to be called after the initial fast render.
     */
    async enrichVehicleData(vehicles: VehicleData[]): Promise<VehicleData[]> {
        if (!vehicles.length) return vehicles;

        const startTime = Date.now();
        try {
            console.log(`[enrichVehicleData] Starting bulk enrichment for ${vehicles.length} vehicles...`);

            const deviceIds = vehicles.map((v) => v.device.id);
            const deviceIdSet = new Set(deviceIds);

            const driverMap = new Map<string, string>();
            try {
                const users = await this.api.call<User[]>('Get', {
                    typeName: 'User',
                    search: { isDriver: true },
                    resultsLimit: 5000
                });

                users.forEach((u) => {
                    const name = (u.firstName && u.lastName) ? `${u.firstName} ${u.lastName}` : (u.name || 'Unknown User');
                    driverMap.set(u.id, name);
                });
            } catch (e) {
                console.warn('[enrichVehicleData] Bulk driver fetch failed:', e);
            }

            const dvirMap = new Map<string, VehicleData['health']['dvir']['defects']>();
            const latestDvirInspectionMap = new Map<string, string>();
            try {
                const dvirFromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const dvirLogs: any[] = [];
                const calls = deviceIds.map((id) => ({
                    method: 'Get',
                    params: {
                        typeName: 'DVIRLog',
                        search: {
                            deviceSearch: { id },
                            fromDate: dvirFromDate
                        },
                        resultsLimit: 100
                    }
                }));

                const CALLS_PER_BATCH = 25;
                for (let i = 0; i < calls.length; i += CALLS_PER_BATCH) {
                    const chunk = calls.slice(i, i + CALLS_PER_BATCH);
                    try {
                        const batch = await this.api.multiCall<any[]>(chunk);
                        batch.flatMap((entry) => Array.isArray(entry) ? entry : []).forEach((log) => dvirLogs.push(log));
                    } catch (e) {
                        console.warn(`[enrichVehicleData] DVIR batch failed (${i}-${i + chunk.length}):`, e);
                    }
                }

                const logsByDevice = new Map<string, unknown[]>();
                dvirLogs.forEach((entry) => {
                    const log = entry as Record<string, any>;
                    const id = log.device?.id;
                    if (!id || !deviceIdSet.has(id)) return;
                    if (!logsByDevice.has(id)) logsByDevice.set(id, []);
                    logsByDevice.get(id)!.push(log);
                });

                vehicles.forEach((vehicle) => {
                    const logs = logsByDevice.get(vehicle.device.id) ?? [];
                    dvirMap.set(vehicle.device.id, this.extractDvirDefects(logs, vehicle.driverName));
                    const latestInspectionAt = this.getLatestDvirInspectionAt(logs);
                    if (latestInspectionAt) {
                        latestDvirInspectionMap.set(vehicle.device.id, latestInspectionAt);
                    }
                });
            } catch (e) {
                console.warn('[enrichVehicleData] DVIR enrichment failed (non-critical):', e);
            }

            return vehicles.map((v) => {
                const vehicleFaults = v.activeFaults;
                const dvirDefects = dvirMap.get(v.device.id) ?? v.health.dvir.defects;
                const hasUnrepairedDefects = dvirDefects.some((defect) => this.isDefectUnrepaired(defect));
                const driverName = (v.status.driver?.id && driverMap.get(v.status.driver.id)) || v.driverName || 'No Driver';
                const hasCriticalFaults = v.hasCriticalFaults || vehicleFaults.some((fault) => isRoadworthyCriticalEngineFault(fault));

                return {
                    ...v,
                    driverName,
                    activeFaults: vehicleFaults,
                    hasCriticalFaults,
                    hasUnrepairedDefects,
                    health: {
                                ...v.health,
                                dvir: {
                                    defects: dvirDefects,
                                    isClean: !hasUnrepairedDefects,
                                    lastInspectionAt: latestDvirInspectionMap.get(v.device.id) ?? v.health.dvir.lastInspectionAt
                                }
                            }
                        };
            });

        } catch (error) {
            console.error('[enrichVehicleData] Enrichment failed, returning original list:', error);
            return vehicles;
        } finally {
            console.log(`[enrichVehicleData] Enrichment cycle completed in ${Date.now() - startTime}ms`);
        }
    }
}
