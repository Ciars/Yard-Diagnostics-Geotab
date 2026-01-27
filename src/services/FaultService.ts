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

export type FaultSeverity = 'critical' | 'severe' | 'warning' | 'info' | 'history';
export type FaultSource = 'device' | 'ecu';

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
}

export interface VehicleFaultSummary {
    items: ClassifiedFault[];
    ongoingCount: number;
    severeCount: number; // Subset of ongoing that are critical/severe
    historicalCount: number;
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

    return {
        items: allItems,
        ongoingCount: ongoing.length,
        severeCount: severe.length,
        historicalCount: historical.length
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
        date: ex.activeFrom
    };
}

/**
 * Classify a single fault record
 */
function classifyFault(fault: FaultData): ClassifiedFault {
    const source = detectSource(fault);
    const status = parseStatus(fault); // 'active', 'pending', 'active+pending'

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
        date: fault.dateTime
    };
}

/**
 * Determine if fault is from Device or ECU
 */
function detectSource(fault: FaultData): FaultSource {
    const src = ((fault as any).source || '').toLowerCase(); // Cast to any as source might be missing in type
    const controller = (fault.controller?.name || '').toLowerCase();
    const diagId = (fault.diagnostic?.id || '');

    // Common Device-Level Diagnostics (telematics)
    if (diagId.startsWith('DiagnosticDevice') || diagId.startsWith('DiagnosticGps')) {
        return 'device';
    }

    if (src.includes('device') || src.includes('go') || controller.includes('telematics')) {
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
    const diagName = fault.diagnostic?.name || 'Unknown Fault';
    const controllerName = fault.controller?.name || '';

    // If we have a controller name and it's not generic "Telematics", add it for context
    if (controllerName && !controllerName.toLowerCase().includes('telematics')) {
        return `${diagName} (${controllerName})`;
    }

    return diagName;
}
