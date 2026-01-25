/**
 * GeoYard Diagnostics - Geotab Type Definitions
 * 
 * These types mirror the Geotab SDK entities used by the application.
 * See: https://geotab.github.io/sdk/software/api/reference/
 */

// =============================================================================
// Core Entities
// =============================================================================

export interface Device {
    id: string;
    name: string;
    serialNumber: string;
    vehicleIdentificationNumber?: string;
    licensePlate?: string;
    deviceType?: string;
    comment?: string;
    groups?: EntityReference[];
}

export interface Zone {
    id: string;
    name: string;
    comment?: string;
    zoneTypes?: ZoneType[];
    points?: Coordinate[];
    displayed?: boolean;
    fillColor?: Color;
}

export interface ZoneType {
    id: string;
    name?: string;
    comment?: string;
}

export interface Coordinate {
    x: number; // longitude
    y: number; // latitude
}

export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

// =============================================================================
// Status & Telemetry
// =============================================================================

export interface DeviceStatusInfo {
    device: EntityReference;
    driver?: EntityReference;
    currentStateDuration: string; // ISO 8601 duration
    isDeviceCommunicating: boolean;
    isDriving: boolean;
    speed: number;
    bearing: number;
    latitude: number;
    longitude: number;
    dateTime: string;
    groups?: EntityReference[];
    isInCurrentZones?: boolean;
}

export interface StatusData {
    id: string;
    device: EntityReference;
    diagnostic: EntityReference;
    data: number;
    dateTime: string;
}

export interface FaultData {
    id: string;
    device: EntityReference;
    diagnostic: EntityReference;
    controller: EntityReference;
    failureMode: FailureMode;
    faultState?: 'Pending' | 'Active' | 'PendingActive' | 'None'; // Geotab fault state
    dateTime: string;
    dismissDateTime?: string;
    dismissUser?: EntityReference;
}

// =============================================================================
// Unified Issues System
// =============================================================================

/** Priority level for vehicle issues - user-facing labels */
export type IssuePriority = 'recurring' | 'alert' | 'monitor' | 'info';

/** Source of the fault - engine ECU or GO device */
export type IssueSource = 'engine' | 'device';

/** Unified vehicle issue - combines engine faults and device alerts */
export interface VehicleIssue {
    id: string;
    name: string;              // Human-readable name (may be "System Fault" fallback)
    priority: IssuePriority;
    source: IssueSource;
    lastOccurred: string;      // ISO timestamp
    occurrenceCount?: number;  // If grouped
    dtcCode?: string;          // DTC code from failureMode.code
    rawFaultState?: string;    // Original Geotab faultState
    rawDiagnosticId?: string;  // Raw diagnostic.id for display
    failureModeName?: string;  // Name from failureMode.name
    controllerName?: string;   // Controller that reported the fault
    severity?: string;         // From failureMode.severity
}

export interface FailureMode {
    id: string;
    name?: string;
    code?: string;
    source?: string;
    severity?: 'Critical' | 'Warning' | 'Info' | 'Medium' | 'Low';
}

// =============================================================================
// Trips & Movement
// =============================================================================

export interface Trip {
    id: string;
    device: EntityReference;
    driver?: EntityReference;
    start: string; // ISO date
    stop: string;  // ISO date
    distance: number;
    drivingDuration: string;
    stopDuration?: string;
    stopPoint?: Coordinate;
    nextTripStart?: string;
}

// =============================================================================
// DVIR & Maintenance
// =============================================================================

export interface DVIRDefect {
    id: string;
    device: EntityReference;
    dateTime: string;
    defect: string;
    repairStatus: 'NotRepaired' | 'Repaired' | 'NotNecessary';
    severity?: 'Critical' | 'NonCritical';
    repairedDateTime?: string;
    certifiedBy?: EntityReference;
}

export interface MaintenanceReminder {
    id: string;
    device: EntityReference;
    rule: EntityReference;
    dueDate?: string;
    dueMileage?: number;
    lastServiceDate?: string;
}

// =============================================================================
// User & Driver
// =============================================================================

export interface User {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
}

export interface Driver extends User {
    keys?: string[];
}

// =============================================================================
// Diagnostics Reference
// =============================================================================

