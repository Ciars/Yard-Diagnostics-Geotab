import { useEffect, useMemo, useState } from 'react';
import type { VehicleData } from '@/types/geotab';

export type SortField = 'asset' | 'model' | 'driver' | 'fuel' | 'soc' | 'duration';
export type SortDirection = 'asc' | 'desc';

const SORT_PREFERENCE_KEY = 'geoyard.asset-table.sort';

interface SortPreference {
    field: SortField;
    direction: SortDirection;
}

const DEFAULT_SORT: SortPreference = {
    field: 'duration',
    direction: 'desc',
};

function isSortField(value: unknown): value is SortField {
    return value === 'asset' ||
        value === 'model' ||
        value === 'driver' ||
        value === 'fuel' ||
        value === 'soc' ||
        value === 'duration';
}

function isSortDirection(value: unknown): value is SortDirection {
    return value === 'asc' || value === 'desc';
}

function loadSortPreference(): SortPreference {
    if (typeof window === 'undefined') return DEFAULT_SORT;

    try {
        const raw = window.localStorage.getItem(SORT_PREFERENCE_KEY);
        if (!raw) return DEFAULT_SORT;

        const parsed = JSON.parse(raw) as Partial<SortPreference>;
        if (!isSortField(parsed.field) || !isSortDirection(parsed.direction)) {
            return DEFAULT_SORT;
        }

        return {
            field: parsed.field,
            direction: parsed.direction,
        };
    } catch {
        return DEFAULT_SORT;
    }
}

export function useVehicleSort(vehicles: VehicleData[]) {
    const initialSort = useMemo(() => loadSortPreference(), []);
    const [sortField, setSortField] = useState<SortField>(initialSort.field);
    const [sortDirection, setSortDirection] = useState<SortDirection>(initialSort.direction);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        window.localStorage.setItem(
            SORT_PREFERENCE_KEY,
            JSON.stringify({ field: sortField, direction: sortDirection })
        );
    }, [sortField, sortDirection]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection(field === 'duration' ? 'desc' : 'asc');
        }
    };

    const sortedVehicles = useMemo(() => {
        const sorted = [...vehicles];
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
                    if (a.fuelLevel === undefined && b.fuelLevel === undefined) {
                        comparison = 0;
                        break;
                    }
                    if (a.fuelLevel === undefined) {
                        comparison = 1;
                        break;
                    }
                    if (b.fuelLevel === undefined) {
                        comparison = -1;
                        break;
                    }
                    comparison = a.fuelLevel - b.fuelLevel;
                    break;
                case 'soc':
                    if (a.stateOfCharge === undefined && b.stateOfCharge === undefined) {
                        comparison = 0;
                        break;
                    }
                    if (a.stateOfCharge === undefined) {
                        comparison = 1;
                        break;
                    }
                    if (b.stateOfCharge === undefined) {
                        comparison = -1;
                        break;
                    }
                    comparison = a.stateOfCharge - b.stateOfCharge;
                    break;

                case 'duration': {
                    const durA = a.zoneDurationMs ?? 0;
                    const durB = b.zoneDurationMs ?? 0;
                    comparison = durA - durB;
                    break;
                }
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
        return sorted;
    }, [vehicles, sortField, sortDirection]);

    return {
        sortedVehicles,
        sortField,
        sortDirection,
        handleSort,
    };
}
