/**
 * Asset Table Component
 * 
 * High-fidelity master-detail table as per GeoYard design.
 * Features enriched columns and detailed diagnostic reports.
 */

import { useState, useMemo } from 'react';
import { useFleetStore, selectExpandedVehicleId } from '@/store/useFleetStore';
import type { VehicleData, KpiFilterType } from '@/types/geotab';
import { ChevronRight, ChevronDown, Clipboard, ClipboardCheck, Wifi, Battery, Camera, Zap, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { HealthCockpit } from './HealthCockpit';
import './AssetTable.css';

interface AssetTableProps {
    vehicles: VehicleData[];
    isLoading?: boolean;
}

type SortField = 'asset' | 'model' | 'driver' | 'fuel' | 'soc' | 'service' | 'duration';
type SortDirection = 'asc' | 'desc';

// Filter vehicles locally instead of using store selector to avoid infinite loop
function filterVehiclesByKpi(vehicles: VehicleData[], filter: KpiFilterType | null): VehicleData[] {
    if (!filter) return vehicles;

    switch (filter) {
        case 'critical':
            return vehicles.filter((v) => v.hasCriticalFaults || v.hasUnrepairedDefects);
        case 'silent':
            return vehicles.filter((v) => !v.status.isDeviceCommunicating);
        case 'dormant':
            return vehicles.filter((v) => (v.dormancyDays ?? 0) >= 14);
        case 'charging':
            return vehicles.filter((v) => v.isCharging);
        case 'serviceDue':
            return vehicles.filter((v) => (v.serviceDueDays ?? 999) <= 7);
        default:
            return vehicles;
    }
}

export function AssetTable({ vehicles, isLoading }: AssetTableProps) {
    const expandedVehicleId = useFleetStore(selectExpandedVehicleId);
    const setExpandedVehicle = useFleetStore((s) => s.setExpandedVehicle);
    const activeFilter = useFleetStore((s) => s.activeKpiFilter);

    // Compute filtered vehicles locally with useMemo for stable references
    const displayVehiclesUnsorted = useMemo(
        () => filterVehiclesByKpi(vehicles, activeFilter),
        [vehicles, activeFilter]
    );

    // Sorting state - default: most recent arrival first (duration ascending)
    const [sortField, setSortField] = useState<SortField>('duration');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const handleRowClick = (vehicleId: string) => {
        setExpandedVehicle(expandedVehicleId === vehicleId ? null : vehicleId);
    };

    // Format duration: hours for <24h, days for >=24h
    const formatZoneDuration = (vehicle: VehicleData): string => {
        const ms = vehicle.zoneDurationMs ?? 0;
        const hours = ms / (1000 * 60 * 60);

        // Use "Just Arrived" for < 5 mins, "Active" for < 1h
        if (ms < 5 * 60 * 1000) return 'Just Arrived';
        if (hours < 1) return '< 1h';

        if (hours < 24) return `${Math.round(hours)}h`;

        // Cap display at "365d+" if it hits our cap
        if (hours >= 24 * 365) return '>1y';

        const days = Math.floor(hours / 24);
        return `${days}d`;
    };

    // Handle sort click
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'duration' ? 'asc' : 'desc');
        }
    };

    // Sorted vehicles
    const displayVehicles = useMemo(() => {
        const sorted = [...displayVehiclesUnsorted];
        sorted.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'asset':
                    comparison = a.device.name.localeCompare(b.device.name);
                    break;
                case 'model':
                    comparison = (a.makeModel || '').localeCompare(b.makeModel || '');
                    break;
                case 'driver':
                    comparison = (a.driverName || '').localeCompare(b.driverName || '');
                    break;
                case 'fuel':
                    comparison = (a.fuelLevel ?? -1) - (b.fuelLevel ?? -1);
                    break;
                case 'soc':
                    comparison = (a.stateOfCharge ?? -1) - (b.stateOfCharge ?? -1);
                    break;
                case 'service':
                    comparison = (a.serviceDueDays ?? 999) - (b.serviceDueDays ?? 999);
                    break;
                case 'duration':
                    // Use robust service-calculated duration
                    const durA = a.zoneDurationMs ?? 0;
                    const durB = b.zoneDurationMs ?? 0;
                    comparison = durA - durB;
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        return sorted;
    }, [displayVehiclesUnsorted, sortField, sortDirection]);

    const getLevelColor = (percentage: number) => {
        if (percentage < 15) return '#ef4444'; // Red
        if (percentage < 30) return '#f59e0b'; // Amber
        return '#10b981'; // Green
    };

    // Render sort indicator
    const SortIndicator = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="sort-indicator sort-indicator--inactive">⇅</span>;
        return sortDirection === 'asc'
            ? <ArrowUp size={12} className="sort-indicator" />
            : <ArrowDown size={12} className="sort-indicator" />;
    };

    if (isLoading) {
        return (
            <div className="asset-table asset-table--loading">
                <div className="skeleton-rows">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton skeleton--row" />)}
                </div>
            </div>
        );
    }


    return (
        <div className="asset-table">
            <div className="asset-table__header">
                <button className="asset-table__header-cell col-asset sortable" onClick={() => handleSort('asset')}>
                    ASSET <SortIndicator field="asset" />
                </button>
                <button className="asset-table__header-cell col-model sortable" onClick={() => handleSort('model')}>
                    MAKE/MODEL <SortIndicator field="model" />
                </button>
                <button className="asset-table__header-cell col-driver sortable" onClick={() => handleSort('driver')}>
                    DRIVER <SortIndicator field="driver" />
                </button>
                <button className="asset-table__header-cell col-fuel sortable" onClick={() => handleSort('fuel')}>
                    FUEL <SortIndicator field="fuel" />
                </button>
                <button className="asset-table__header-cell col-soc sortable" onClick={() => handleSort('soc')}>
                    SOC <SortIndicator field="soc" />
                </button>
                {/* SERVICE column hidden - MaintenanceReminder API not available in dev mode */}
                <div className="asset-table__header-cell col-icons">
                    <Wifi size={14} />
                    <Battery size={14} />
                    <ClipboardCheck size={14} />
                    <Camera size={14} />
                </div>
                <button className="asset-table__header-cell col-dur sortable" onClick={() => handleSort('duration')}>
                    STAY <SortIndicator field="duration" />
                </button>
            </div>

            <div className="asset-table__body">
                {displayVehicles.map((vehicle) => {
                    const isExpanded = expandedVehicleId === vehicle.device.id;

                    return (
                        <div key={vehicle.device.id} className="asset-table__row-wrapper">
                            <button
                                type="button"
                                className={`asset-table__row ${isExpanded ? 'asset-table__row--expanded' : ''}`}
                                onClick={() => handleRowClick(vehicle.device.id)}
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
                                    ) : (
                                        <span className="level-text level-text--empty">--</span>
                                    )}
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
                                    ) : (
                                        <span className="level-text level-text--empty">--</span>
                                    )}
                                </div>
                                {/* SERVICE column hidden - MaintenanceReminder API not available */}
                                <div className="asset-table__cell col-icons">
                                    <Wifi size={16} className={vehicle.status.isDeviceCommunicating ? 'icon--success' : 'icon--danger'} />
                                    <Battery size={16} className={(vehicle.batteryVoltage ?? 13) > 12.2 ? 'icon--success' : 'icon--danger'} />
                                    <ClipboardCheck size={16} className={!vehicle.hasUnrepairedDefects ? 'icon--success' : 'icon--danger'} />
                                    <Camera size={16} className="icon--success" />
                                </div>
                                <div className="asset-table__cell col-dur">
                                    {formatZoneDuration(vehicle)}
                                </div>
                            </button>

                            {isExpanded && (
                                <HealthCockpit vehicle={vehicle} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
