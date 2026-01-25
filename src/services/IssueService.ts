/**
 * Issue Service
 * 
 * Processes raw Geotab FaultData into unified VehicleIssue objects.
 * Implements the logic from Geotab's fault status documentation.
 */

import type { FaultData, VehicleIssue, IssuePriority, IssueSource } from '@/types/geotab';
import { formatDiagnosticId, looksLikeGarbage } from '@/types/geotab';

// GO Device diagnostic IDs (telematics, not engine)
const DEVICE_DIAGNOSTIC_PATTERNS = [
    'DiagnosticDeviceUnplugged',
    'DiagnosticDevicePowerRemoved',
    'DiagnosticDeviceRestart',
    'DiagnosticGpsDisconnected',
    'DiagnosticCameraObstruction',
    'DiagnosticCodeId',
];

/**
 * Determine if a fault is from the GO device (telematics) or engine ECU
 */
function detectSource(fault: FaultData): IssueSource {
    const diagnosticId = fault.diagnostic?.id || '';

    // Check for known device diagnostic patterns
    const isDevice = DEVICE_DIAGNOSTIC_PATTERNS.some(pattern =>
        diagnosticId.includes(pattern)
    );

    // Also check failureMode.source if available
    if (fault.failureMode?.source === 'Telematics') {
        return 'device';
    }

    return isDevice ? 'device' : 'engine';
}

/**
 * Compute priority based on source and fault state
 * Per Geotab documentation:
 * - Engine: PendingActive = recurring (critical), Pending = monitor, Active = skip (historical)
 * - Device: Active = alert, Pending = info
 */
function computePriority(source: IssueSource, faultState?: string): IssuePriority {
    const state = faultState?.toLowerCase() || '';

    if (source === 'engine') {
        if (state === 'pendingactive' || state.includes('pending') && state.includes('active')) {
            return 'recurring'; // 🔴 Recurring engine issue - action required
        }
        if (state === 'pending') {
            return 'monitor';   // 🟡 Intermittent - watch but not urgent
        }
        // 'active' only = historical, will be filtered out
        return 'info';
    } else {
        // Device faults
        if (state === 'active' || state === 'pendingactive') {
            return 'alert';     // 🔴 Device alert - action required
        }
        return 'info';          // 🔵 Informational (e.g., firmware update)
    }
}

/**
 * Determine if a fault should be displayed
 * Excludes: historical "Active only" engine faults, dismissed faults, garbage OEM codes
 */
function shouldDisplay(fault: FaultData, source: IssueSource): boolean {
    const state = fault.faultState?.toLowerCase() || '';

    // Engine faults with only "Active" state are historical - skip them
    if (source === 'engine' && state === 'active') {
        return false;
    }

    // Cleared/dismissed faults - skip
    if (fault.dismissDateTime) {
        return false;
    }

    // Filter out garbage/OEM-encoded diagnostic IDs that aren't human readable
    const diagnosticId = fault.diagnostic?.id || '';
    const formattedName = formatDiagnosticId(diagnosticId);
    if (looksLikeGarbage(formattedName) || looksLikeGarbage(diagnosticId)) {
        return false;
    }

    return true;
}

/**
 * Convert a raw FaultData to a VehicleIssue
 */
function toVehicleIssue(fault: FaultData, source: IssueSource): VehicleIssue {
    const priority = computePriority(source, fault.faultState);
    const formattedName = formatDiagnosticId(fault.diagnostic?.id || 'Unknown');

    return {
        id: fault.id,
        name: formattedName,
        priority,
        source,
        lastOccurred: fault.dateTime,
        dtcCode: fault.failureMode?.code,
        rawFaultState: fault.faultState,
        rawDiagnosticId: fault.diagnostic?.id,
        failureModeName: fault.failureMode?.name,
        controllerName: fault.controller?.name,
        severity: fault.failureMode?.severity,
    };
}

/**
 * Process raw faults into unified VehicleIssue array
 * Groups by diagnostic ID and returns sorted by priority
 */
export function processVehicleIssues(faults: FaultData[]): VehicleIssue[] {
    if (!faults || faults.length === 0) {
        return [];
    }

    // Group faults by diagnostic ID to count occurrences
    const issueMap = new Map<string, { issue: VehicleIssue; count: number; latestDate: Date }>();

    for (const fault of faults) {
        const source = detectSource(fault);

        // Skip faults that shouldn't be displayed
        if (!shouldDisplay(fault, source)) {
            continue;
        }

        const issue = toVehicleIssue(fault, source);
        const key = fault.diagnostic?.id || fault.id;

        const existing = issueMap.get(key);
        const faultDate = new Date(fault.dateTime);

        if (existing) {
            existing.count++;
            if (faultDate > existing.latestDate) {
                existing.latestDate = faultDate;
                existing.issue.lastOccurred = fault.dateTime;
            }
        } else {
            issueMap.set(key, { issue, count: 1, latestDate: faultDate });
        }
    }

    // Convert to array and add occurrence counts
    const issues: VehicleIssue[] = [];
    for (const { issue, count } of issueMap.values()) {
        issues.push({
            ...issue,
            occurrenceCount: count > 1 ? count : undefined,
        });
    }

    // Sort by priority: recurring > alert > monitor > info
    const priorityOrder: Record<IssuePriority, number> = {
        recurring: 0,
        alert: 1,
        monitor: 2,
        info: 3,
    };

    issues.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return issues;
}

/**
 * Check if any issues are recurring (for row-level icon)
 */
export function hasRecurringIssues(issues: VehicleIssue[]): boolean {
    return issues.some(issue => issue.priority === 'recurring');
}

/**
 * Get issues grouped by priority for UI rendering
 */
export function groupIssuesByPriority(issues: VehicleIssue[]): Record<IssuePriority, VehicleIssue[]> {
    return {
        recurring: issues.filter(i => i.priority === 'recurring'),
        alert: issues.filter(i => i.priority === 'alert'),
        monitor: issues.filter(i => i.priority === 'monitor'),
        info: issues.filter(i => i.priority === 'info'),
    };
}
