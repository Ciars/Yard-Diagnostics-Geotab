/**
 * Zones Hook
 * 
 * Fetches and caches the list of zones (yards/depots)
 * using TanStack Query.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { FleetDataService } from '@/services/FleetDataService';
import { useGeotabApi } from './useGeotabApi';
import type { Zone } from '@/types/geotab';

interface UseZonesResult {
    zones: Zone[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export function useZones(): UseZonesResult {
    const { api, isLoading: apiLoading, error: apiError } = useGeotabApi();

    const query = useQuery({
        queryKey: queryKeys.zones(),
        queryFn: async () => {
            if (!api) throw new Error('API not initialized');
            const service = new FleetDataService(api);
            return service.getZones();
        },
        enabled: !!api && !apiLoading,
        staleTime: Infinity, // Zones rarely change, only refetch manually
    });

    return {
        zones: query.data ?? [],
        isLoading: apiLoading || query.isLoading,
        error: apiError || query.error,
        refetch: query.refetch,
    };
}
