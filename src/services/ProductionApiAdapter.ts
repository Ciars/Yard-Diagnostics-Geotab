/**
 * Production API Adapter
 * 
 * Wraps the Geotab-injected window.api with our IGeotabApi interface.
 * Used when running inside the MyGeotab portal as an Add-in.
 */

import type { IGeotabApi } from './GeotabApiFactory';
import type { ApiCall, GeotabSession } from '@/types/geotab';

// Type for the raw Geotab API injected into window
interface GeotabWindowApi {
    call<T>(
        method: string,
        params: Record<string, unknown>,
        callback?: (result: T) => void,
        errorCallback?: (error: Error) => void
    ): void;
    multiCall<T>(
        calls: ApiCall[],
        callback?: (results: T) => void,
        errorCallback?: (error: Error) => void
    ): void;
    getSession(callback: (session: GeotabSession) => void): void;
}

export class ProductionApiAdapter implements IGeotabApi {
    private api: GeotabWindowApi;
    private session: GeotabSession | null = null;

    constructor(api: GeotabWindowApi) {
        this.api = api;
    }

    /**
     * Execute a single API call (promisified)
     */
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
        const startTime = Date.now();
        const typeName = (params.typeName as string) || 'unknown';

        // DEBUG: Log exact payload - REMOVED for Production release
        // console.log(`[ProductionAPI] SENDING call: ${method}`, JSON.stringify(params));

        return new Promise((resolve, reject) => {
            this.api.call<T>(
                method,
                params,
                (result) => {
                    const duration = Date.now() - startTime;
                    console.log(`[ProductionAPI] ${method}(${typeName}) completed in ${duration}ms`);
                    resolve(result);
                },
                (error) => {
                    const duration = Date.now() - startTime;
                    console.error(`[ProductionAPI] ${method}(${typeName}) FAILED after ${duration}ms:`, error);
                    reject(this.normalizeError(error));
                }
            );
        });
    }

    /**
     * Execute multiple API calls in a batch (promisified)
     * 
     * RESILIENT: On error, returns empty arrays instead of rejecting entirely.
     * This matches DevAuthShim behavior and prevents single call failures
     * from crashing the entire data load.
     */
    async multiCall<T extends unknown[]>(calls: ApiCall[]): Promise<T> {
        // DEBUG: Log exact payload
        console.log(`[ProductionAPI] SENDING multiCall: ${calls.length} items`, JSON.stringify(calls));

        return new Promise((resolve) => {
            this.api.multiCall<T>(
                calls,
                (results) => resolve(results),
                (error) => {
                    // Log but don't throw - return empty arrays for failed calls
                    console.error('[ProductionApiAdapter] multiCall partial failure:', this.normalizeError(error));
                    // Fallback: return array of empty results matching call count
                    resolve(calls.map(() => []) as T);
                }
            );
        });
    }

    /**
     * Get session information (promisified + cached)
     */
    async getSession(): Promise<GeotabSession> {
        if (this.session) {
            return this.session;
        }

        return new Promise((resolve) => {
            this.api.getSession((session) => {
                this.session = session;
                resolve(session);
            });
        });
    }

    /**
     * Production API is always authenticated (session managed by portal)
     */
    isAuthenticated(): boolean {
        return true;
    }

    private normalizeError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }
        if (typeof error === 'object' && error !== null && 'message' in error) {
            return new Error((error as { message: string }).message);
        }
        return new Error(String(error));
    }
}
