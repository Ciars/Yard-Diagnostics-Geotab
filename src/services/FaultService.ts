/**
 * Geotab Fault Classification Service
 * 
 * Implements strict logic for interpreting Geotab Fault statuses based on Source.
 * Ref: https://geotab.com/ ... (User Verification)
 * 
 * LOGIC MATRIX:
 * -------------------------------------------------------------------------
 * Source       | Status             | Implication           | UI Severity
 * -------------------------------------------------------------------------
 * GO Device    | Active             | Action Required       | 🔴 Critical
 * GO Device    | Pending            | Minor / Firmware      | 🟢 Info
 * -------------------------------------------------------------------------
 * Vehicle (ECU)| Pending + Active   | Confirmed Persistent  | 🔴 Severe
 * Vehicle (ECU)| Pending (Only)     | Intermittent          | 🟡 Warning
 * Vehicle (ECU)| Active (Only)      | Historical / Resolved | ⚪ History (Hidden)
 * -------------------------------------------------------------------------
 */

import type { FaultData, ExceptionEvent } from '@/types/geotab';
import { GeotabSources, CAMERA_IOX_KEYWORDS, formatDiagnosticId } from '@/types/geotab';

export type FaultSeverity = 'critical' | 'severe' | 'warning' | 'info' | 'history';
export type FaultSource = 'device' | 'ecu';

/**
 * Fault Bucket Categories (3-Bucket System)
 * Categorizes faults by operational priority for UK/Ireland fleet operations
 */
export type FaultBucket =
    | 'camera_iox'      // Camera & Hardware Integration (IOX-based systems)
    | 'device_health'   // Telematics Device Health (GO unit)
    | 'vehicle_health'  // Vehicle Health (Engine/OBD)
    | 'unknown';        // Uncategorized

export interface ClassifiedFault {
    raw: FaultData;
    id: string;
    description: string;
    source: FaultSource;
    code: string; // DTC or formatted string
    severity: FaultSeverity;
    isOngoing: boolean; // Should count towards "Active Faults" badge
    date: string;
    count?: number; // For grouping duplicates
    bucket: FaultBucket; // 3-bucket categorization
}

export interface VehicleFaultSummary {
    items: ClassifiedFault[];
    ongoingCount: number;
    severeCount: number; // Subset of ongoing that are critical/severe
    historicalCount: number;
    // Bucket counts
    cameraIoxCount: number;
    deviceHealthCount: number;
    vehicleHealthCount: number;
}

const GO_CONTROLLER_PATTERN = /\bgo\d*\b/;
const TELEMATICS_NAME_KEYWORDS = [
    'telematics device fault',
    'geotab go',
    'go device',
    'go unit'
];

export function isTelematicsFault(fault: FaultData): boolean {
    const diagId = fault.diagnostic?.id || '';
    if (diagId.startsWith('DiagnosticDevice') || diagId.startsWith('DiagnosticGps')) {
        return true;
    }

    const failureModeSource = (fault.failureMode?.source || '').toLowerCase();
    if (
        failureModeSource.includes('telematics') ||
        failureModeSource.includes('device') ||
        (failureModeSource.includes('geotab') && failureModeSource.includes('go'))
    ) {
        return true;
    }

    const controller = (fault.controller?.name || '').toLowerCase();
    if (
        controller.includes('telematics') ||
        controller.includes('geotab') ||
        GO_CONTROLLER_PATTERN.test(controller)
    ) {
        return true;
    }

    const diagnosticName = (fault.diagnostic?.name || '').toLowerCase();
    return TELEMATICS_NAME_KEYWORDS.some((keyword) => diagnosticName.includes(keyword));
}

/**
 * Classify a list of raw Geotab faults into a structured summary
 */
// ... (existing interfaces)

/**
 * Classify a list of raw Geotab faults AND exceptions into a structured summary
 */
export function classifyFaults(faults: FaultData[], exceptions: ExceptionEvent[] = []): VehicleFaultSummary {
    const faultItems = faults.map(classifyFault);
    const exceptionItems = exceptions.map(classifyException);

    const allItems = [...faultItems, ...exceptionItems];

    // Deduplicate based on similar names/codes if necessary? 
    // For now, keep all as they might provide different context (Rule vs DTC).

    // Sort by Date Descending (Newest First)
    allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const ongoing = allItems.filter(f => f.isOngoing);
    const severe = ongoing.filter(f => f.severity === 'critical' || f.severity === 'severe');
    const historical = allItems.filter(f => f.severity === 'history');

    // Calculate bucket counts (only ongoing faults)
    const cameraIox = ongoing.filter(f => f.bucket === 'camera_iox');
    const deviceHealth = ongoing.filter(f => f.bucket === 'device_health');
    const vehicleHealth = ongoing.filter(f => f.bucket === 'vehicle_health');

    return {
        items: allItems,
        ongoingCount: ongoing.length,
        severeCount: severe.length,
        historicalCount: historical.length,
        cameraIoxCount: cameraIox.length,
        deviceHealthCount: deviceHealth.length,
        vehicleHealthCount: vehicleHealth.length
    };
}

