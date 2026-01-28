import { useMemo } from 'react';
import type { VehicleData } from '@/types/geotab';
import { useFleetStore, selectActiveKpiFilter } from '@/store/useFleetStore';

export function useVehicleFilter(vehicles: VehicleData[]) {
    const activeFilter = useFleetStore(selectActiveKpiFilter);

    const filteredVehicles = useMemo(() => {
        if (!activeFilter) return vehicles;

        return vehicles.filter((v) => {
            switch (activeFilter) {
                case 'critical':
                    return v.hasCriticalFaults || v.hasUnrepairedDefects;
                case 'silent':
                    return !v.status.isDeviceCommunicating;
                case 'dormant':
                    return (v.dormancyDays ?? 0) >= 14;
                case 'charging':
                    return v.isCharging;

                default:
                    return true;
            }
        });
    }, [vehicles, activeFilter]);

    return filteredVehicles;
}
