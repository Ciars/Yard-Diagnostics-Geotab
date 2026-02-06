import React from 'react';
import { ClassifiedFault } from '@/services/FaultService';
import { IconCamera, IconWifi, IconTool, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import './FaultBuckets.css';

interface FaultBucketsProps {
    faults: ClassifiedFault[];
    isCompact?: boolean;
}

interface GroupedFault extends ClassifiedFault {
    count: number;
    mostRecentDate: string;
}

/**
 * FaultBuckets Component
 * 
 * Displays faults grouped into 3 operational buckets:
 * 1. Camera & IOX Hardware
 * 2. Telematics Device Health
 * 3. Vehicle Health (Engine/OBD)
 * 
 * Matches the Python script categorization logic for UK/Ireland fleet operations
 */
export const FaultBuckets: React.FC<FaultBucketsProps> = ({ faults, isCompact = false }) => {
    // Group faults by bucket
    const cameraFaults = faults.filter(f => f.bucket === 'camera_iox');
    const deviceFaults = faults.filter(f => f.bucket === 'device_health');
    const vehicleFaults = faults.filter(f => f.bucket === 'vehicle_health');
    const unknownFaults = faults.filter(f => f.bucket === 'unknown');

    // Check for critical emissions faults
    const hasCriticalEmissions = vehicleFaults.some(f =>
        ['adblue', 'reductant', 'dpf', 'particulate', 'def', 'scr'].some(keyword =>
            f.description.toLowerCase().includes(keyword)
        )
    );

    // Check for device tampering
    const hasTampering = deviceFaults.some(f =>
        f.description.toLowerCase().includes('unplug') ||
        f.description.toLowerCase().includes('tamper') ||
        f.code === '136'
    );

    if (faults.length === 0) {
        return (
            <div className="fault-buckets fault-buckets--empty">
                <div className="fault-buckets__empty-state">
                    <span className="empty-icon"><IconCircleCheck size={42} /></span>
                    <p>No active faults detected</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`fault-buckets ${isCompact ? 'fault-buckets--compact' : ''}`}>
            {/* Bucket 1: Camera/IOX Hardware */}
            {cameraFaults.length > 0 && (
                <FaultBucket
                    title="Camera & IOX Hardware"
                    icon={<IconCamera size={16} />}
                    faults={cameraFaults}
                    color="var(--color-info)"
                    isCompact={isCompact}
                />
            )}

            {/* Bucket 2: Telematics Device Health */}
            {deviceFaults.length > 0 && (
                <FaultBucket
                    title="Telematics Device Health"
                    icon={<IconWifi size={16} />}
                    faults={deviceFaults}
                    color={hasTampering ? 'var(--color-danger)' : 'var(--color-warning)'}
                    isCompact={isCompact}
                    showCriticalBadge={hasTampering}
                />
            )}

            {/* Bucket 3: Vehicle Health */}
            {vehicleFaults.length > 0 && (
                <FaultBucket
                    title="Vehicle Health (Engine/OBD)"
                    icon={<IconTool size={16} />}
                    faults={vehicleFaults}
                    color={hasCriticalEmissions ? 'var(--color-danger)' : 'var(--color-warning)'}
                    isCompact={isCompact}
                    showCriticalBadge={hasCriticalEmissions}
                    criticalBadgeText={hasCriticalEmissions ? 'Emissions Critical' : undefined}
                />
            )}

            {/* Unknown/Uncategorized (dev only or fallback) */}
            {unknownFaults.length > 0 && import.meta.env.DEV && (
                <FaultBucket
                    title="Uncategorized Faults"
                    icon={<IconAlertTriangle size={16} />}
                    faults={unknownFaults}
                    color="var(--color-text-muted)"
                    isCompact={isCompact}
                />
            )}
        </div>
    );
};

interface FaultBucketProps {
    title: string;
    icon: React.ReactNode;
    faults: ClassifiedFault[];
    color: string;
    isCompact?: boolean;
    showCriticalBadge?: boolean;
    criticalBadgeText?: string;
}

const FaultBucket: React.FC<FaultBucketProps> = ({
    title,
    icon,
    faults,
    color,
    isCompact,
    showCriticalBadge,
    criticalBadgeText = 'CRITICAL'
}) => {
    const groupedFaults = React.useMemo(() => groupFaults(faults), [faults]);

    return (
        <div className="fault-bucket" style={{ borderLeftColor: color }}>
            <div className="fault-bucket__header">
                <div className="fault-bucket__title">
                    <span className="fault-bucket__icon" style={{ color }}>
                        {icon}
                    </span>
                    <h4>{title}</h4>
                    <span className="fault-bucket__count" title={`${groupedFaults.length} unique faults / ${faults.length} total occurrences`}>
                        {groupedFaults.length}
                    </span>
                </div>
                {showCriticalBadge && (
                    <span className="fault-bucket__critical-badge">
                        <IconAlertTriangle size={12} />
                        {criticalBadgeText}
                    </span>
                )}
            </div>

            <div className="fault-bucket__content">
                {groupedFaults.map((fault, idx) => (
                    <FaultItem key={fault.id || idx} fault={fault} isCompact={isCompact} />
                ))}
            </div>
        </div>
    );
};

interface FaultItemProps {
    fault: GroupedFault;
    isCompact?: boolean;
}

const FaultItem: React.FC<FaultItemProps> = ({ fault, isCompact }) => {
    const formatDateTime = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } catch {
            return dateStr;
        }
    };

    const formatSeverity = (severity: string) => {
        if (severity === 'critical') return 'Critical';
        if (severity === 'severe') return 'Severe';
        if (severity === 'warning') return 'Warning';
        if (severity === 'history') return 'Historical';
        return 'Info';
    };

    const getSeverityDot = (severity: string) => {
        const colors = {
            critical: 'var(--color-danger)',
            severe: 'var(--color-danger)',
            warning: 'var(--color-warning)',
            info: 'var(--color-info)',
            history: 'var(--color-text-muted)'
        };
        return colors[severity as keyof typeof colors] || 'var(--color-text-muted)';
    };

    // Check if this is a critical emissions fault
    const isEmissionsCritical = ['adblue', 'reductant', 'dpf', 'particulate', 'def', 'scr'].some(keyword =>
        fault.description.toLowerCase().includes(keyword)
    );

    // Check if this is device tampering
    const isTampering = fault.description.toLowerCase().includes('unplug') ||
        fault.description.toLowerCase().includes('tamper') ||
        fault.code === '136';

    return (
        <div className={`fault-item ${isCompact ? 'fault-item--compact' : ''} fault-item--${fault.severity}`}>
            <div className="fault-item__main">
                <span
                    className="fault-item__dot"
                    style={{ backgroundColor: getSeverityDot(fault.severity) }}
                />
                <div className="fault-item__info">
                    <div className="fault-item__description">
                        <span className="fault-item__code">{fault.code && fault.code !== 'RULE' ? fault.code : 'N/A'}</span>
                        <span className={`fault-item__text ${isEmissionsCritical || isTampering ? 'fault-item__text--critical' : ''}`} title={fault.description}>
                            {formatFaultDescription(fault.description)}
                        </span>
                        <span className={`fault-item__tag fault-item__tag--severity fault-item__tag--severity-${fault.severity}`}>
                            {formatSeverity(fault.severity)}
                        </span>
                        <span className="fault-item__count-badge">×{fault.count}</span>
                    </div>
                    {!isCompact && (
                        <div className="fault-item__meta">
                            <span className="fault-item__date">Latest: {formatDateTime(fault.mostRecentDate)}</span>
                            {isTampering && (
                                <span className="fault-item__tag fault-item__tag--danger">
                                    Device Tampering
                                </span>
                            )}
                            {isEmissionsCritical && (
                                <span className="fault-item__tag fault-item__tag--emissions">
                                    Emissions Critical
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * Clean up common Geotab naming patterns
 */
function formatFaultDescription(desc: string): string {
    if (!desc) return 'Unknown Fault';

    let clean = desc;

    if (clean.toLowerCase() === 'system fault') {
        return 'System Fault (unresolved diagnostic name)';
    }

    // Handle specific patterns
    if (clean.includes('DeviceRestartedBecauseOfFirmwareUpdated')) return 'Firmware Update (Restart)';
    if (clean.includes('DeviceRestartedBecauseOfUserRequest')) return 'Device Restart (User)';

    // Split CamelCase
    clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2');
    clean = clean.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');

    // Cleanup
    clean = clean.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

    return clean || 'Unnamed Fault';
}

function groupFaults(faults: ClassifiedFault[]): GroupedFault[] {
    const grouped = new Map<string, GroupedFault>();

    faults.forEach((fault) => {
        const key = [
            fault.bucket,
            fault.code || 'N/A',
            fault.description,
            fault.severity
        ].join('::');

        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, {
                ...fault,
                count: 1,
                mostRecentDate: fault.date
            });
            return;
        }

        existing.count += 1;
        if (new Date(fault.date).getTime() > new Date(existing.mostRecentDate).getTime()) {
            existing.mostRecentDate = fault.date;
        }
    });

    return Array.from(grouped.values()).sort(
        (a, b) => new Date(b.mostRecentDate).getTime() - new Date(a.mostRecentDate).getTime()
    );
}
