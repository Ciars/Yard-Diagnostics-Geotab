/**
 * Geotab API Hook
 * 
 * Provides access to the Geotab API instance with proper
 * initialization and error handling.
 */

import { useState, useEffect } from 'react';
import { GeotabApiFactory, type IGeotabApi } from '@/services/GeotabApiFactory';

interface UseGeotabApiResult {
    api: IGeotabApi | null;
    isLoading: boolean;
    error: Error | null;
    isProduction: boolean;
}

export function useGeotabApi(): UseGeotabApiResult {
    const [api, setApi] = useState<IGeotabApi | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function initApi() {
            try {
                const instance = await GeotabApiFactory.getInstance();
                if (!cancelled) {
                    setApi(instance);
                    setIsLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setIsLoading(false);
                }
            }
        }

        initApi();

        return () => {
            cancelled = true;
        };
    }, []);

    return {
        api,
        isLoading,
        error,
        isProduction: GeotabApiFactory.isGeotabContext(),
    };
}
