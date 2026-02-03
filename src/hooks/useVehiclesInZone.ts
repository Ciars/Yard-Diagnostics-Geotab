/**
 * Vehicles in Zone Hook
 * 
 * Fetches vehicle data for a specific zone with automatic
 * 60-second polling when zone is selected.
 */

import { useEffect, useMemo } from 'react';
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
    isEnriching: boolean;
    error: Error | null;
    refetch: () => void;
    dataUpdatedAt: number;
}

export function useVehiclesInZone(zone: Zone | null): UseVehiclesInZoneResult {
    const { api, isLoading: apiLoading, error: apiError } = useGeotabApi();
    const zoneId = zone?.id;

    // STAGE 1: Fast initial fetch (Basic device info + Status)
    const fastQuery = useQuery({
        queryKey: [
            ...queryKeys.vehiclesInZone(zoneId ?? ''),
            'fast',
            zone?.points?.length ?? 0
        ],
        queryFn: async () => {
            if (!api || !zone) throw new Error('API or zoneId not available');
            const service = new FleetDataService(api);
            return service.getVehicleDataForZone(zone.id);
        },
        enabled: !!api && !!zone && !apiLoading,
        staleTime: 30000,
        refetchInterval: POLLING_INTERVALS.STATUS_DATA,
    });

    // STAGE 2: Background enrichment (Drivers, Faults)
    const enrichQuery = useQuery({
        queryKey: [
            ...queryKeys.vehiclesInZone(zoneId ?? ''),
            'enrich'
        ],
        queryFn: async () => {
            if (!api || !fastQuery.data) throw new Error('API or basic data not available');
            const service = new FleetDataService(api);
            return service.enrichVehicleData(fastQuery.data);
        },
        // Only run enrichment once we have the fast data
        enabled: !!api && !!fastQuery.data && fastQuery.data.length > 0,
        staleTime: 60000,
        // Don't refetch enrichment as often as status
    });

    const setVehicles = useFleetStore((s) => s.setVehicles);

    // Merge: Use a robust per-vehicle merge to prevent data loss during polling/updates.
    // fastQuery provides the latest GPS/Status.
    // enrichQuery provides the background metadata (SOC, Fuel, Drivers, Faults).
    const vehicles = useMemo(() => {
        const baseVehicles = fastQuery.data ?? [];
        const enrichedMetadata = enrichQuery.data ?? [];

        if (enrichedMetadata.length === 0) return baseVehicles;

        // Create a lookup map for enriched data
        const enrichMap = new Map<string, VehicleData>();
        enrichedMetadata.forEach(v => enrichMap.set(v.device.id, v));

        // Overlay enrichment onto base GPS/Status data
        return baseVehicles.map(v => {
            const enriched = enrichMap.get(v.device.id);
            if (!enriched) return v;

            return {
                ...v,
                // These fields are enriched in Phase 3
                fuelLevel: enriched.fuelLevel,
                stateOfCharge: enriched.stateOfCharge,
                driverName: enriched.driverName,
                activeFaults: enriched.activeFaults,
                hasCriticalFaults: enriched.hasCriticalFaults
            };
        });
    }, [fastQuery.data, enrichQuery.data]);

    // Sync to store when data changes
    useEffect(() => {
        if (vehicles.length > 0) {
            setVehicles(vehicles);
        }
    }, [vehicles, setVehicles]);

    const kpis = FleetDataService.calculateKpis(vehicles);

    return {
        vehicles,
        kpis,
        isLoading: apiLoading || fastQuery.isLoading,
        isFetching: fastQuery.isFetching || enrichQuery.isFetching,
        isEnriching: enrichQuery.isFetching,
        error: apiError || fastQuery.error || (enrichQuery.error as Error),
        refetch: () => {
            fastQuery.refetch();
            enrichQuery.refetch();
        },
        dataUpdatedAt: fastQuery.dataUpdatedAt,
    };
}