export const DiagnosticIds = {
    /** Battery voltage - Alert if < 11.8V */
    BATTERY_VOLTAGE: 'DiagnosticInternalDeviceVoltageId',

    /** Fuel level percentage (0-100) */
    FUEL_LEVEL: 'DiagnosticFuelLevelId',

    /** EV State of Charge percentage (0-100) */
    STATE_OF_CHARGE: 'DiagnosticStateOfChargeId',

    /** EV Range in miles */
    EV_RANGE: 'DiagnosticElectricVehicleRangeId',

    /** Charging state: 0=Not Charging, >0=Charging */
    CHARGING_STATE: 'DiagnosticChargingStateId',

    /** Odometer reading */
    ODOMETER: 'DiagnosticOdometerId',

    // Telematics / Device Health
    DEVICE_UNPLUGGED: 'DiagnosticDeviceUnpluggedId',
    DEVICE_POWER_REMOVED: 'DiagnosticDevicePowerRemovedId',
    DEVICE_RESTARTED: 'DiagnosticDeviceRestartId',
    GPS_DISCONNECTED: 'DiagnosticGpsDisconnectedId',
    CAMERA_OBSTRUCTION: 'DiagnosticCameraObstructionId',
} as const;

export type DiagnosticId = typeof DiagnosticIds[keyof typeof DiagnosticIds];

/**
 * Common Geotab Diagnostic Name Mappings
 * Maps raw Geotab IDs to human-readable names for Fleet Managers and Mechanics
 */
export const GEOTAB_DIAGNOSTIC_MAP: Record<string, string> = {
    // Device Events
    'DiagnosticDeviceRestartedBecauseAllPowerWasRemovedId': 'Device Restart (Power Loss)',
    'DiagnosticDeviceRestartedBecauseOfFirmwareUpdatedId': 'Firmware Update',
    'DiagnosticDeviceRestartedBecauseOfWatchdogTimeoutId': 'Device Restart (Watchdog)',
    'DiagnosticDeviceRestartedBecauseOfUserRequestId': 'Device Restart (User Request)',
    'DiagnosticDeviceUnpluggedId': 'Device Unplugged',
    'DiagnosticDevicePowerRemovedId': 'Power Disconnected',
    'DiagnosticGpsDisconnectedId': 'GPS Signal Lost',

    // Vehicle Diagnostics
    'DiagnosticInternalDeviceVoltageId': 'Battery Voltage',
    'DiagnosticFuelLevelId': 'Fuel Level',
    'DiagnosticStateOfChargeId': 'Battery Charge (EV)',
    'DiagnosticChargingStateId': 'Charging Status',
    'DiagnosticOdometerId': 'Odometer',

    // Driving Events
    'DiagnosticAccidentLevelAccelerationEventId': 'Harsh Acceleration',
    'DiagnosticAccidentLevelBrakingEventId': 'Harsh Braking',
    'DiagnosticAccidentLevelCorneringEventId': 'Harsh Cornering',
    'DiagnosticSpeedingEventId': 'Speeding Event',
    'DiagnosticIdlingEventId': 'Excessive Idling',

    // Common Engine Faults (OBD-II standard codes)
    'DiagnosticEngineCheckLightId': 'Check Engine Light (MIL)',
    'DiagnosticEngineCoolantTemperatureId': 'Coolant Temperature Warning',
    'DiagnosticEngineOilPressureId': 'Low Oil Pressure',
    'DiagnosticEngineOilTemperatureId': 'High Oil Temperature',
    'DiagnosticTransmissionTemperatureId': 'Transmission Overheating',

    // Safety Systems
    'DiagnosticAbsLightId': 'ABS Warning Light',
    'DiagnosticAirbagLightId': 'Airbag System Fault',
    'DiagnosticTirePressureLowId': 'Low Tire Pressure (TPMS)',
    'DiagnosticBrakePadWearId': 'Brake Pad Wear Warning',
    'DiagnosticParkingBrakeEngagedId': 'Parking Brake Engaged',

    // Electrical
    'DiagnosticAlternatorFailureId': 'Alternator Failure',
    'DiagnosticBatteryVoltageHighId': 'Battery Overcharge',
    'DiagnosticBatteryVoltageLowId': 'Low Battery Voltage',

    // Emissions
    'DiagnosticDefFluidLevelLowId': 'Low DEF Fluid (AdBlue)',
    'DiagnosticDpfRegenerationNeededId': 'DPF Regeneration Required',
    'DiagnosticCatalyticConverterEfficiencyId': 'Catalytic Converter Issue',
};

/**
 * Format a raw Geotab ID into something readable for Fleet Managers
 * Prioritizes clarity over technical accuracy
 */
export function formatDiagnosticId(id: string): string {
    if (!id) return 'Unknown Diagnostic';

    // Check our curated map first
    if (GEOTAB_DIAGNOSTIC_MAP[id]) return GEOTAB_DIAGNOSTIC_MAP[id];

    // Detect garbage patterns early (random-looking strings)
    // These appear as obfuscated controller codes like "aoSieg C D N S..."
    if (looksLikeGarbage(id)) {
        return 'System Fault';
    }

    // Clean up standard Geotab diagnostic ID format
    let label = id.replace(/^Diagnostic/, '').replace(/Id$/, '');

    // Add spaces before capitals (e.g. DeviceRestarted -> Device Restarted)
    label = label.replace(/([A-Z])/g, ' $1').trim();

    // If still too long or contains unusual patterns, simplify
    if (label.length > 35) {
        return 'System Fault';
    }

    return label || 'Unknown Fault';
}

