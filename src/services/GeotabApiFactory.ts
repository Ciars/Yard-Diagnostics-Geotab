/**
 * Geotab API Interface
 * 
 * Abstract interface implemented by both ProductionApiAdapter and DevAuthShim
 */

import type { ApiCall, GeotabSession } from '@/types/geotab';

export interface IGeotabApi {
    /**
     * Execute a single API call
     */
    call<T>(method: string, params: Record<string, unknown>): Promise<T>;

    /**
     * Execute multiple API calls in a single request (batch)
     */
    multiCall<T extends unknown[]>(calls: ApiCall[]): Promise<T>;

    /**
     * Get the current session information
     */
    getSession(): Promise<GeotabSession>;

    /**
     * Check if the API is authenticated and ready
     */
    isAuthenticated(): boolean;
}

/**
 * Geotab API Factory
 * 
 * Creates the appropriate API adapter based on environment:
 * - Production: Uses window.api (injected by Geotab portal)
 * - Development: Uses DevAuthShim with .env.local credentials
 */
export class GeotabApiFactory {
    private static instance: IGeotabApi | null = null;
    private static initPromise: Promise<IGeotabApi> | null = null;

    /**
     * Get or create the API instance
     * Thread-safe singleton with lazy initialization
     */
    static async getInstance(): Promise<IGeotabApi> {
        if (this.instance) {
            return this.instance;
        }

        // Prevent race conditions during initialization
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.createInstance();
        this.instance = await this.initPromise;
        this.initPromise = null;

        return this.instance;
    }

    /**
     * Check if we're running inside the Geotab portal
     */
    static isProductionEnvironment(): boolean {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        return (
            typeof window !== 'undefined' &&
            ((w.api && typeof w.api.call === 'function') ||
                (w.geotab && w.geotab.api && typeof w.geotab.api.call === 'function'))
        );
    }

    /**
     * Reset the singleton (useful for testing)
     */
    static reset(): void {
        this.instance = null;
        this.initPromise = null;
    }

    private static async createInstance(): Promise<IGeotabApi> {
        if (this.isProductionEnvironment()) {
            console.log('[GeotabApiFactory] Production mode detected');
            const { ProductionApiAdapter } = await import('./ProductionApiAdapter');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const api = (window as any).api || (window as any).geotab?.api;
            return new ProductionApiAdapter(api);
        }

        // Development mode
        console.log('[GeotabApiFactory] Development mode - using DevAuthShim');
        const { DevAuthShim } = await import('./DevAuthShim');

        const credentials = {
            server: import.meta.env.VITE_GEOTAB_SERVER || 'my.geotab.com',
            database: import.meta.env.VITE_GEOTAB_DATABASE,
            userName: import.meta.env.VITE_GEOTAB_USERNAME,
            password: import.meta.env.VITE_GEOTAB_PASSWORD,
        };

        if (!credentials.database || !credentials.userName || !credentials.password) {
            throw new Error(
                '[GeotabApiFactory] Missing credentials. ' +
                'Please configure VITE_GEOTAB_DATABASE, VITE_GEOTAB_USERNAME, and VITE_GEOTAB_PASSWORD in .env.local'
            );
        }

        return DevAuthShim.create(credentials);
    }
}
