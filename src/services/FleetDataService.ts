
import { IGeotabApi } from './GeotabApiFactory';
import {
    VehicleData,
    Device,
    DeviceStatusInfo,
    FaultData,
    StatusData,
    DiagnosticId,
    ExceptionEvent,
    Zone,
    Coordinate,
    DiagnosticIds,
    User
} from '@/types/geotab';
import { VinDecoderService } from './VinDecoderService';

// Constants
const DORMANCY_THRESHOLD_DAYS = 7;     // 7 days

// Helper to check if point is in polygon
function isPointInPolygon(point: Coordinate, vs: Coordinate[] = []) {
    const x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].x, yi = vs[i].y;
        const xj = vs[j].x, yj = vs[j].y;

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

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

    constructor(api: IGeotabApi) {
        this.api = api;
    }

    /**
     * Fetch complete fleet data with parallel calls
     */
    async getFleetData(): Promise<VehicleData[]> {
        // 1. Core Lists (Devices & Status) - Global Fetch
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

            // [DEBUG-PROBE] Run probes for Q2 and Q3
            if (devices.length > 0) {
                const probeId = devices[0].id; // Use first available device
                console.log(`[PROBE] Starting Diagnostic Probe for Device: ${probeId}`);

                // Question 2: Verify Camera Data Exists (DiagnosticCameraStatusRoadId)
                // If this fails, the ID invalidates the whole batch.
                this.api.call('Get', {
                    typeName: 'StatusData',
                    search: {
                        deviceSearch: { id: probeId },
                        diagnosticSearch: { id: DiagnosticIds.CAMERA_STATUS_ROAD },
                        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                    },
                    resultsLimit: 1
                }).then(res => {
                    console.log('--- QUESTION 2 RESULT (Validity Check) ---');
                    console.log('Returned:', JSON.stringify(res, null, 2));
                }).catch(err => {
                    console.error('--- QUESTION 2 FAILED (Invalid ID?) ---', err);
                });

                // Question 3: DeviceStatusInfo Reality Check
                // Does it contain Fuel/SOC for active vehicles?
                this.api.call('Get', {
                    typeName: 'DeviceStatusInfo',
                    search: { deviceSearch: { id: probeId } }
                }).then(res => {
                    console.log('--- QUESTION 3 RESULT (DeviceStatusInfo) ---');
                    if (Array.isArray(res) && res.length > 0 && res[0].statusData) {
                        const ids = res[0].statusData.map((d: any) => typeof d.diagnostic === 'object' ? d.diagnostic.id : d.diagnostic);
                        console.log('DeviceStatusInfo contains diagnostics:', ids);
                        console.log('Has Fuel?', ids.includes(DiagnosticIds.FUEL_LEVEL));
                        console.log('Has SOC?', ids.includes(DiagnosticIds.STATE_OF_CHARGE));
                    } else {
                        console.log('DeviceStatusInfo has NO statusData.');
                    }
                }).catch(err => {
                    console.error('--- QUESTION 3 FAILED ---', err);
                });
            }

            // 2. Fetch ALL Diagnostics via Batched MultiCall
            // Includes Fuel, SOC, Charging, Camera Status, etc. behavior
            const diagnostics = await this.fetchVehicleDiagnostics(devices);

            const result = this.mergeData(devices, statuses, drivers, faults, diagnostics);
            return result;
        } catch (error) {
            console.error('[FleetDataService] Critical Error:', error);
            throw error;
        }
    }

    /**
     * Fetch all critical diagnostics (Vitals + Camera Health) using optimized batches.
     * Strategy: MultiCall with 7-day lookback (safe for dormant assets).
     * We fetch per-device streams to guarantee data coverage without hitting global result limits.
     */
    async fetchVehicleDiagnostics(devices: Device[]) {
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

        // CONFIGURATION: Performance Tuned (Safe with Limit 1)
        const CALLS_PER_BATCH = 250;     // ~27 vehicles per batch. 
        const RESULTS_LIMIT = 1;         // KEEPS PAYLOAD LIGHT. Critical for safety.

        // Speed vs Stability Balance
        // We can run parallel now because each return payload is tiny (250 items vs 25,000 previously)
        const DELAY_MS = 50;
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

        // Process in PARALLEL CHUNKS (Concurrency 4)
        // Now that payload is light, we can re-enable parallelism for speed.
        const chunks: any[][] = [];
        for (let i = 0; i < allCalls.length; i += CALLS_PER_BATCH) {
            chunks.push(allCalls.slice(i, i + CALLS_PER_BATCH));
        }

        const CONCURRENCY = 4;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
            const parallelBatch = chunks.slice(i, i + CONCURRENCY);
            // const batchNum = Math.floor(i / CALLS_PER_BATCH) + 1;

            try {
                // console.log(`[Fleet] Processing batch chunk ${batchNum}...`);
                const results = await Promise.all(
                    parallelBatch.map(chunk => this.api.multiCall<any[]>(chunk).catch(e => {
                        console.warn(`[FleetDataService] Batch failed`, e);
                        return [];
                    }))
                );

                // Flatten and filter
                results.flat().forEach(batchResults => {
                    // batchResults is Array<Array<StatusData>> from a single multiCall
                    if (Array.isArray(batchResults)) {
                        const valid = batchResults.flat().filter((r: any) => r && r.device);
                        allResults.push(...valid);
                    }
                });

                // Minimal delay to be polite to the API
                if (i + (CALLS_PER_BATCH * CONCURRENCY) < allCalls.length) {
                    await new Promise(r => setTimeout(r, DELAY_MS));
                }

            } catch (e) {
                console.error(`[FleetDataService] Parallel Execution Error:`, e);
            }
        }

        // console.log(`[Fleet] Fetched ${allResults.length} vitals across ${devices.length} devices`);
        return allResults;
    }

    private mergeData(
        devices: Device[],
        statuses: DeviceStatusInfo[],
        drivers: User[],
        faults: FaultData[],
        diagnosticsResults: StatusData[]
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

        // Pre-parse camera-related diagnostics
        const diagCameraPresence = new Set<string>();
        const cameraRelatedIds = new Set<string>([
            DiagnosticIds.CAMERA_STATUS_ROAD,
            DiagnosticIds.CAMERA_STATUS_DRIVER,
            DiagnosticIds.VIDEO_DEVICE_HEALTH,
            DiagnosticIds.CAMERA_ONLINE,
            DiagnosticIds.CAMERA_VIBRATION,
            DiagnosticIds.CAMERA_SEATBELT
        ]);

        diagnosticsResults.forEach(d => {
            const id = typeof d.diagnostic === 'string' ? d.diagnostic : d.diagnostic.id;
            if (cameraRelatedIds.has(id)) {
                diagCameraPresence.add(d.device.id);
            }
        });

        // Map statuses to their devices
        const statusMap = new Map<string, DeviceStatusInfo>();
        statuses.forEach(s => statusMap.set(s.device.id, s));

        // Driver Map
        const driverMap = new Map<string, string>();
        drivers.forEach(d => {
            const name = (d.firstName && d.lastName) ? `${d.firstName} ${d.lastName}` : d.name;
            driverMap.set(d.id, name);
        });

        // Build Vitals Map (Last Write Wins)
        // Groups all diagnostics by DeviceID -> DiagnosticID -> Latest Value
        const diagMap = new Map<string, Map<string, StatusData>>();

        // 1. Sort by Date Ascending (Oldest -> Newest) so last iteration is latest
        diagnosticsResults.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

        diagnosticsResults.forEach(r => {
            const devId = r.device.id;
            const diagId = typeof r.diagnostic === 'string' ? r.diagnostic : r.diagnostic.id;

            if (!diagMap.has(devId)) diagMap.set(devId, new Map());
            diagMap.get(devId)!.set(diagId, r);
        });

        // 1. Map Vehicles
        vehiclesRaw.forEach(d => {
            const s = statusMap.get(d.id);
            const devDiags = diagMap.get(d.id); // Map<DiagID, StatusData>

            // Fetch Vitals from Map
            const fuelLevel = devDiags?.get(DiagnosticIds.FUEL_LEVEL)?.data;
            const soc = devDiags?.get(DiagnosticIds.STATE_OF_CHARGE)?.data;
            const chargingState = devDiags?.get(DiagnosticIds.CHARGING_STATE)?.data;

            // Charging Logic
            let isCharging = false;
            if (chargingState && chargingState > 0) isCharging = true;
            // Fallback: check device status info
            if (!isCharging && s && s.statusData) {
                s.statusData.forEach(sd => {
                    const id = typeof sd.diagnostic === 'string' ? sd.diagnostic : sd.diagnostic.id;
                    if (id === DiagnosticIds.CHARGING_STATE && sd.data > 0) isCharging = true;
                });
            }

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

                // Get diagnostics for this specific device
                const latestHealth = devDiags?.get(DiagnosticIds.VIDEO_DEVICE_HEALTH);
                const latestRoad = devDiags?.get(DiagnosticIds.CAMERA_STATUS_ROAD);
                const latestOnline = devDiags?.get(DiagnosticIds.CAMERA_ONLINE);

                // Online/Offline check first
                if (latestOnline && latestOnline.data === 0) {
                    camHealth = 'offline';
                } else if (camStatus && !camStatus.isDeviceCommunicating) {
                    // Only mark offline based on camera device status if we have a physical camera pairing
                    if (camera) camHealth = 'offline';
                } else {
                    // Critical health states
                    if (latestHealth && (latestHealth.data === 2 || latestHealth.data === 3)) camHealth = 'critical';
                    else if (latestRoad && (latestRoad.data === 0 || latestRoad.data === 4)) camHealth = 'critical';
                    // Warning health states
                    else if (latestHealth && latestHealth.data === 1) camHealth = 'warning';
                    else if (latestRoad && (latestRoad.data === 1 || latestRoad.data === 3)) camHealth = 'warning';
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

        // 4. Enrich Metadata (VIN Decoding)
        this.enrichVehicleMetadata(vehicles);

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
     */
    async getZones(): Promise<Zone[]> {
        const zones = await this.api.call<Zone[]>('Get', {
            typeName: 'Zone',
            resultsLimit: 50000
        });

        return zones
            .filter(z => {
                // Remove zones that are categorized as "Home" using official ZoneType ID
                // This avoids filtering by the string "Home" in the name itself
                const isHomeZone = z.zoneTypes?.some(t => t.id === 'ZoneTypeHomeId');
                return !isHomeZone;
            })
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    }

    /**
     * Get vehicles in a specific zone (Wrapper for filtering)
     */
    async getVehicleDataForZone(zoneId: string): Promise<VehicleData[]> {
        const fullFleet = await this.getFleetData();
        const zones = await this.getZones();
        const targetZone = zones.find(z => z.id === zoneId);

        if (!targetZone || !targetZone.points) return [];

        const zoneVehicles = fullFleet.filter(v => {
            const point = { x: v.status.longitude, y: v.status.latitude };
            return isPointInPolygon(point, targetZone.points);
        });

        return zoneVehicles;
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
     */
    async getZoneVehicleCounts(zones: Zone[]): Promise<Record<string, number>> {
        const allStatuses = await this.api.call<DeviceStatusInfo[]>('Get', {
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


}