/**
 * Detect garbage/obfuscated diagnostic IDs (OEM-proprietary codes)
 * Examples: "a+Rng C D N S Um EN Or A W47 g Q", "ae ArVlstev7 USB B D E D0e J7 Fq"
 */
export function looksLikeGarbage(id: string): boolean {
    if (!id) return true;

    // Check the formatted name, not just the raw ID
    const testString = id;

    // Multiple single-character or very short "words" separated by spaces
    const segments = testString.split(/\s+/);
    const shortSegments = segments.filter(s => s.length <= 2);
    if (segments.length >= 4 && shortSegments.length >= 2) {
        return true;
    }

    // Contains unusual mix of alphanumeric in each segment (like "W47", "D0e", "J7")
    const mixedSegments = segments.filter(s => /^[a-zA-Z]+\d+$|^\d+[a-zA-Z]+$|^[a-zA-Z]\d+[a-zA-Z]$/.test(s));
    if (mixedSegments.length >= 2) {
        return true;
    }

    // Contains multiple plus signs or unusual punctuation
    if (/[+]{1,}/.test(testString) && testString.length > 10) {
        return true;
    }

    // Looks like base64 or encoded (mix of upper, lower, numbers in random pattern)
    // Check if it has the chaotic pattern of OEM codes
    const hasRandomMix = /[a-z][A-Z]|[A-Z][a-z][A-Z]|\d[a-zA-Z]\d/.test(testString) &&
        segments.some(s => s.length >= 3 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s));
    if (hasRandomMix && segments.length >= 3) {
        return true;
    }

    // Too many capital letters in a row (not CamelCase)
    if (/[A-Z]{4,}/.test(testString) && !testString.startsWith('Diagnostic')) {
        return true;
    }

    // Mostly non-alphabetic
    const alphaCount = (testString.match(/[a-zA-Z]/g) || []).length;
    if (alphaCount < testString.length * 0.5 && testString.length > 5) {
        return true;
    }

    return false;
}

// =============================================================================
// API Types
// =============================================================================

export interface EntityReference {
    id: string;
    name?: string;
}

export interface GeotabSession {
    database: string;
    userName: string;
    sessionId: string;
    path: string;
}

export interface GeotabCredentials {
    server: string;
    database: string;
    userName: string;
    password: string;
}

export interface ApiCall {
    method: string;
    params: Record<string, unknown>;
}

export interface ApiError {
    name: string;
    message: string;
    errors?: { name: string; message: string }[];
}

// =============================================================================
// Application-Specific Types
// =============================================================================

export interface VehicleData {
    device: Device;
    status: DeviceStatusInfo;
    driverName?: string;
    makeModel?: string;
    batteryVoltage?: number;
    fuelLevel?: number;
    stateOfCharge?: number;
    isCharging: boolean;
    dormancyDays: number | null; // null means never moved (since install)
    zoneEntryTime?: string; // ISO timestamp when vehicle entered this zone
    zoneDurationMs: number | null; // Duration in zone in milliseconds (clamped to 0). null if unknown.
    isZoneEntryEstimate?: boolean; // true if zoneEntryTime is from fallback (less confident)
    hasCriticalFaults: boolean;
    hasUnrepairedDefects: boolean; // Computed summary flag
    // structured health data
    health: {
        dvir: {
            defects: Array<{
                id: string;
                defectName: string;
                comment?: string;
                date: string;
                driverName: string;
                repairStatus?: string;
                isRepaired?: boolean; // New flag for styling
                certifiedBy?: string;
            }>;
            isClean: boolean;
        };
        /** Unified issues list - replaces separate telematics/mechanical */
        issues: VehicleIssue[];
        /** Quick flag for row-level icon */
        hasRecurringIssues: boolean;
        /** Device communication status (kept for backward compat) */
        isDeviceOffline: boolean;
        lastHeartbeat: string | undefined;
    };
    activeFaults: FaultData[]; // Keep for backward compat or raw view
    lastTrip?: Trip;
    serviceDueDays?: number;
}

export type KpiFilterType =
    | 'critical'
    | 'silent'
    | 'dormant'
    | 'charging'
    | 'serviceDue';

export interface KpiCounts {
    critical: number;
    silent: number;
    dormant: number;
    charging: number;
    serviceDue: number;
}
