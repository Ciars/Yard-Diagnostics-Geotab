/**
 * Zone Counts Hook
 * 
 * Fetches vehicle counts for a list of zones.
 * Used for the sidebar to show how many vehicles are in each yard.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys, POLLING_INTERVALS } from '@/lib/queryClient';
import { FleetDataService } from '@/services/FleetDataService';
import { useGeotabApi } from './useGeotabApi';
import type { Zone } from '@/types/geotab';

export function useZoneCounts(zones: Zone[]) {
    const { api, isLoading: apiLoading, error: apiError } = useGeotabApi();

    const query = useQuery({
        // Include zone IDs in key so it refetches if zones change
        queryKey: [...queryKeys.all, 'zone-counts', { zones: zones.map(z => z.id).sort() }],
        queryFn: async () => {
            if (!api) throw new Error('API not available');
            const service = new FleetDataService(api);
            return service.getZoneVehicleCounts(zones);
        },
        enabled: !!api && zones.length > 0 && !apiLoading,
        refetchInterval: POLLING_INTERVALS.STATUS_DATA, // 60s polling
        refetchIntervalInBackground: false,
        staleTime: 30000,
    });

    return {
        counts: query.data ?? {},
        isLoading: apiLoading || query.isLoading,
        error: apiError || query.error,
    };
}
