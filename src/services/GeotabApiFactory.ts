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
     * Check if we are potentially in a Geotab environment, even if API isn't ready yet.
     */
    static isGeotabContext(): boolean {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        return typeof window !== 'undefined' && (!!w.geotab || !!w.api || (window.self !== window.top && window.location.hostname.includes('geotab.com')));
    }

    /**
     * Check if the API is actually ready to use right now
     */
    static isApiReady(): boolean {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        return (
            (w.api && typeof w.api.call === 'function') ||
            (w.geotabApi && typeof w.geotabApi.call === 'function') ||
            (w.geotab && w.geotab.api && typeof w.geotab.api.call === 'function')
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
        // Logic: If we are in Geotab context, we MUST wait for the API.
        // Falling back to DevAuthShim in production causes 404s and failures.

        if (this.isGeotabContext()) {
            console.log('[GeotabApiFactory] Geotab context detected. Waiting for API...');

            // Wait up to 10 seconds for the API to appear (handled by plugin)
            try {
                const api = await this.waitForApi();
                console.log('[GeotabApiFactory] API acquired!', api);
                const { ProductionApiAdapter } = await import('./ProductionApiAdapter');
                return new ProductionApiAdapter(api);
            } catch (err) {
                console.error('[GeotabApiFactory] Failed to acquire API:', err);
                // Fallthrough to dev mode or throw? Throwing is safer to see the error.
                throw err;
            }
        }

        // Development mode (Localhost / Standalone)
        console.log('[GeotabApiFactory] Non-Geotab context - using DevAuthShim');
        const { DevAuthShim } = await import('./DevAuthShim');

        const credentials = {
            server: import.meta.env.VITE_GEOTAB_SERVER || 'my.geotab.com',
            database: import.meta.env.VITE_GEOTAB_DATABASE,
            userName: import.meta.env.VITE_GEOTAB_USERNAME,
            password: import.meta.env.VITE_GEOTAB_PASSWORD,
        };

        if (!credentials.database || !credentials.userName || !credentials.password) {
            console.warn(
                '[GeotabApiFactory] Missing credentials for Dev Mode. ' +
                'Please configure .env.local if you are running locally.'
            );
        }

        return DevAuthShim.create(credentials);
    }

    private static waitForApi(): Promise<any> {
        return new Promise((resolve, reject) => {
            // Check immediately
            if (this.isApiReady()) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                resolve((window as any).geotabApi || (window as any).api || (window as any).geotab?.api);
                return;
            }

            let attempts = 0;
            const maxAttempts = 100; // 10 seconds (100 * 100ms)

            const interval = setInterval(() => {
                attempts++;
                if (this.isApiReady()) {
                    clearInterval(interval);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    resolve((window as any).geotabApi || (window as any).api || (window as any).geotab?.api);
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    console.error('[GeotabApiFactory] Timeout waiting for Geotab API injection');
                    reject(new Error('Geotab API not found after 10s timeout'));
                }
            }, 100);
        });
    }
}
