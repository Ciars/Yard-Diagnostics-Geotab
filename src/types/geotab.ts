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
    activeFrom?: string;
    activeTo?: string;
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
    statusData?: StatusData[];
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

// =============================================================================
// Trips & Movement
// =============================================================================

export interface ChargeEvent {
    id: string;
    device: EntityReference;
    startTime: string; // ISO date
    duration?: string; // "d.hh:mm:ss.fffffff"
    chargeType?: string; // "AC", "DC", "Unknown"
    startStateOfCharge?: number;
    endStateOfCharge?: number;
    energyConsumedKwh?: number;
    peakPowerKw?: number;
    location?: Coordinate;
    tripStop?: string; // ISO date
}

export interface ExceptionEvent {
    id: string;
    activeFrom: string;
    activeTo?: string; // If 'MaxDate' (2050...) or null, it's active
    rule: {
        id: string;
        name: string;
    };
    device: {
        id: string;
        name: string;
    };
    diagnostic?: { // Sometimes present if rule is fault-based
        id: string;
        name: string;
        code?: string;
    };
}

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

    /** Charging state: 0=Not Charging, 1=AC, 2=DC */
    CHARGING_STATE: 'DiagnosticElectricVehicleChargingStateId',

    /** AC Input Power: >0 implies plugging in (Physics Approach) */
    AC_INPUT_POWER: 'DiagnosticOnBoardChargerACInputPowerId',

    /** AC Input Voltage: >0 implies plugging in */
    AC_INPUT_VOLTAGE: 'DiagnosticOnBoardChargerAcInputVoltageId',

    /** HV Battery Power: Negative = Charging/Regen */
    HV_BATTERY_POWER: 'DiagnosticElectricVehicleBatteryPowerId',

    /** HV Battery Current: Negative = Charging/Regen */
    HV_BATTERY_CURRENT: 'DiagnosticElectricVehicleBatteryCurrentId',

    /** Odometer reading */
    ODOMETER: 'DiagnosticOdometerId',

    /** Engine running hours (total) */
    ENGINE_HOURS: 'DiagnosticEngineHoursId',

    /** DEF (Diesel Exhaust Fluid / AdBlue) Level percentage */
    DEF_LEVEL: 'DiagnosticDefFluidLevelId',

    /** Engine coolant temperature */
    COOLANT_TEMP: 'DiagnosticEngineCoolantTemperatureId',

    /** Engine speed (RPM) */
    ENGINE_SPEED: 'DiagnosticEngineSpeedId',

    // Telematics / Device Health
    DEVICE_UNPLUGGED: 'DiagnosticDeviceUnpluggedId',
    DEVICE_POWER_REMOVED: 'DiagnosticDevicePowerRemovedId',
    DEVICE_RESTARTED: 'DiagnosticDeviceRestartId',
    GPS_DISCONNECTED: 'DiagnosticGpsDisconnectedId',
    CAMERA_OBSTRUCTION: 'DiagnosticCameraObstructionId',

    // Camera/Video Connectivity & Health
    CAMERA_STATUS_ROAD: 'abVlGQsHdkkypYl_qqR648Q',
    CAMERA_STATUS_DRIVER: 'aVxmItJBs5EWZHWFBo3GNBg',
    VIDEO_DEVICE_HEALTH: 'aOzdYMcJkw06ft9g4uXvpIA',
    CAMERA_ONLINE: 'agOuG7rbW8E6XflBF30wmyQ',
    CAMERA_VIBRATION: 'aFX4DZw7dqkK9KJcgrPS6vw',
    CAMERA_SEATBELT: 'aKCFX70m_eE2Ob8EZuDXCqQ',
} as const;

export type DiagnosticId = typeof DiagnosticIds[keyof typeof DiagnosticIds];

// =============================================================================
// Geotab Source IDs (for Fault Categorization)
// =============================================================================

/**
 * Geotab Diagnostic Source IDs
 * Used to determine the origin of a fault for proper categorization
 */
export const GeotabSources = {
    /** Geotab GO device (telematics unit) */
    GEOTAB_GO: 'SourceGeotabGoId',
    /** Third-party device (e.g., external sensors) */
    THIRD_PARTY: 'SourceThirdPartyId',
    /** Proprietary OEM device */
    PROPRIETARY: 'SourceProprietaryId',
    /** OBD-II (Light Duty Vehicles) */
    OBD: 'SourceObdId',
    /** J1939 (Heavy Duty Vehicles) */
    J1939: 'SourceJ1939Id'
} as const;

