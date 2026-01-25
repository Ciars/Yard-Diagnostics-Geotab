/**
 * Vehicles in Zone Hook
 * 
 * Fetches vehicle data for a specific zone with automatic
 * 60-second polling when zone is selected.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, POLLING_INTERVALS } from '@/lib/queryClient';
import { FleetDataService } from '@/services/FleetDataService';
import { useGeotabApi } from './useGeotabApi';
import { useFleetStore } from '@/store/useFleetStore';
import type { VehicleData, KpiCounts, Zone } from '@/types/geotab';

interface UseVehiclesInZoneResult {
    vehicles: VehicleData[];
    kpis: KpiCounts;
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
    refetch: () => void;
    dataUpdatedAt: number;
}

export function useVehiclesInZone(zone: Zone | null): UseVehiclesInZoneResult {
    const { api, isLoading: apiLoading, error: apiError } = useGeotabApi();
    const zoneId = zone?.id;

    const query = useQuery({
        queryKey: queryKeys.vehiclesInZone(zoneId ?? ''),
        queryFn: async () => {
            if (!api || !zone) throw new Error('API or zoneId not available');
            const service = new FleetDataService(api);
            return service.getVehicleDataForZone(zone);
        },
        enabled: !!api && !!zone && !apiLoading,
        refetchInterval: POLLING_INTERVALS.STATUS_DATA,
        refetchIntervalInBackground: false, // Pause when tab hidden
    });

    const setVehicles = useFleetStore((s) => s.setVehicles);

    // Sync to store when data changes
    useEffect(() => {
        if (query.data) {
            setVehicles(query.data);
        }
    }, [query.data, setVehicles]);

    const vehicles = query.data ?? [];
    const kpis = FleetDataService.calculateKpis(vehicles);

    return {
        vehicles,
        kpis,
        isLoading: apiLoading || query.isLoading,
        isFetching: query.isFetching,
        error: apiError || query.error,
        refetch: query.refetch,
        dataUpdatedAt: query.dataUpdatedAt,
    };
}