/**
 * Classify a single Exception Event (Rule Violation)
 */
function classifyException(ex: ExceptionEvent): ClassifiedFault {
    const isActive = !ex.activeTo || ex.activeTo.startsWith('2050');

    // Determine Severity
    // Rule violations are generally "Events" that concern the user. 
    // If Active -> Severe/Critical
    let severity: FaultSeverity = 'info';
    if (isActive) {
        severity = 'severe'; // Assume Severe for active rules

        // boost "Engine" or "Critical" rules
        const name = (ex.rule.name || '').toLowerCase();
        if (name.includes('engine') || name.includes('critical') || name.includes('stop')) {
            severity = 'critical';
        }
    } else {
        severity = 'history';
    }

    return {
        raw: ex as any, // Store original if needed
        id: ex.id,
        description: ex.rule?.name || 'Unknown Rule',
        source: 'ecu', // Rules are usually vehicle-centric, or mixed. Default to ECU for display grouping.
        code: 'RULE',
        severity,
        isOngoing: isActive,
        date: ex.activeFrom,
        bucket: 'vehicle_health' // Exceptions are typically rule-based and vehicle-centric
    };
}

/**
 * Classify a single fault record
 */
function classifyFault(fault: FaultData): ClassifiedFault {
    const source = detectSource(fault);
    const status = parseStatus(fault); // 'active', 'pending', 'active+pending'
    const bucket = detectFaultBucket(fault); // 3-bucket categorization

    let severity: FaultSeverity = 'info';
    let isOngoing = false;

    // --- CLASSIFICATION RULES ---
    const daysSince = (new Date().getTime() - new Date(fault.dateTime).getTime()) / (1000 * 60 * 60 * 24);
    const DEVICE_FAULT_CUTOFF_DAYS = 7;

    if (source === 'device') {
        // Device Faults (Telematics - e.g. Unplugged, Restart)
        // STRICT LOGIC: Even if Geotab says "Active", a restart from 2 weeks ago is HISTORY.
        if (status.includes('active') && daysSince <= DEVICE_FAULT_CUTOFF_DAYS) {
            severity = 'critical';
            isOngoing = true; // Recent device issue = Problem
        } else {
            // Older than 7 days OR Pending -> History/Info
            if (status.includes('active')) {
                severity = 'history'; // Was active, but too old to care
            } else {
                severity = 'info';
            }
            isOngoing = false;
        }
    } else {
        // ECU Faults (Engine)
        // Standard OBD logic: Pending vs Active
        if (status === 'active_pending') {
            // Confirmed Persistent Issue
            severity = 'severe';
            isOngoing = true;
        } else if (status === 'pending') {
            // Potential / Intermittent
            severity = 'warning';
            isOngoing = true;
        } else if (status === 'active') {
            // "Active" in Geotab sometimes means "Historical/Confirmed" but not currently happening?
            // Actually, for ECU, if it's NOT pending, it might be a past confirmed code.
            // But usually "Active" means MIL ON.
            // Let's rely on date too? No, Engine Light ON is ON until cleared.
            // We trust ECU "Active" state regardless of date.
            severity = 'severe'; // Treat as Severe
            isOngoing = true;
        }
    }

    return {
        raw: fault,
        id: fault.id,
        description: formatDescription(fault),
        source,
        code: formatCode(fault),
        severity,
        isOngoing,
        date: fault.dateTime,
        bucket
    };
}

/**
 * Detect Geotab Source ID from fault data
 * Returns the Geotab source identifier (e.g., 'SourceGeotabGoId', 'SourceObdId')
 */
function detectGeotabSource(fault: FaultData): string {
    // Try to get source from failureMode first (most reliable)
    const failureModeSource = (fault.failureMode?.source || '').toLowerCase();

    // Map common patterns to Geotab source IDs
    if (failureModeSource.includes('go') || failureModeSource.includes('device')) {
        return GeotabSources.GEOTAB_GO;
    }
    if (failureModeSource.includes('obd')) {
        return GeotabSources.OBD;
    }
    if (failureModeSource.includes('j1939') || failureModeSource.includes('1939')) {
        return GeotabSources.J1939;
    }
    if (failureModeSource.includes('third') || failureModeSource.includes('party')) {
        return GeotabSources.THIRD_PARTY;
    }
    if (failureModeSource.includes('proprietary')) {
        return GeotabSources.PROPRIETARY;
    }

    if (isTelematicsFault(fault)) {
        return GeotabSources.GEOTAB_GO;
    }

    // Default to OBD for vehicle faults
    return GeotabSources.OBD;
}

