import type { VehicleData, VehicleIssue, IssuePriority } from '@/types/geotab';
import { groupIssuesByPriority } from '@/services/IssueService';
import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    RefreshCw,
    AlertCircle,
    Eye,
    Bell,
    Activity,
    WifiOff,
} from 'lucide-react';
import './HealthCockpit.css';

interface HealthCockpitProps {
    vehicle: VehicleData;
}

// Priority styling
const PRIORITY_STYLES: Record<IssuePriority, { className: string; icon: typeof AlertTriangle }> = {
    recurring: { className: 'issue--recurring', icon: RefreshCw },
    alert: { className: 'issue--alert', icon: AlertCircle },
    monitor: { className: 'issue--monitor', icon: Eye },
    info: { className: 'issue--info', icon: Bell },
};

function formatRelativeTime(isoDate: string): string {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
}

/** Get the best display name for a fault */
function getIssueName(issue: VehicleIssue): string {
    // Prefer failureMode.name if available and not generic
    if (issue.failureModeName && issue.failureModeName !== 'System Fault') {
        return issue.failureModeName;
    }
    // If formatted name is "System Fault", try to show something more useful
    if (issue.name === 'System Fault' && issue.rawDiagnosticId) {
        // Just clean up the raw ID minimally
        const cleaned = issue.rawDiagnosticId
            .replace(/^Diagnostic/, '')
            .replace(/Id$/, '')
            .replace(/([A-Z])/g, ' $1')
            .trim();
        if (cleaned.length <= 50) {
            return cleaned;
        }
        // If still too long, show truncated version
        return cleaned.substring(0, 40) + '...';
    }
    return issue.name;
}

/** Single issue row - shows all data upfront */
function IssueRow({ issue }: { issue: VehicleIssue }) {
    const style = PRIORITY_STYLES[issue.priority];
    const Icon = style.icon;
    const displayName = getIssueName(issue);

    return (
        <div className={`issue-row ${style.className}`}>
            <div className="issue-row__icon">
                <Icon size={14} />
            </div>

            <div className="issue-row__content">
                {/* Line 1: DTC code (if present) + Name */}
                <div className="issue-row__main">
                    {issue.dtcCode && (
                        <span className="issue-row__dtc">{issue.dtcCode}</span>
                    )}
                    <span className="issue-row__name">{displayName}</span>
                    {issue.occurrenceCount && issue.occurrenceCount > 1 && (
                        <span className="issue-row__count">×{issue.occurrenceCount}</span>
                    )}
                </div>

                {/* Line 2: Controller, Severity, Source, Time */}
                <div className="issue-row__meta">
                    {issue.controllerName && (
                        <span className="issue-row__controller">{issue.controllerName}</span>
                    )}
                    {issue.severity && (
                        <span className={`issue-row__severity severity--${issue.severity.toLowerCase()}`}>
                            {issue.severity}
                        </span>
                    )}
                    <span className="issue-row__source">
                        {issue.source === 'engine' ? 'Engine' : 'Device'}
                    </span>
                    <span className="issue-row__time">{formatRelativeTime(issue.lastOccurred)}</span>
                </div>
            </div>
        </div>
    );
}

export function HealthCockpit({ vehicle }: HealthCockpitProps) {
    const { health } = vehicle;
    const issueGroups = groupIssuesByPriority(health.issues);
    const totalIssues = health.issues.length;

    // Flatten issues in priority order for simple display
    const allIssues = [
        ...issueGroups.recurring,
        ...issueGroups.alert,
        ...issueGroups.monitor,
        ...issueGroups.info,
    ];

    return (
        <div className="health-cockpit">
            {/* COLUMN 1: DVIR (Driver Reports) */}
            <div className={`health-column health-column--dvir ${!health.dvir.isClean ? 'has-defects' : ''}`}>
                <div className="column-header">
                    <span className="icon-wrapper"><ClipboardList size={18} /></span>
                    <h3>Driver Reports (DVIR)</h3>
                </div>

                <div className="column-content">
                    {health.dvir.isClean ? (
                        <div className="status-card status-card--clean">
                            <CheckCircle2 size={32} className="status-icon--success" />
                            <div className="status-text">
                                <strong>No Defects Reported</strong>
                                <span>Vehicle safe to operate</span>
                            </div>
                        </div>
                    ) : (
                        <div className="defects-list">
                            {health.dvir.defects.map(defect => (
                                <div key={defect.id} className={`defect-row ${defect.isRepaired ? 'defect-row--repaired' : ''}`}>
                                    <AlertTriangle size={14} className={`defect-icon ${defect.isRepaired ? 'defect-icon--repaired' : ''}`} />
                                    <div className="defect-row__content">
                                        <span className="defect-row__name">{defect.defectName}</span>
                                        <div className="defect-row__meta">
                                            <span>{defect.driverName}</span>
                                            <span>{new Date(defect.date).toLocaleDateString()}</span>
                                            <span className={`repair-status repair-status--${(defect.repairStatus || 'NotRepaired').toLowerCase()}`}>
                                                {defect.repairStatus || 'Not Repaired'}
                                            </span>
                                        </div>
                                        {defect.comment && (
                                            <p className="defect-row__comment">"{defect.comment}"</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* COLUMN 2: VEHICLE ISSUES - FLAT LIST WITH ALL DATA VISIBLE */}
            <div className="health-column health-column--issues">
                <div className="column-header">
                    <span className="icon-wrapper"><Activity size={18} /></span>
                    <h3>Fault Codes</h3>
                    {totalIssues > 0 && (
                        <span className="issue-count-badge">{totalIssues}</span>
                    )}
                </div>

                <div className="column-content">
                    {/* Device connectivity alert */}
                    {health.isDeviceOffline && (
                        <div className="connectivity-alert">
                            <WifiOff size={16} />
                            <div>
                                <strong>Device Offline</strong>
                                {health.lastHeartbeat && (
                                    <span> — Last seen {formatRelativeTime(health.lastHeartbeat)}</span>
                                )}
                            </div>
                        </div>
                    )}

                    {allIssues.length === 0 && !health.isDeviceOffline ? (
                        <div className="status-card status-card--clean">
                            <CheckCircle2 size={32} className="status-icon--success" />
                            <div className="status-text">
                                <strong>No Fault Codes</strong>
                                <span>No active or pending faults</span>
                            </div>
                        </div>
                    ) : (
                        <div className="issues-list">
                            {allIssues.map((issue) => (
                                <IssueRow key={issue.id} issue={issue} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
