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
        return new Promise((resolve, reject) => {
            this.api.call<T>(
                method,
                params,
                (result) => resolve(result),
                (error) => reject(this.normalizeError(error))
            );
        });
    }

    /**
     * Execute multiple API calls in a batch (promisified)
     */
    async multiCall<T extends unknown[]>(calls: ApiCall[]): Promise<T> {
        return new Promise((resolve, reject) => {
            this.api.multiCall<T>(
                calls,
                (results) => resolve(results),
                (error) => reject(this.normalizeError(error))
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
