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

        const shouldRetryInit = (message: string): boolean => {
            const lower = message.toLowerCase();
            return (
                lower.includes('geotab api not found after 10s timeout') ||
                lower.includes('geotab api not detected') ||
                lower.includes('failed to fetch dynamically imported module') ||
                lower.includes('err_connection_refused')
            );
        };

        async function initApi(attempt = 0) {
            try {
                const instance = await GeotabApiFactory.getInstance();
                if (!cancelled) {
                    setApi(instance);
                    setError(null);
                    setIsLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    const resolvedError = err instanceof Error ? err : new Error(String(err));
                    const MAX_RETRIES = 20;
                    const RETRY_DELAY_MS = 2_000;

                    if (shouldRetryInit(resolvedError.message) && attempt < MAX_RETRIES) {
                        setTimeout(() => {
                            if (!cancelled) {
                                initApi(attempt + 1);
                            }
                        }, RETRY_DELAY_MS);
                        return;
                    }

                    setError(resolvedError);
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
