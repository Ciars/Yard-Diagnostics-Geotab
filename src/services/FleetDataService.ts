
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

            // console.log(`[FleetDataService] Core Loaded: ${devices.length} Devices`);

            // 2. Fetch Global Vitals & Camera Discovery (Bulk Scan)
            const vitals = await this.fetchGlobalVitals();

            const result = this.mergeData(devices, statuses, drivers, faults, vitals);
            // console.log(`[FleetDataService] Merged Data: ${result.length} Vehicles`);
            return result;
        } catch (error) {
            console.error('[FleetDataService] Critical Error:', error);
            throw error;
        }
    }

    /**
     * Fetch latest diagnostic values globally across the fleet using MultiCall.
     * Use 7-day lookback for cameras to catch infrequent reports.
     * Use 24-hour lookback for vitals (Fuel/SOC).
     */
    public async fetchGlobalVitals() {
        const now = Date.now();
        const fromDateVitals = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        const fromDateCameras = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

        // console.log('[FleetDataService] Fetching global diagnostics (Parallel Individual Calls)...');

        // 1. Define Vitals Configs
        const vitalsConfigs = [
            { key: 'fuelResults', id: DiagnosticIds.FUEL_LEVEL },
            { key: 'socResults', id: DiagnosticIds.STATE_OF_CHARGE },
            { key: 'chargingResults', id: DiagnosticIds.CHARGING_STATE },
            { key: 'acPowerResults', id: DiagnosticIds.AC_INPUT_POWER },
            { key: 'batteryPowerResults', id: DiagnosticIds.HV_BATTERY_POWER }
        ];

        // 2. Define Camera Configs
        const cameraConfigs = [
            { key: 'camRoad', id: DiagnosticIds.CAMERA_STATUS_ROAD },
            { key: 'camDriver', id: DiagnosticIds.CAMERA_STATUS_DRIVER },
            { key: 'camHealth', id: DiagnosticIds.VIDEO_DEVICE_HEALTH },
            { key: 'camOnline', id: DiagnosticIds.CAMERA_ONLINE },
            { key: 'camVib', id: DiagnosticIds.CAMERA_VIBRATION },
            { key: 'camSeat', id: DiagnosticIds.CAMERA_SEATBELT }
        ];

        // 3. Helper to create a Safe Request
        const fetchSafe = async (id: string, fromDate: string, limit: number, label: string) => {
            try {
                return await this.api.call<StatusData[]>('Get', {
                    typeName: 'StatusData',
                    search: { diagnosticSearch: { id }, fromDate },
                    resultsLimit: limit
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn(`[FleetDataService] Failed to fetch ${label} (${id}): ${msg}`);
                return [] as StatusData[]; // Return empty array on failure
            }
        };

        // 4. Execute All Requests in Parallel
        const vitalsPromises = vitalsConfigs.map(c => {
            // EV Data is very dense (high frequency), so we use a lower limit to prevent timeouts
            const limit = (c.key === 'fuelResults') ? 5000 : 1000;
            return fetchSafe(c.id, fromDateVitals, limit, c.key);
        });

        const cameraPromises = cameraConfigs.map(c =>
            fetchSafe(c.id, fromDateCameras, 5000, c.key)
        );

        const [vitalsResults, cameraResults] = await Promise.all([
            Promise.all(vitalsPromises),
            Promise.all(cameraPromises)
        ]);

        // 5. Assemble Result
        return {
            fuelResults: vitalsResults[0],
            socResults: vitalsResults[1],
            chargingResults: vitalsResults[2],
            acPowerResults: vitalsResults[3],
            batteryPowerResults: vitalsResults[4],
            cameraResults: cameraResults.flat() // Combine all camera stats into one list
        };
    }

    private mergeData(
        devices: Device[],
        statuses: DeviceStatusInfo[],
        drivers: User[],
        faults: FaultData[],
        vitals: {
            fuelResults: StatusData[],
            socResults: StatusData[],
            chargingResults: StatusData[],
            acPowerResults: StatusData[],
            batteryPowerResults: StatusData[],
            cameraResults: StatusData[]
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

        // Pre-parse camera-related diagnostics from vitals (Global Scan)
        const diagCameraPresence = new Set<string>();
        vitals.cameraResults.forEach(d => {
            diagCameraPresence.add(d.device.id);
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

        // Helpers to get Latest Value from array
        const getLatest = (data: StatusData[]) => {
            const map = new Map<string, number>();
            // Sort Chronological
            data.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
            // Iterate and set (last write wins)
            data.forEach(d => map.set(d.device.id, d.data));
            return map;
        };

        const fuelMap = getLatest(vitals.fuelResults);
        const socMap = getLatest(vitals.socResults);
        const chargingMap = getLatest(vitals.chargingResults);
        const acPowerMap = getLatest(vitals.acPowerResults);
        const batteryPowerMap = getLatest(vitals.batteryPowerResults);

        // 1. Map Vehicles
        vehiclesRaw.forEach(d => {
            const isChargingVal = chargingMap.get(d.id);
            const s = statusMap.get(d.id);

            // Find linked camera
            const camera = cameras.find(c => {
                const cName = (c.name || '').toLowerCase();
                const vName = (d.name || '').toLowerCase();
                // Heuristic: Camera name contains vehicle name or vice-versa, or they share a suffix/prefix
                return cName.includes(vName) || vName.includes(cName);
            });

            const camStatus = camera ? statusMap.get(camera.id) : undefined;
            const hasCameraViaDiag = diagCameraPresence.has(d.id);

            // Determine Camera Health
            let camHealth: 'good' | 'warning' | 'critical' | 'offline' | undefined = undefined;
            if (camera || hasCameraViaDiag) {
                camHealth = 'good'; // Default if present

                // Check for health diagnostics
                const healthLogs = vitals.cameraResults
                    .filter(log => log.device.id === d.id)
                    .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

                const latestHealth = healthLogs.find(l => {
                    const id = typeof l.diagnostic === 'string' ? l.diagnostic : l.diagnostic?.id;
                    return id === DiagnosticIds.VIDEO_DEVICE_HEALTH;
                });

                const latestRoad = healthLogs.find(l => {
                    const id = typeof l.diagnostic === 'string' ? l.diagnostic : l.diagnostic?.id;
                    return id === DiagnosticIds.CAMERA_STATUS_ROAD;
                });

                const latestOnline = healthLogs.find(l => {
                    const id = typeof l.diagnostic === 'string' ? l.diagnostic : l.diagnostic?.id;
                    return id === DiagnosticIds.CAMERA_ONLINE;
                });

                // Online/Offline check first
                if (latestOnline && latestOnline.data === 0) {
                    camHealth = 'offline';
                } else if (camStatus && !camStatus.isDeviceCommunicating) {
                    camHealth = 'offline';
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

                // Charging: > 0 means charging
                isCharging:
                    (isChargingVal !== undefined && isChargingVal > 0) ||
                    (acPowerMap.get(d.id) !== undefined && (acPowerMap.get(d.id) || 0) > 0) ||
                    (batteryPowerMap.get(d.id) !== undefined && (batteryPowerMap.get(d.id) || 0) < -100), // -100 Watts threshold

                driverName: 'No Driver',
                makeModel: '--',

                fuelLevel: fuelMap.get(d.id),
                stateOfCharge: socMap.get(d.id),

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
