/**
 * Asset Table Component
 * 
 * High-fidelity master-detail table as per GeoYard design.
 * Features:
 * - Virtualization via react-window for high performance
 * - Sticky headers
 * - Auto-sizing to container
 * - Sortable columns
 */

import { useMemo, useRef } from 'react';
import { List } from 'react-window';

import { useFleetStore, selectExpandedVehicleId } from '@/store/useFleetStore';

import type { VehicleData } from '@/types/geotab';
import { AssetRow } from './AssetRow';
import { AssetTableHeader } from './AssetTableHeader';
import { useVehicleFilter } from '@/hooks/useVehicleFilter';
import { useVehicleSort } from '@/hooks/useVehicleSort';
import './AssetTable.css';

interface AssetTableProps {
    vehicles: VehicleData[];
    isLoading?: boolean;
    isEnriching?: boolean;
}

// Helper to adapt v2 props (spread) to what AssetRow expects (data prop)
// Moved OUTSIDE to prevent unmounting/remounting on every render
const Row = ({ index, style, vehicles, toggleExpanded, isEnriching }: any) => (
    <AssetRow
        data={{ vehicles, toggleExpanded, isEnriching }}
        index={index}
        style={style}
    />
);

export function AssetTable({ vehicles, isLoading, isEnriching }: AssetTableProps) {
    const listRef = useRef<any>(null);
    const expandedVehicleId = useFleetStore(selectExpandedVehicleId);
    const setExpandedVehicle = useFleetStore((s) => s.setExpandedVehicle);

    const filteredVehicles = useVehicleFilter(vehicles);

    // 2. Sort
    const { sortedVehicles, sortField, sortDirection, handleSort } = useVehicleSort(filteredVehicles);

    // Handle row click (toggle expansion)
    const toggleExpanded = (id: string) => {
        setExpandedVehicle(expandedVehicleId === id ? null : id);
    };

    // Item data passed to rows
    const itemData = useMemo(() => ({
        vehicles: sortedVehicles,
        toggleExpanded,
        isEnriching
    }), [sortedVehicles, expandedVehicleId, isEnriching]);

    // Dynamic row height
    const getItemSize = (index: number) => {
        const vehicle = sortedVehicles[index];
        if (!vehicle) return 58;
        // Base row height 58px + Expanded content ~1200px
        const isExpanded = vehicle.device.id === expandedVehicleId;
        return isExpanded ? 1200 : 58;
    };

    if (isLoading) {
        return (
            <div className="asset-table asset-table--loading">
                <AssetTableHeader
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                />
                <div className="asset-table__body-container">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="asset-table__row asset-table__row--skeleton">
                            <div className="asset-table__cell"><div className="skeleton-box" style={{ width: '80%' }} /></div>
                            <div className="asset-table__cell"><div className="skeleton-box" style={{ width: '60%' }} /></div>
                            <div className="asset-table__cell"><div className="skeleton-box" style={{ width: '70%' }} /></div>
                            <div className="asset-table__cell"><div className="skeleton-box" style={{ width: '40%' }} /></div>
                            <div className="asset-table__cell"><div className="skeleton-box" style={{ width: '40%' }} /></div>
                            <div className="asset-table__cell"><div className="skeleton-box" style={{ width: '100px' }} /></div>
                            <div className="asset-table__cell"><div className="skeleton-box" style={{ width: '50px' }} /></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (sortedVehicles.length === 0) {
        return (
            <div className="asset-table">
                <AssetTableHeader
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                />
                <div className="no-data">No assets found matching current filters.</div>
            </div>
        );
    }

    return (
        <div className="asset-table">
            <AssetTableHeader
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
            />

            <div className="asset-table__body-container">
                <List
                    listRef={listRef}
                    style={{
                        height: '100%',
                        width: '100%'
                    }}
                    rowCount={sortedVehicles.length}
                    rowHeight={getItemSize}
                    rowProps={itemData}
                    rowComponent={Row}
                    className="virtual-list"
                />
            </div>
        </div>
    );
}
