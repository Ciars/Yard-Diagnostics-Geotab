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

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { List } from 'react-window';
import type { ListImperativeAPI } from 'react-window';

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
    onRowHoverChange?: (vehicleId: string | null) => void;
    onRowToggle?: (vehicleId: string, isExpanding: boolean) => void;
}

const COLLAPSED_ROW_HEIGHT = 58;
const EXPANDED_ROW_HEIGHT = 860;


export function AssetTable({
    vehicles,
    isLoading,
    isEnriching,
    onRowHoverChange,
    onRowToggle
}: AssetTableProps) {
    const listRef = useRef<ListImperativeAPI | null>(null);
    const expandedVehicleId = useFleetStore(selectExpandedVehicleId);
    const setExpandedVehicle = useFleetStore((s) => s.setExpandedVehicle);

    const filteredVehicles = useVehicleFilter(vehicles);

    // 2. Sort
    const { sortedVehicles, sortField, sortDirection, handleSort } = useVehicleSort(filteredVehicles);

    // Handle row click (toggle expansion)
    const toggleExpanded = useCallback((id: string) => {
        const isExpanding = expandedVehicleId !== id;
        setExpandedVehicle(isExpanding ? id : null);
        onRowToggle?.(id, isExpanding);
    }, [expandedVehicleId, onRowToggle, setExpandedVehicle]);

    // Item data passed to rows
    const itemData = useMemo(() => ({
        vehicles: sortedVehicles,
        toggleExpanded,
        isEnriching,
        onRowHoverChange
    }), [sortedVehicles, toggleExpanded, isEnriching, onRowHoverChange]);

    useEffect(() => {
        return () => onRowHoverChange?.(null);
    }, [onRowHoverChange]);

    // Force list reset when expansion changes
    const [listVersion, setListVersion] = useState(0);
    useEffect(() => {
        setListVersion(v => v + 1);
    }, [expandedVehicleId]);

    const expandedIndex = useMemo(() => {
        if (!expandedVehicleId) return -1;
        return sortedVehicles.findIndex((vehicle) => vehicle.device.id === expandedVehicleId);
    }, [sortedVehicles, expandedVehicleId]);

    useEffect(() => {
        if (expandedIndex < 0) return;

        const frame = requestAnimationFrame(() => {
            listRef.current?.scrollToRow({
                index: expandedIndex,
                align: 'start',
                behavior: 'smooth'
            });
        });

        return () => cancelAnimationFrame(frame);
    }, [expandedIndex, listVersion]);

    // Dynamic row height
    const getItemSize = useMemo(() => (index: number) => {
        const vehicle = sortedVehicles[index];
        if (!vehicle) return COLLAPSED_ROW_HEIGHT;
        const isExpanded = vehicle.device.id === expandedVehicleId;
        return isExpanded ? EXPANDED_ROW_HEIGHT : COLLAPSED_ROW_HEIGHT;
    }, [sortedVehicles, expandedVehicleId]);

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
                    key={listVersion}
                    listRef={listRef}
                    style={{
                        height: '100%',
                        width: '100%'
                    }}
                    rowCount={sortedVehicles.length}
                    rowHeight={getItemSize}
                    rowProps={itemData}
                    rowComponent={AssetRow as any}
                    className="virtual-list"
                />
            </div>
        </div>
    );
}