/**
 * Critical Device Fault Codes (Geotab GO Unit)
 * These codes indicate specific device health issues for UK/Ireland fleet operations
 */
export const DeviceFaultCodes = {
    /** Device unplugged or tampered with - CRITICAL */
    UNPLUGGED: 136,
    /** Loose installation or mounting - causes false accelerometer data */
    LOOSE_INSTALL_166: 166,
    /** Loose installation (alternate code) */
    LOOSE_INSTALL_174: 174,
    /** Power loss event */
    POWER_LOSS_130: 130,
    /** Device reboot event */
    POWER_LOSS_131: 131,
    /** Modem or network failure */
    MODEM_FAILURE: 147
} as const;

/**
 * Emissions-related keywords for UK/Ireland compliance
 * Faults containing these keywords are critical for commercial fleet operations
 */
export const EMISSIONS_KEYWORDS = [
    'adblue',
    'reductant',
    'dpf',
    'particulate',
    'def',
    'scr'
] as const;

/**
 * Camera/IOX Hardware keywords for detection
 * Cameras and peripherals connect via IOX port but may appear as GO device faults
 */
export const CAMERA_IOX_KEYWORDS = [
    'iox',
    'usb',
    'camera',
    'aux',
    'video'
] as const;

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

    // Camera/Video
    'abVlGQsHdkkypYl_qqR648Q': 'Camera Status (Road)',
    'aVxmItJBs5EWZHWFBo3GNBg': 'Camera Status (Driver)',
    'aOzdYMcJkw06ft9g4uXvpIA': 'Video Device Health',
    'agOuG7rbW8E6XflBF30wmyQ': 'Camera Connectivity',
    'aFX4DZw7dqkK9KJcgrPS6vw': 'Camera Vibration (Standby)',
    'aKCFX70m_eE2Ob8EZuDXCqQ': 'Camera Seatbelt Sensing',
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

/**
 * Extended diagnostic metrics for comprehensive vehicle health monitoring
 * These values are fetched on-demand when expanding vehicle details
 */
export interface ExtendedDiagnostics {
    /** Odometer reading in kilometers */
    odometer?: number;
    /** Total engine running hours */
    engineHours?: number;
    /** DEF (AdBlue) fluid level percentage (0-100) */
    defLevel?: number;
    /** Engine coolant temperature in Celsius */
    coolantTemp?: number;
    /** Current engine speed in RPM */
    engineSpeed?: number;
    /** Battery voltage in volts */
    batteryVoltage?: number;
    /** Electrical System Rating - calculated health score (0-100) */
    electricalSystemRating?: number;
}

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
                dvirLogId?: string;
                defectName: string;
                comment?: string;
                date: string;
                driverName: string;
                repairStatus?: string; // Restored
                isRepaired?: boolean; // New flag for styling
                certifiedBy?: string;
            }>;
            isClean: boolean;
            /** Latest DVIR log timestamp for this asset (if available) */
            lastInspectionAt?: string;
        };
        // New strict fault analysis
        faultAnalysis?: {
            items: any[]; // ClassifiedFault[]
            ongoingCount: number;
            severeCount: number;
            historicalCount: number;
        };
        /** Unified issues list - replaces separate telematics/mechanical */
        issues: VehicleIssue[];
        /** Quick flag for row-level icon */
        hasRecurringIssues: boolean;
        /** Active exception events in current list context */
        exceptionSummary?: {
            activeCount: number;
        };
        /** Device communication status (kept for backward compat) */
        isDeviceOffline: boolean;
        lastHeartbeat: string | undefined;
    };
    activeFaults: FaultData[]; // Keep for backward compat or raw view
    lastTrip?: Trip;
    extendedDiagnostics?: ExtendedDiagnostics; // On-demand health metrics
    cameraStatus?: {
        isOnline: boolean;
        health?: 'good' | 'warning' | 'critical' | 'offline';
        lastHeartbeat?: string;
        deviceId?: string;
        name?: string;
    };
}

export type KpiFilterType =
    | 'critical'
    | 'silent'
    | 'dormant'
    | 'charging'
    | 'camera';

export interface KpiCounts {
    critical: number;
    silent: number;
    dormant: number;
    charging: number;
    camera: number;
}
