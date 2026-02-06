import { useMemo } from 'react';
import type { VehicleData } from '@/types/geotab';
import { useFleetStore, selectActiveKpiFilter } from '@/store/useFleetStore';
import { matchesKpiFilter } from '@/lib/vehicleHealthPredicates';

export function useVehicleFilter(vehicles: VehicleData[]) {
    const activeFilter = useFleetStore(selectActiveKpiFilter);

    const filteredVehicles = useMemo(() => {
        if (!activeFilter) return vehicles;

        return vehicles.filter((v) => matchesKpiFilter(v, activeFilter));
    }, [vehicles, activeFilter]);

    return filteredVehicles;
}
