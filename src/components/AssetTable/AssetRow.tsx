import { memo } from 'react';
import { useFleetStore, selectExpandedVehicleId } from '@/store/useFleetStore';
import {
    IconChevronRight,
    IconChevronDown,
    IconClipboard,
    IconClipboardCheck,
    IconCamera,
    IconBolt,
    IconRefresh,
    IconCar,
    IconAntennaBars5
} from '@tabler/icons-react';
import type { VehicleData } from '@/types/geotab';
import { isOngoingEngineFault, isOngoingTelematicsFault } from '@/services/FaultService';
import { AssetHealthDashboard } from './AssetHealthDashboard';

interface AssetRowProps {
    vehicles: VehicleData[];
    toggleExpanded: (id: string) => void;
    isEnriching?: boolean;
    onRowHoverChange?: (vehicleId: string | null) => void;
    index: number;
    style: React.CSSProperties;
}

export const AssetRow = memo((props: AssetRowProps) => {
    const { vehicles, toggleExpanded, isEnriching, onRowHoverChange, index, style } = props;
    const vehicle = vehicles[index];
    // We subscribe to the store prop because 'isExpanded' changes derived from it.
    // However, for react-window with memo/areEqual, we rely on the parent to invalidate or pass data.
    // Ideally, pass 'expandedId' in `data` to allow valid comparison in `areEqual`.
    // But let's just use the store selector inside for now, disabling standard memoization optimization 
    // or we can pass expandedId in the itemData.
    // Passing expandedId in itemData is better for preventing stale closures/props issues if we want to be pure.
    // But simplified:
    const expandedVehicleId = useFleetStore(selectExpandedVehicleId);

    if (!vehicle) return null;

    const isExpanded = expandedVehicleId === vehicle.device.id;

    const handleRowClick = () => {
        toggleExpanded(vehicle.device.id);
    };

    const getLevelColor = (percentage: number) => {
        if (percentage < 15) return '#ef4444'; // Red
        if (percentage < 30) return '#f59e0b'; // Amber
        return '#10b981'; // Green
    };

    const formatZoneDuration = (v: VehicleData): string => {
        const ms = v.zoneDurationMs ?? 0;
        const hours = ms / (1000 * 60 * 60);

        if (ms < 5 * 60 * 1000) return 'Just Arrived';
        if (hours < 1) return '< 1h';
        if (hours < 24) return `${Math.round(hours)}h`;
        if (hours >= 24 * 365) return '>1y';

        const days = Math.floor(hours / 24);
        return `${days}d`;
    };

    const normalizeFaultSeverity = (severity?: string): 'major' | 'minor' | 'unknown' => {
        if (!severity) return 'unknown';
        const normalized = severity.toLowerCase();
        if (normalized === 'critical' || normalized === 'severe' || normalized === 'high') return 'major';
        if (normalized === 'warning' || normalized === 'medium' || normalized === 'low' || normalized === 'info') return 'minor';
        return 'unknown';
    };

    const getVehicleFaultIconClass = (v: VehicleData): string => {
        const engineFaults = (v.activeFaults || []).filter((fault) => isOngoingEngineFault(fault));
        if (!engineFaults.length && !v.hasCriticalFaults) return 'icon--success';

        const hasMajorKnownFault = engineFaults.some((fault) => {
            const severity = normalizeFaultSeverity(fault.failureMode?.severity);
            return severity === 'major';
        }) || v.hasCriticalFaults;

        if (hasMajorKnownFault) return 'icon--danger';
        return 'icon--warning';
    };

    const getVehicleFaultTitle = (v: VehicleData): string => {
        const engineFaultCount = (v.activeFaults || []).filter((fault) => isOngoingEngineFault(fault)).length;
        const exceptionCount = v.health.exceptionSummary?.activeCount ?? 0;

        if (v.hasCriticalFaults) {
            if (engineFaultCount > 0 && exceptionCount > 0) {
                return `Critical: ${engineFaultCount} ongoing engine fault(s), ${exceptionCount} active exception rule(s)`;
            }
            if (engineFaultCount > 0) {
                return `Critical: ${engineFaultCount} ongoing engine fault(s)`;
            }
            if (exceptionCount > 0) {
                return `Critical via ${exceptionCount} active exception rule(s)`;
            }
            return 'Critical vehicle health';
        }

        if (engineFaultCount > 0) {
            return `${engineFaultCount} ongoing engine fault(s)`;
        }
        if (exceptionCount > 0) {
            return `${exceptionCount} active exception rule(s)`;
        }
        return 'No critical engine faults';
    };

    const getDvirIconClass = (v: VehicleData): string => {
        return v.hasUnrepairedDefects ? 'icon--danger' : 'icon--success';
    };

    const getTelematicsIconClass = (v: VehicleData): string => {
        const lastHeardAt = v.status?.dateTime ? new Date(v.status.dateTime).getTime() : 0;
        const hoursSinceHeartbeat = lastHeardAt ? (Date.now() - lastHeardAt) / (1000 * 60 * 60) : Number.POSITIVE_INFINITY;
        const NOT_COMMUNICATING_RED_HOURS = 72;
        if (!v.status.isDeviceCommunicating || hoursSinceHeartbeat >= NOT_COMMUNICATING_RED_HOURS) {
            return 'icon--danger';
        }

        const deviceIssues = v.health.issues.filter((issue) => issue.source === 'device');
        const hasSeriousDeviceIssue = deviceIssues.some((issue) => issue.priority === 'alert');
        if (hasSeriousDeviceIssue) return 'icon--danger';

        const telematicsFaults = (v.activeFaults || []).filter((fault) => isOngoingTelematicsFault(fault));
        if (telematicsFaults.length > 0) {
            const hasMajorTelematicsFault = telematicsFaults.some((fault) => {
                const severity = normalizeFaultSeverity(fault.failureMode?.severity);
                return severity === 'major' || (fault.faultState || '').toLowerCase().includes('active');
            });
            return hasMajorTelematicsFault ? 'icon--danger' : 'icon--warning';
        }

        if (deviceIssues.length > 0) return 'icon--warning';
        return 'icon--success';
    };

    const getCameraIconClass = (v: VehicleData): string => {
        if (!v.cameraStatus) return 'icon--muted';
        if (v.cameraStatus.health === 'good') return 'icon--success';
        if (v.cameraStatus.health === 'warning') return 'icon--warning';
        return 'icon--danger';
    };

    return (
        <div style={style} className="asset-row-container">
            <div
                className={`asset-table__row ${isExpanded ? 'asset-table__row--expanded' : ''}`}
                onClick={handleRowClick}
                onMouseEnter={() => onRowHoverChange?.(vehicle.device.id)}
                onMouseLeave={() => onRowHoverChange?.(null)}
            >
                <div className="asset-table__cell col-asset">
                    <span className="chevron-toggle">
                        {isExpanded ? <IconChevronDown size={14} strokeWidth={3} /> : <IconChevronRight size={14} strokeWidth={3} />}
                    </span>
                    <span className="asset-name">{vehicle.device.name}</span>
                    {vehicle.health.hasRecurringIssues && (
                        <span title="Recurring issue detected">
                            <IconRefresh size={12} className="recurring-issue-icon" />
                        </span>
                    )}
                    <IconClipboard className="asset-type-icon" size={12} />
                </div>
                <div className="asset-table__cell col-model">{vehicle.makeModel || '--'}</div>
                <div className="asset-table__cell col-driver">{vehicle.driverName || 'No Driver'}</div>
                <div className="asset-table__cell col-fuel">
                    {vehicle.fuelLevel !== undefined ? (
                        <>
                            <span className="level-text" style={{ color: getLevelColor(Math.min(100, vehicle.fuelLevel)) }}>
                                {Math.round(Math.min(100, vehicle.fuelLevel))}%
                            </span>
                            <div className="level-indicator">
                                <div className="level-bar" style={{ backgroundColor: getLevelColor(Math.min(100, vehicle.fuelLevel)), height: `${Math.min(100, vehicle.fuelLevel)}%` }} />
                            </div>
                        </>
                    ) : (isEnriching ? (
                        <div className="enrichment-loader">
                            <div className="enrichment-pulse" />
                        </div>
                    ) : (
                        <span className="level-text level-text--empty">--</span>
                    ))}
                </div>
                <div className="asset-table__cell col-soc">
                    {vehicle.stateOfCharge !== undefined ? (
                        <>
                            <span className="level-text" style={{ color: getLevelColor(vehicle.stateOfCharge) }}>
                                {Math.round(vehicle.stateOfCharge)}%
                                {vehicle.isCharging && <IconBolt size={12} className="charging-icon" />}
                            </span>
                            <div className="level-indicator">
                                <div className="level-bar" style={{ backgroundColor: getLevelColor(vehicle.stateOfCharge), height: `${vehicle.stateOfCharge}%` }} />
                            </div>
                        </>
                    ) : (isEnriching ? (
                        <div className="enrichment-loader">
                            <div className="enrichment-pulse" />
                        </div>
                    ) : (
                        <span className="level-text level-text--empty">--</span>
                    ))}
                </div>
                <div className="asset-table__cell col-icons">
                    <span className="status-icon-slot" title={getVehicleFaultTitle(vehicle)}>
                        <IconCar size={16} className={getVehicleFaultIconClass(vehicle)} />
                    </span>
                    <span className="status-icon-slot" title={vehicle.hasUnrepairedDefects ? 'Open DVIR defects' : 'No open DVIR defects'}>
                        <IconClipboardCheck size={16} className={getDvirIconClass(vehicle)} />
                    </span>
                    <span className="status-icon-slot" title="Telematics device health">
                        <IconAntennaBars5 size={16} className={getTelematicsIconClass(vehicle)} />
                    </span>
                    <span
                        className="status-icon-slot"
                        title={
                            !vehicle.cameraStatus
                                ? 'No camera linked'
                                : `Camera is ${vehicle.cameraStatus.isOnline ? 'Online' : 'Offline'} (${vehicle.cameraStatus.health || 'unknown'})`
                        }
                    >
                        <IconCamera size={16} className={getCameraIconClass(vehicle)} />
                    </span>
                </div>
                <div className="asset-table__cell col-dur">
                    {formatZoneDuration(vehicle)}
                </div>
            </div>

            {isExpanded && (
                <div className="asset-table__expanded-content">
                    <AssetHealthDashboard vehicle={vehicle} />
                </div>
            )}
        </div>
    );
}, (prev, next) => {
    // Custom equality check if needed, or rely on react-window default (which is shallow compare of props)
    // Since we access store inside, standard memo might be tricky if data prop doesn't change but store does.
    // However, using the store selector hook will trigger re-render anyway.
    return prev.index === next.index
        && prev.style === next.style
        && prev.vehicles === next.vehicles
        && prev.onRowHoverChange === next.onRowHoverChange;
});
