import React, { useState } from 'react';
import { VehicleData, ExtendedDiagnostics, GeotabSession } from '@/types/geotab';
import { assessTelematicsHealth, ClassifiedFault } from '@/services/FaultService';
import './AssetHealthDashboard.css';
import { formatBatteryVoltage, getBatteryStatusIndicator, analyzeCameraDiagnostics } from '@/services/HealthService';
import { useAssetHealth } from '@/hooks/useAssetHealth'; // New Hook
import { useGeotabApi } from '@/hooks/useGeotabApi';
import {
    IconSearch,
    IconAlertTriangle,
    IconTool,
    IconClipboardList,
    IconCircleFilled,
    IconRoute,
    IconBolt,
    IconClockHour3,
    IconDroplet,
    IconTemperature,
    IconBattery
} from '@tabler/icons-react';
import { FaultBuckets } from './FaultBuckets';

interface AssetHealthDashboardProps {
    vehicle: VehicleData;
}

export const AssetHealthDashboard: React.FC<AssetHealthDashboardProps> = ({ vehicle }) => {
    // 1. Hook: Fetch Deep Data
    const { isLoading, error, analysis, faults, exceptions, statusData, extendedDiagnostics } = useAssetHealth(vehicle);
    const { api } = useGeotabApi();
    const [showDebug, setShowDebug] = useState(false);

    // Initial / Fallback Data (while loading, or for static fields)
    const { device, health, status } = vehicle;
    const assetName = device.name;
    const makeModel = vehicle.makeModel || 'Unknown Vehicle';
    const vin = device.vehicleIdentificationNumber || '--';

    // Device Health
    const lastComm = new Date(status.dateTime).toLocaleString();
    const isOffline = health.isDeviceOffline;
    const batteryVolts = vehicle.batteryVoltage;
    const batteryIndicator = getBatteryStatusIndicator(batteryVolts ?? null);
    const camHealth = analyzeCameraDiagnostics(statusData);



    // Loading State
    if (isLoading) {
        return (
            <div className="ah-dashboard ah-loading">
                <style>{`
                    .ah-loading { padding: 40px; text-align: center; color: var(--color-text-muted); }
                    .ah-spinner { 
                        width: 24px; height: 24px; 
                        border: 3px solid rgba(255,255,255,0.1); 
                        border-top-color: var(--color-primary); 
                        border-radius: 50%; 
                        animation: spin 1s linear infinite;
                        margin: 0 auto 10px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
                <div className="ah-spinner"></div>
                <span>Analyzing deep diagnostic history (Last 3 Months)...</span>
            </div>
        );
    }

    if (error || !analysis) {
        return <div className="ah-dashboard ah-error">Error loading health data: {error}</div>;
    }

    // Use FRESH analysis from deep fetch
    const ongoingFaults: ClassifiedFault[] = analysis.items.filter((f: ClassifiedFault) => f.isOngoing);
    const severeCount = analysis.severeCount;
    const openDvirDefects = getOpenDvirDefectGroups(vehicle);
    const telematicsHealth = assessTelematicsHealth(status, faults);
    const recentDeviceFaults = telematicsHealth.relevantFaults.slice(0, 8);

    return (
        <div className="ah-dashboard">
            {/* 1. Header & Banner */}
            <div className="ah-header">
                <div className="ah-title-row">
                    <h2>{assetName}</h2>
                    <span className="ah-make-model">{makeModel}</span>
                    <span className="ah-vin">VIN: {vin}</span>
                    {import.meta.env.DEV && (
                        <button
                            className="ah-debug-btn"
                            onClick={() => setShowDebug(!showDebug)}
                            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #444', color: '#888', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                        >
                            {showDebug ? 'Hide Debug' : 'Show Raw Data'}
                        </button>
                    )}
                </div>

            </div>

            {/* DEBUG RAW DATA VIEW */}
            {showDebug && (
                <div className="ah-debug-panel" style={{ background: '#111', padding: '10px', margin: '10px 0', borderRadius: '4px', overflow: 'auto', maxHeight: '300px', fontSize: '11px', fontFamily: 'monospace' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <IconSearch size={14} />
                        Raw Geotab Data (Last 3 Months)
                    </h4>
                    <div className="ah-debug-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                        <div className="ah-debug-col">
                            <strong style={{ display: 'block', marginBottom: '5px', color: '#aaa' }}>FaultData ({faults.length})</strong>
                            <pre style={{ margin: 0, color: '#888' }}>{JSON.stringify(faults.slice(0, 5), null, 2)}</pre>
                            {faults.length > 5 && <p style={{ color: '#666' }}>...and {faults.length - 5} more</p>}
                        </div>
                        <div className="ah-debug-col">
                            <strong style={{ display: 'block', marginBottom: '5px', color: '#aaa' }}>ExceptionEvents ({exceptions.length})</strong>
                            <pre style={{ margin: 0, color: '#888' }}>{JSON.stringify(exceptions.slice(0, 5), null, 2)}</pre>
                            {exceptions.length > 5 && <p style={{ color: '#666' }}>...and {exceptions.length - 5} more</p>}
                        </div>
                        <div className="ah-debug-col">
                            <strong style={{ display: 'block', marginBottom: '5px', color: '#aaa' }}>Diagnostic IDs</strong>
                            <pre style={{ margin: 0, color: '#888' }}>
                                {JSON.stringify([...new Set(statusData.map((d: any) => d.diagnostic?.id).filter(Boolean))], null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}

            {/* 1.5. Immediate Actions Banner (Only if severe faults exist) */}
            {severeCount > 0 && (
                <div className="ah-immediate-actions" style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '16px',
                    margin: '16px 0'
                }}>
                    <h3 style={{ margin: '0 0 8px 0', color: 'var(--color-danger)', fontSize: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <IconAlertTriangle size={16} />
                        Immediate Actions
                    </h3>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                        <strong style={{ color: 'var(--color-danger)' }}>{severeCount} severe fault{severeCount !== 1 ? 's' : ''}</strong> detected in the last 7 days
                    </div>
                </div>
            )}

            <div className="ah-grid">
                {/* 2. LEFT COLUMN: Asset Health with 3-Bucket Fault Display */}
                <div className="ah-col left">
                    <h3>Asset Health</h3>
                    <hr className="ah-divider" />

                    {/* Diagnostics Panel */}
                    <div className="ah-cards-row">
                        <div className="ah-card ah-card--full-width">
                            <div className="ah-card-header">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <IconTool size={14} />
                                    Diagnostics
                                </span>
                            </div>
                            <div className="ah-card-body">
                                <DiagnosticsGrid diagnostics={extendedDiagnostics} vehicle={vehicle} />
                            </div>
                        </div>
                    </div>

                    {/* DVIR Defects */}
                    <div className="ah-cards-row" style={{ marginTop: '16px' }}>
                        <div className="ah-card ah-card--full-width">
                            <div className="ah-card-header">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <IconClipboardList size={14} />
                                    Open DVIR Defects
                                </span>
                                <span className="ah-card-subtitle">
                                    {openDvirDefects.length} open group{openDvirDefects.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="ah-card-body">
                                <DvirDefectsPanel
                                    groups={openDvirDefects}
                                    onOpenDetails={async (group) => {
                                        const fallbackUrl = 'https://my.geotab.com';
                                        if (!api) {
                                            window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
                                            return;
                                        }

                                        try {
                                            const session = await api.getSession();
                                            const deepLinkId = group.latestDvirLogId || group.latestDefectId;
                                            const detailsUrl = buildDvirDetailsUrl(
                                                session,
                                                vehicle.device.id,
                                                deepLinkId
                                            );
                                            window.open(detailsUrl, '_blank', 'noopener,noreferrer');
                                        } catch {
                                            window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="ah-cards-row" style={{ marginTop: '16px' }}>
                        {/* 3-Bucket Fault Display */}
                        <div className="ah-card ah-card--full-width">
                            <div className="ah-card-header">
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <IconAlertTriangle size={14} />
                                    Fault Analysis (Active)
                                </span>
                                <span className="ah-card-subtitle">
                                    {analysis.ongoingCount} ongoing · {analysis.severeCount} severe
                                </span>
                            </div>
                            <div className="ah-card-body">
                                <FaultBuckets faults={ongoingFaults} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. RIGHT COLUMN: Device Health */}
                <div className="ah-col right">
                    <h3>Device Health</h3>
                    <hr className="ah-divider" />

                    <div className="ah-card device-card">
                        <div className="ah-device-header">
                            <span className="device-type">GO9</span>
                            <span className={`device-status-pill ${isOffline ? 'offline' : 'active'}`}>
                                {isOffline ? 'Offline' : 'Active'}
                            </span>
                        </div>

                        <div className="ah-device-details">
                            <div className="ah-detail-row">
                                <span>Last communicated</span>
                                <strong>{lastComm}</strong>
                            </div>
                            <div className="ah-device-detail-row">
                                <span>Serial number</span>
                                <strong>{device.serialNumber}</strong>
                            </div>
                            <div className="ah-detail-row">
                                <span>Battery (12V)</span>
                                <strong style={{ color: batteryIndicator.color }}>{formatBatteryVoltage(batteryVolts ?? null)}</strong>
                            </div>
                        </div>

                        <div className="ah-device-faults-section">
                            <h4>Device Faults</h4>
                            {recentDeviceFaults.length === 0 ? (
                                <span className="ah-empty-text">
                                    {telematicsHealth.level === 'good' ? 'System healthy' : telematicsHealth.reason}
                                </span>
                            ) : (
                                recentDeviceFaults.map((fault) => (
                                    <div key={fault.id} className="ah-device-fault-row">
                                        <IconCircleFilled
                                            size={8}
                                            color={telematicsHealth.severeFaults.some((f) => f.id === fault.id) ? '#dc2626' : '#d97706'}
                                        />
                                        <span>{getDeviceFaultLabel(fault)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="ah-card device-card" style={{ marginTop: '16px' }}>
                        <div className="ah-device-header">
                            <span className="device-type">{vehicle.cameraStatus?.name || 'Camera'}</span>
                            <span className={`device-status-pill ${vehicle.cameraStatus ? (vehicle.cameraStatus.isOnline ? 'active' : 'offline') : 'muted'}`}>
                                {!vehicle.cameraStatus ? 'Not Detected' : (vehicle.cameraStatus.isOnline ? 'Active' : 'Offline')}
                            </span>
                        </div>
                        <div className="ah-device-details">
                            <div className="ah-detail-row">
                                <span>Last Record</span>
                                <strong>{vehicle.cameraStatus?.lastHeartbeat ? new Date(vehicle.cameraStatus.lastHeartbeat).toLocaleString() : 'N/A'}</strong>
                            </div>
                            <div className="ah-device-detail-row">
                                <span>Status</span>
                                <strong>{vehicle.cameraStatus ? (vehicle.cameraStatus.isOnline ? 'Connected' : 'Offline') : 'Not Detected'}</strong>
                            </div>
                        </div>
                        <div className="ah-device-faults-section">
                            <h4>Camera Status Log</h4>
                            {!vehicle.cameraStatus ? (
                                <span className="ah-empty-text">No camera detected</span>
                            ) : camHealth.details.length === 0 ? (
                                <span className="ah-empty-text">No status reports</span>
                            ) : (
                                <div className="ah-camera-details">
                                    {camHealth.details.map((detail, idx) => (
                                        <div key={idx} className="ah-device-fault-row">
                                            <IconCircleFilled size={8} color={detail.includes('Normally') || detail.includes('OK') ? '#16a34a' : '#dc2626'} />
                                            <span style={{ fontSize: '12px' }}>{detail}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* New Camera Faults Section */}
                        {vehicle.cameraStatus && analysis?.items.filter(f =>
                            (f.description?.toLowerCase().includes('camera') || f.description?.toLowerCase().includes('video')) && f.isOngoing
                        ).length > 0 && (
                                <div className="ah-device-faults-section" style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                                    <h4>Active Camera Faults</h4>
                                    {analysis?.items.filter(f =>
                                        (f.description?.toLowerCase().includes('camera') || f.description?.toLowerCase().includes('video')) && f.isOngoing
                                    ).map((f, idx) => (
                                        <div key={idx} className="ah-device-fault-row">
                                            <IconCircleFilled size={8} color="#dc2626" />
                                            <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{f.description}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>

                </div>
            </div>
        </div>
    );
};

// --- Helpers ---

/**
 * Clean up ugly Geotab names
 * (Moved to FaultBuckets.tsx - keeping as comment for reference)
 */

// --- Helper Functions ---

interface DiagnosticsGridProps {
    diagnostics?: ExtendedDiagnostics;
    vehicle: VehicleData;
}

const DiagnosticsGrid: React.FC<DiagnosticsGridProps> = ({ diagnostics, vehicle }) => {
    const batteryVoltage = diagnostics?.batteryVoltage ?? vehicle.batteryVoltage;

    const items = [
        {
            label: 'Odometer',
            value: diagnostics?.odometer !== undefined ? `${Math.round(diagnostics.odometer).toLocaleString()} km` : 'N/A',
            icon: IconRoute
        },
        {
            label: 'Electrical System Rating',
            value: diagnostics?.electricalSystemRating !== undefined
                ? `${diagnostics.electricalSystemRating}%`
                : 'N/A',
            color: diagnostics?.electricalSystemRating !== undefined
                ? diagnostics.electricalSystemRating > 80 ? '#10b981' : diagnostics.electricalSystemRating > 50 ? '#f59e0b' : '#ef4444'
                : undefined,
            icon: IconBolt
        },
        {
            label: 'Engine Hours',
            value: diagnostics?.engineHours !== undefined
                ? `${diagnostics.engineHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`
                : 'N/A',
            icon: IconClockHour3
        },
        {
            label: 'DEF Level',
            value: diagnostics?.defLevel !== undefined ? `${Math.round(diagnostics.defLevel)}%` : 'N/A',
            color: diagnostics?.defLevel !== undefined
                ? diagnostics.defLevel > 30 ? '#10b981' : diagnostics.defLevel > 15 ? '#f59e0b' : '#ef4444'
                : undefined,
            icon: IconDroplet
        },
        {
            label: 'Coolant Temp',
            value: diagnostics?.coolantTemp !== undefined ? `${Math.round(diagnostics.coolantTemp)}°C` : 'N/A',
            color: diagnostics?.coolantTemp !== undefined
                ? diagnostics.coolantTemp < 90 ? '#10b981' : diagnostics.coolantTemp < 95 ? '#f59e0b' : '#ef4444'
                : undefined,
            icon: IconTemperature
        },
        {
            label: 'Battery Voltage',
            value: batteryVoltage !== undefined
                ? `${batteryVoltage.toFixed(1)} V`
                : 'N/A',
            icon: IconBattery
        }
    ];

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '12px',
            padding: '8px 0'
        }}>
            {items.map((item, idx) => (
                <div key={idx} style={{
                    padding: '12px',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <item.icon size={14} />
                        </span>
                        <span>{item.label}</span>
                    </div>
                    <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: item.color || 'var(--color-text-primary)'
                    }}>
                        {item.value}
                    </div>
                </div>
            ))}
        </div>
    );
};

interface DvirDefectGroup {
    key: string;
    defectName: string;
    count: number;
    latestDate: string;
    latestDefectId: string;
    latestDvirLogId?: string;
    latestStatus: string;
    latestDriver: string;
    latestComment?: string;
}

function isDvirOpen(defect: VehicleData['health']['dvir']['defects'][number]): boolean {
    if (defect.isRepaired === true) return false;
    if (defect.repairStatus === 'Repaired' || defect.repairStatus === 'NotNecessary') return false;
    return true;
}

function getDeviceFaultLabel(fault: VehicleData['activeFaults'][number]): string {
    const diagnosticName = fault.diagnostic?.name?.trim();
    if (diagnosticName && diagnosticName.toLowerCase() !== 'unknown fault') return diagnosticName;
    const failureModeName = fault.failureMode?.name?.trim();
    if (failureModeName && failureModeName.toLowerCase() !== 'unknown') return failureModeName;
    return 'Telematics fault';
}

function getOpenDvirDefectGroups(vehicle: VehicleData): DvirDefectGroup[] {
    const defects = vehicle.health?.dvir?.defects ?? [];
    const grouped = new Map<string, DvirDefectGroup>();

    defects.filter(isDvirOpen).forEach((defect) => {
        const key = defect.defectName.trim().toLowerCase();
        const existing = grouped.get(key);
        const defectTime = new Date(defect.date).getTime();

        if (!existing) {
            grouped.set(key, {
                key,
                defectName: defect.defectName,
                count: 1,
                latestDate: defect.date,
                latestDefectId: defect.id,
                latestDvirLogId: defect.dvirLogId,
                latestStatus: defect.repairStatus || 'NotRepaired',
                latestDriver: defect.driverName || 'Unknown Driver',
                latestComment: defect.comment
            });
            return;
        }

        existing.count += 1;
        const existingTime = new Date(existing.latestDate).getTime();
        if (defectTime > existingTime) {
            existing.latestDate = defect.date;
            existing.latestDefectId = defect.id;
            existing.latestDvirLogId = defect.dvirLogId;
            existing.latestStatus = defect.repairStatus || 'NotRepaired';
            existing.latestDriver = defect.driverName || 'Unknown Driver';
            existing.latestComment = defect.comment;
        }
    });

    return Array.from(grouped.values()).sort(
        (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
    );
}

function normalizeHost(candidate: string | undefined): string | null {
    if (!candidate) return null;

    const trimmed = candidate.trim();
    if (!trimmed) return null;

    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

    try {
        const parsed = new URL(withProtocol);
        const host = parsed.host;
        if (!host) return null;
        if (host.toLowerCase() === 'undefined') return null;
        return host;
    } catch {
        return null;
    }
}

function resolveGeotabHost(session: GeotabSession): string {
    const sessionHost = normalizeHost(session.path);
    if (sessionHost) return sessionHost;

    const maybeServer = normalizeHost((session as unknown as { server?: string }).server);
    if (maybeServer) return maybeServer;

    if (typeof document !== 'undefined' && document.referrer) {
        try {
            const referrerHost = new URL(document.referrer).host;
            if (referrerHost.includes('geotab.com')) {
                return referrerHost;
            }
        } catch {
            // no-op
        }
    }

    if (typeof window !== 'undefined' && window.location.hostname.includes('geotab.com')) {
        return window.location.host;
    }

    return 'my.geotab.com';
}

function resolveDatabase(session: GeotabSession): string | null {
    if (session.database && session.database.trim()) {
        return session.database.trim();
    }

    if (typeof document !== 'undefined' && document.referrer) {
        try {
            const referrerPath = new URL(document.referrer).pathname.split('/').filter(Boolean);
            if (referrerPath.length > 0) {
                return referrerPath[0];
            }
        } catch {
            // no-op
        }
    }

    return null;
}

function buildDvirDetailsUrl(session: GeotabSession, deviceId: string, defectId: string): string {
    const host = resolveGeotabHost(session);
    const database = resolveDatabase(session);
    const origin = database ? `https://${host}/${encodeURIComponent(database)}` : `https://${host}`;
    const safeDeviceId = encodeURIComponent(deviceId);
    const safeDefectId = encodeURIComponent(defectId);

    // Canonical DVIR deep-link pattern provided by user:
    // /#dvir,device:{deviceId},id:{dvirLogOrDefectId},trailer:!n
    if (defectId) {
        return `${origin}/#dvir,device:${safeDeviceId},id:${safeDefectId},trailer:!n`;
    }
    return `${origin}/#dvir,device:${safeDeviceId},trailer:!n`;
}

const DvirDefectsPanel: React.FC<{
    groups: DvirDefectGroup[];
    onOpenDetails: (group: DvirDefectGroup) => void | Promise<void>;
}> = ({ groups, onOpenDetails }) => {
    const formatDateTime = (date: string) => {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return date;
        return parsed.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    if (groups.length === 0) {
        return (
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', padding: '8px 0' }}>
                No open DVIR defects.
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '8px' }}>
            {groups.map((group) => (
                <div
                    key={group.key}
                    style={{
                        border: '1px solid rgba(160, 31, 14, 0.22)',
                        background: 'var(--state-danger-bg)',
                        borderRadius: '6px',
                        padding: '10px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{group.defectName}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-danger)', background: 'rgba(160,31,14,0.12)', borderRadius: '8px', padding: '2px 8px' }}>
                            {group.latestStatus}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                            ×{group.count}
                        </span>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Latest: {formatDateTime(group.latestDate)} • Driver: {group.latestDriver}
                    </div>
                    {group.latestComment && (
                        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-text-primary)' }}>
                            "{group.latestComment}"
                        </div>
                    )}
                    <div style={{ marginTop: '8px' }}>
                        <button
                            type="button"
                            onClick={() => onOpenDetails(group)}
                            style={{
                                border: '1px solid var(--color-border)',
                                background: 'var(--surface-main)',
                                color: 'var(--color-text-primary)',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Details
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};
