import { memo } from 'react';
import { useFleetStore, selectExpandedVehicleId } from '@/store/useFleetStore';
import { ChevronRight, ChevronDown, Clipboard, ClipboardCheck, Wifi, Battery, Camera, Zap, RefreshCw } from 'lucide-react';
import type { VehicleData } from '@/types/geotab';
import { AssetHealthDashboard } from './AssetHealthDashboard';

interface AssetRowProps {
    data: {
        vehicles: VehicleData[];
        toggleExpanded: (id: string) => void;
        isEnriching?: boolean;
    };
    index: number;
    style: React.CSSProperties;
}

export const AssetRow = memo(({ data, index, style }: AssetRowProps) => {
    const { vehicles, toggleExpanded } = data;
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

    return (
        <div style={style} className="asset-row-container">
            <div
                className={`asset-table__row ${isExpanded ? 'asset-table__row--expanded' : ''}`}
                onClick={handleRowClick}
            >
                <div className="asset-table__cell col-asset">
                    <span className="chevron-toggle">
                        {isExpanded ? <ChevronDown size={14} strokeWidth={3} /> : <ChevronRight size={14} strokeWidth={3} />}
                    </span>
                    <span className="asset-name">{vehicle.device.name}</span>
                    {vehicle.health.hasRecurringIssues && (
                        <span title="Recurring issue detected">
                            <RefreshCw size={12} className="recurring-issue-icon" />
                        </span>
                    )}
                    <Clipboard className="asset-type-icon" size={12} />
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
                    ) : (data.isEnriching ? (
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
                                {vehicle.isCharging && <Zap size={12} className="charging-icon" />}
                            </span>
                            <div className="level-indicator">
                                <div className="level-bar" style={{ backgroundColor: getLevelColor(vehicle.stateOfCharge), height: `${vehicle.stateOfCharge}%` }} />
                            </div>
                        </>
                    ) : (data.isEnriching ? (
                        <div className="enrichment-loader">
                            <div className="enrichment-pulse" />
                        </div>
                    ) : (
                        <span className="level-text level-text--empty">--</span>
                    ))}
                </div>
                <div className="asset-table__cell col-icons">
                    <Wifi size={16} className={vehicle.status.isDeviceCommunicating ? 'icon--success' : 'icon--danger'} />
                    <Battery size={16} className={(vehicle.batteryVoltage ?? 13) > 12.2 ? 'icon--success' : 'icon--danger'} />
                    <ClipboardCheck size={16} className={!vehicle.hasUnrepairedDefects ? 'icon--success' : 'icon--danger'} />
                    <span
                        title={
                            !vehicle.cameraStatus
                                ? 'No camera linked'
                                : `Camera is ${vehicle.cameraStatus.isOnline ? 'Online' : 'Offline'} (${vehicle.cameraStatus.health || 'unknown'})`
                        }
                    >
                        <Camera
                            size={16}
                            className={
                                !vehicle.cameraStatus
                                    ? 'icon--muted'
                                    : vehicle.cameraStatus.health === 'good'
                                        ? 'icon--success'
                                        : vehicle.cameraStatus.health === 'warning'
                                            ? 'icon--warning'
                                            : 'icon--danger'
                            }
                        />
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
    return prev.index === next.index && prev.style === next.style && prev.data === next.data;
});
