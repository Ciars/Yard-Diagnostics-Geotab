/**
 * Vehicles in Zone Hook
 * 
 * Fetches vehicle data for a specific zone with automatic
 * 60-second polling when zone is selected.
 */

import { useEffect, useMemo, useState } from 'react';
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
    isPollingActive: boolean;
    error: Error | null;
    refetch: () => void;
    dataUpdatedAt: number;
}

export function useVehiclesInZone(zone: Zone | null): UseVehiclesInZoneResult {
    const { api, isLoading: apiLoading, error: apiError } = useGeotabApi();
    const isPollingPaused = useFleetStore((s) => s.isPollingPaused);
    const [isPageVisible, setIsPageVisible] = useState(
        typeof document === 'undefined' ? true : document.visibilityState === 'visible'
    );
    const zoneId = zone?.id;
    const zoneShapeHash = useMemo(() => {
        if (!zone?.points?.length) return 'no-points';

        let hash = 0;
        for (const point of zone.points) {
            const token = `${point.x.toFixed(6)},${point.y.toFixed(6)};`;
            for (let i = 0; i < token.length; i++) {
                hash = ((hash << 5) - hash) + token.charCodeAt(i);
                hash |= 0;
            }
        }

        return `${zone.points.length}:${hash}`;
    }, [zone?.points]);

    useEffect(() => {
        if (typeof document === 'undefined') return;

        const handleVisibilityChange = () => {
            setIsPageVisible(document.visibilityState === 'visible');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const isPollingActive = isPageVisible && !isPollingPaused;

    // STAGE 1: Fast initial fetch (Basic device info + Status)
    const fastQuery = useQuery({
        queryKey: [
            ...queryKeys.vehiclesInZone(zoneId ?? ''),
            'fast',
            zoneShapeHash
        ],
        queryFn: async () => {
            if (!api || !zone) throw new Error('API or zoneId not available');
            const service = new FleetDataService(api);
            return service.getVehicleDataForZone(zone.id);
        },
        enabled: !!api && !!zone && !apiLoading,
        staleTime: 30000,
        refetchInterval: isPollingActive ? POLLING_INTERVALS.STATUS_DATA : false,
        refetchIntervalInBackground: false,
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
                hasCriticalFaults: enriched.hasCriticalFaults,
                hasUnrepairedDefects: enriched.hasUnrepairedDefects,
                health: enriched.health,
                batteryVoltage: enriched.batteryVoltage
            };
        });
    }, [fastQuery.data, enrichQuery.data]);

    // Sync to store when data changes
    useEffect(() => {
        setVehicles(vehicles);
    }, [vehicles, setVehicles]);

    const kpis = FleetDataService.calculateKpis(vehicles);

    return {
        vehicles,
        kpis,
        isLoading: apiLoading || fastQuery.isLoading,
        isFetching: fastQuery.isFetching || enrichQuery.isFetching,
        isEnriching: enrichQuery.isFetching,
        isPollingActive,
        error: apiError || fastQuery.error || (enrichQuery.error as Error),
        refetch: () => {
            fastQuery.refetch();
            enrichQuery.refetch();
        },
        dataUpdatedAt: fastQuery.dataUpdatedAt,
    };
}
