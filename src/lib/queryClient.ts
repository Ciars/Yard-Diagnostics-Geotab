/**
 * TanStack Query Client Configuration
 * 
 * Centralized query client with optimized defaults for
 * 60-second polling and stale-while-revalidate pattern.
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Data becomes stale after 30 seconds
            staleTime: 30_000,

            // Cache unused data for 5 minutes
            gcTime: 5 * 60 * 1000,

            // Retry failed requests up to 3 times
            retry: 3,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

            // Don't refetch on window focus (we use manual polling)
            refetchOnWindowFocus: false,

            // Don't refetch on reconnect (we use manual polling)
            refetchOnReconnect: false,
        },
        mutations: {
            // Retry mutations once
            retry: 1,
        },
    },
});

/**
 * Query Keys
 * 
 * Centralized query key factory for consistent cache management.
 */
export const queryKeys = {
    // Base keys
    all: ['geoyard'] as const,

    // Zones
    zones: () => [...queryKeys.all, 'zones'] as const,

    // Vehicles
    vehicles: () => [...queryKeys.all, 'vehicles'] as const,
    vehiclesInZone: (zoneId: string) => [...queryKeys.vehicles(), 'zone', zoneId] as const,
    vehicleDetail: (deviceId: string) => [...queryKeys.vehicles(), 'detail', deviceId] as const,

    // Diagnostics
    diagnostics: () => [...queryKeys.all, 'diagnostics'] as const,
    deviceDiagnostics: (deviceId: string) => [...queryKeys.diagnostics(), deviceId] as const,

    // Session
    session: () => [...queryKeys.all, 'session'] as const,
};

/**
 * Polling Configuration
 */
export const POLLING_INTERVALS = {
    /** Status data refresh interval (60 seconds) */
    STATUS_DATA: 60_000,

    /** Trip data refresh interval (5 minutes) */
    TRIPS: 5 * 60 * 1000,

    /** Zone list refresh (on focus only) */
    ZONES: false as const,
} as const;