/**
 * Detect which of the 3 buckets a fault belongs to
 * 
 * Priority Order (matches Python script):
 * 1. Camera/IOX Hardware (name-based detection - cameras may appear as GO device faults)
 * 2. Telematics Device Health (GO unit with specific codes)
 * 3. Vehicle Health (OBD/J1939 engine faults)
 */
function detectFaultBucket(fault: FaultData): FaultBucket {
    const diagnosticName = fault.diagnostic?.name || '';
    const source = detectGeotabSource(fault);

    // Note: Numeric code detection logic removed as it's not currently used
    // Can be added later if specific code-based categorization is needed

    // PRIORITY 1: Camera/IOX Hardware Detection
    // Cameras connect via IOX port but may appear as GO device faults
    const isCameraKeyword = CAMERA_IOX_KEYWORDS.some(keyword =>
        diagnosticName.toLowerCase().includes(keyword.toLowerCase())
    );

    if (isCameraKeyword) {
        return 'camera_iox';
    }

    // Also check for explicit third-party sources
    if (source === GeotabSources.THIRD_PARTY || source === GeotabSources.PROPRIETARY) {
        return 'camera_iox';
    }

    // PRIORITY 2: Telematics Device Health (GO Unit)
    if (source === GeotabSources.GEOTAB_GO) {
        return 'device_health';
    }

    // PRIORITY 3: Vehicle Health (Engine/OBD)
    if (source === GeotabSources.OBD || source === GeotabSources.J1939) {
        return 'vehicle_health';
    }

    // Fallback: categorize by diagnostic ID patterns
    const diagId = fault.diagnostic?.id || '';
    if (diagId.startsWith('DiagnosticDevice') || diagId.startsWith('DiagnosticGps')) {
        return 'device_health';
    }

    return 'unknown';
}

/**
 * Determine if fault is from Device or ECU
 */
function detectSource(fault: FaultData): FaultSource {
    const geotabSource = detectGeotabSource(fault);
    if (
        geotabSource === GeotabSources.GEOTAB_GO ||
        geotabSource === GeotabSources.THIRD_PARTY ||
        geotabSource === GeotabSources.PROPRIETARY
    ) {
        return 'device';
    }

    const src = ((fault as any).source || '').toLowerCase();
    if (src.includes('device') || src.includes('go')) {
        return 'device';
    }

    return 'ecu';
}

/**
 * Normalize Geotab status
 * Note: Geotab FaultData 'faultState' is often confusing.
 * For this logic, we rely on the specific string values.
 */
function parseStatus(fault: FaultData): 'active' | 'pending' | 'active_pending' {
    const state = (fault.faultState || '').toLowerCase();

    if (state === 'pendingactive' || (state.includes('active') && state.includes('pending'))) {
        return 'active_pending';
    }
    if (state === 'pending') {
        return 'pending';
    }
    // Default to active if unknown, or explicit active
    return 'active';
}

/**
 * Format readable code (e.g. P0420 or "Code 123")
 */
function formatCode(fault: FaultData): string {
    if (fault.failureMode?.code) {
        return fault.failureMode.code; // DTC
    }
    // Fallback: only use raw ID if it's short or looks like a real code
    const rawId = fault.diagnostic?.id || '';
    if (rawId.startsWith('Diagnostic')) {
        const shortId = rawId.replace('Diagnostic', '').replace('Id', '');
        // If it's more than 20 chars, it's likely a composite string, ignore it.
        if (shortId.length <= 20) return shortId;
    }
    return '';
}

/**
 * Readable Description
 */
function formatDescription(fault: FaultData): string {
    const rawDiagName = fault.diagnostic?.name?.trim();
    const failureModeName = fault.failureMode?.name?.trim();
    const controllerName = fault.controller?.name?.trim() || '';
    const diagnosticId = fault.diagnostic?.id?.trim();

    let diagName = rawDiagName;

    // Geotab often returns placeholder names; promote better fallbacks before rendering.
    if (!diagName || diagName.toLowerCase() === 'unknown fault' || diagName.toLowerCase() === 'unknown diagnostic') {
        if (failureModeName && !failureModeName.toLowerCase().includes('unknown')) {
            diagName = failureModeName;
        } else if (diagnosticId) {
            diagName = formatDiagnosticId(diagnosticId);
        } else if (fault.failureMode?.code) {
            diagName = `Fault code ${fault.failureMode.code}`;
        } else {
            diagName = 'Unnamed Fault';
        }
    }

    // If we have a controller name and it's not generic "Telematics", add it for context
    if (controllerName && !controllerName.toLowerCase().includes('telematics')) {
        return `${diagName} (${controllerName})`;
    }

    return diagName;
}
