/**
 * Zone Counts Hook
 * 
 * Fetches vehicle counts for a list of zones.
 * Used for the sidebar to show how many vehicles are in each yard.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys, POLLING_INTERVALS } from '@/lib/queryClient';
import { FleetDataService } from '@/services/FleetDataService';
import { useGeotabApi } from './useGeotabApi';
import type { Zone } from '@/types/geotab';

export function useZoneCounts(zones: Zone[], isPollingPaused = false) {
    const { api, isLoading: apiLoading, error: apiError } = useGeotabApi();
    const [isPageVisible, setIsPageVisible] = useState(
        typeof document === 'undefined' ? true : document.visibilityState === 'visible'
    );

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

    const query = useQuery({
        // Include zone IDs in key so it refetches if zones change
        queryKey: [...queryKeys.all, 'zone-counts', { zones: zones.map(z => z.id).sort() }],
        queryFn: async () => {
            if (!api) throw new Error('API not available');
            const service = new FleetDataService(api);
            return service.getZoneVehicleCounts(zones);
        },
        enabled: !!api && zones.length > 0 && !apiLoading,
        refetchInterval: isPollingActive ? POLLING_INTERVALS.STATUS_DATA : false,
        refetchIntervalInBackground: false,
        staleTime: 30000,
    });

    return {
        counts: query.data ?? {},
        isLoading: apiLoading || query.isLoading,
        error: apiError || query.error,
    };
}
