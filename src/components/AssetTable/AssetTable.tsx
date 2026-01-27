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
}

// Helper to adapt v2 props (spread) to what AssetRow expects (data prop)
// Moved OUTSIDE to prevent unmounting/remounting on every render
const Row = ({ index, style, vehicles, toggleExpanded }: any) => (
    <AssetRow
        data={{ vehicles, toggleExpanded }}
        index={index}
        style={style}
    />
);

export function AssetTable({ vehicles, isLoading }: AssetTableProps) {
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
        toggleExpanded
    }), [sortedVehicles, expandedVehicleId]);

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
                <div className="skeleton-rows">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton skeleton--row" />)}
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
