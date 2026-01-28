import React, { useState } from 'react';
import { VehicleData } from '@/types/geotab';
import { ClassifiedFault } from '@/services/FaultService';
import './AssetHealthDashboard.css';
import { formatBatteryVoltage, getBatteryStatusIndicator, analyzeCameraDiagnostics } from '@/services/HealthService';
import { useAssetHealth } from '@/hooks/useAssetHealth'; // New Hook

interface AssetHealthDashboardProps {
    vehicle: VehicleData;
}

export const AssetHealthDashboard: React.FC<AssetHealthDashboardProps> = ({ vehicle }) => {
    // 1. Hook: Fetch Deep Data
    const { isLoading, error, analysis, faults, exceptions, statusData } = useAssetHealth(vehicle);
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
                <span>Analyzing deep diagnostic history (12 Months)...</span>
            </div>
        );
    }

    if (error || !analysis) {
        return <div className="ah-dashboard ah-error">Error loading health data: {error}</div>;
    }

    // Use FRESH analysis from deep fetch
    const ongoingFaults: ClassifiedFault[] = analysis.items.filter((f: ClassifiedFault) => f.isOngoing);
    const severeCount = analysis.severeCount;
    const hasCriticalIssues = severeCount > 0;

    const statusColor = hasCriticalIssues ? 'var(--color-danger)' : 'var(--color-success)';
    const statusText = hasCriticalIssues
        ? 'Attention Required - Detailed analysis below'
        : 'No Immediate Actions Detected';
    const statusIcon = hasCriticalIssues ? '⚠️' : '✅';

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

                <div className="ah-status-banner" style={{ borderLeftColor: statusColor }}>
                    <div className="ah-status-icon" style={{ color: statusColor }}>{statusIcon}</div>
                    <div className="ah-status-text">
                        <strong>{statusText}</strong>
                        <span className="ah-status-sub">
                            Deep Search Results: {ongoingFaults.length} active issues found (12-month window)
                        </span>
                    </div>
                </div>
            </div>

            {/* DEBUG RAW DATA VIEW */}
            {showDebug && (
                <div className="ah-debug-panel" style={{ background: '#111', padding: '10px', margin: '10px 0', borderRadius: '4px', overflow: 'auto', maxHeight: '300px', fontSize: '11px', fontFamily: 'monospace' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#fff' }}>🔍 Raw Geotab Data (Last 12 Months)</h4>
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

            <div className="ah-grid">
                {/* 2. LEFT COLUMN: Asset Health */}
                <div className="ah-col left">
                    <h3>Asset Health</h3>
                    <hr className="ah-divider" />

                    <div className="ah-cards-row">


                        {/* Fault Summary Card */}
                        <div className="ah-card">
                            <div className="ah-card-header">
                                <span>⚠️ Fault Summary (Active)</span>
                            </div>
                            <div className="ah-card-body">
                                <div className="ah-stat-row">
                                    <span className="label">Ongoing faults</span>
                                    <span className="value">{analysis.ongoingCount}</span>
                                </div>
                                <div className="ah-stat-row">
                                    <span className="label">Severe faults</span>
                                    <span className="value">{analysis.severeCount}</span>
                                </div>
                                <div className="ah-divider-mini"></div>
                                <div className="ah-fault-list-mini">
                                    {ongoingFaults.length === 0 && <span className="ah-empty-text">No active faults found</span>}
                                    {groupFaultsForDisplay(ongoingFaults).map((f: ClassifiedFault) => (
                                        <div key={f.id} className={`ah-fault-item ${f.severity}`}>
                                            <div className="ah-fault-main">
                                                {f.code && f.code !== '' && <span className="code">{f.code}</span>}
                                                <span className="desc">
                                                    {formatCommonNames(f.description)}
                                                    {f.count && f.count > 1 && <span className="ah-count-badge">x{f.count}</span>}
                                                </span>
                                            </div>
                                            <span className="date">{new Date(f.date).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
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
                                {isOffline ? 'Offline' : '● Active'}
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
                            {analysis.items.filter((f: ClassifiedFault) => f.source === 'device' && f.isOngoing).length === 0
                                ? <span className="ah-empty-text">System healthy</span>
                                : analysis.items.filter((f: ClassifiedFault) => f.source === 'device' && f.isOngoing).map((f: ClassifiedFault) => (
                                    <div key={f.id} className="ah-device-fault-row">
                                        <span className="ah-dot red">●</span>
                                        <span>{formatCommonNames(f.description)}</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    <div className="ah-card device-card" style={{ marginTop: '16px' }}>
                        <div className="ah-device-header">
                            <span className="device-type">{vehicle.cameraStatus?.name || 'Camera'}</span>
                            <span className={`device-status-pill ${vehicle.cameraStatus ? (vehicle.cameraStatus.isOnline ? 'active' : 'offline') : 'muted'}`}>
                                {!vehicle.cameraStatus ? 'Not Detected' : (vehicle.cameraStatus.isOnline ? '● Active' : 'Offline')}
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
                                            <span className={`ah-dot ${detail.includes('Normally') || detail.includes('OK') ? 'green' : 'red'}`}>●</span>
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
                                            <span className="ah-dot red">●</span>
                                            <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{formatCommonNames(f.description)}</span>
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
 * Group duplicates in the UI list to prevent flooding
 */
function groupFaultsForDisplay(faults: ClassifiedFault[]): ClassifiedFault[] {
    const grouped: Record<string, ClassifiedFault> = {};

    faults.forEach(f => {
        // Create a unique key for grouping
        const key = `${f.code}-${f.description}-${f.source}`;

        if (!grouped[key]) {
            grouped[key] = { ...f, count: 1 };
        } else {
            // Keep the most recent date
            if (new Date(f.date) > new Date(grouped[key].date)) {
                grouped[key].date = f.date;
            }
            grouped[key].count = (grouped[key].count || 1) + 1;
        }
    });

    return Object.values(grouped).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Clean up ugly Geotab names
 */
function formatCommonNames(name: string): string {
    if (!name) return 'Unknown System Fault';

    // 1. Handle common ugly concatenations specifically
    let clean = name;

    // "LowPriorityWarningLightUnknown Fault" -> "Low Priority Warning Light"
    if (clean.includes("Unknown Fault")) {
        clean = clean.replace("Unknown Fault", "").trim();
        if (!clean) return "General System Fault";
    }

    // 2. Handle specific technical IDs manually
    if (clean.includes("DeviceRestartedBecauseOfFirmwareUpdated")) return "Firmware Update (Restart)";
    if (clean.includes("DeviceRestartedBecauseOfUserRequest")) return "Device Restart (User)";
    if (clean === "LowPriorityWarningLight") return "Low Priority Warning Light";
    if (clean === "GeneralVehicleWarningLight") return "General Vehicle Warning Light";

    // 3. Robust CamelCase Splitter
    clean = clean.replace(/([a-z])([A-Z])/g, '$1 $2');
    clean = clean.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');

    // 4. Cleanup excessive spaces or technical terms
    clean = clean.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

    return clean || name;
}
