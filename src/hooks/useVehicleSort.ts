import { useState, useMemo } from 'react';
import type { VehicleData } from '@/types/geotab';

export type SortField = 'asset' | 'model' | 'driver' | 'fuel' | 'soc' | 'duration';
export type SortDirection = 'asc' | 'desc';

export function useVehicleSort(vehicles: VehicleData[]) {
    const [sortField, setSortField] = useState<SortField>('duration');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection(field === 'duration' ? 'asc' : 'desc');
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
                    // Put undefined/null at the end
                    if (a.fuelLevel === undefined) return 1;
                    if (b.fuelLevel === undefined) return -1;
                    comparison = a.fuelLevel - b.fuelLevel;
                    break;
                case 'soc':
                    // Put undefined/null at the end
                    if (a.stateOfCharge === undefined) return 1;
                    if (b.stateOfCharge === undefined) return -1;
                    comparison = a.stateOfCharge - b.stateOfCharge;
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
    }, [vehicles, sortField, sortDirection]);

    return {
        sortedVehicles,
        sortField,
        sortDirection,
        handleSort,
    };
}
