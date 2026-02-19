/**
 * Geotab API Interface
 * 
 * Abstract interface implemented by both ProductionApiAdapter and DevAuthShim
 */

import type { ApiCall, GeotabCredentials, GeotabSession } from '@/types/geotab';

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
        if (typeof window === 'undefined') return false;
        const w = window as any;

        const hasInjectedApi =
            !!(w.api && typeof w.api.call === 'function') ||
            !!(w.geotabApi && typeof w.geotabApi.call === 'function') ||
            !!(w.geotab && w.geotab.api && typeof w.geotab.api.call === 'function');

        const hostIncludesGeotab = window.location.hostname.includes('geotab.com');
        const referrerIncludesGeotab = typeof document !== 'undefined' && document.referrer.includes('geotab.com');
        const inIframe = window.self !== window.top;

        // Do not rely on presence of `window.geotab` alone because our bootstrap creates it.
        return hasInjectedApi || hostIncludesGeotab || (inIframe && referrerIncludesGeotab);
    }

    /**
     * Check if the API is actually ready to use right now
     */
    static isApiReady(): boolean {
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
        // Logic: If we are in Geotab context (and NOT in local dev), we MUST wait for the API.
        // Falling back to DevAuthShim in production causes 404s and failures.

        // Priority: Check if we are explicitly in Dev mode first.
        const isDev = import.meta.env.DEV;
        const allowDevAuthShim = isDev || import.meta.env.VITE_ENABLE_DEV_AUTH_SHIM === '1';
        const inIframe = typeof window !== 'undefined' && window.self !== window.top;
        const isLocalhost = typeof window !== 'undefined'
            && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        const canUseDevShim = allowDevAuthShim || (isLocalhost && !inIframe);

        if (canUseDevShim) {
            // DEV in iframe/Add-In contexts: strongly prefer injected portal API.
            if (this.isApiReady() || this.isGeotabContext() || inIframe) {
                try {
                    const api = await this.waitForApi(30_000);
                    const { ProductionApiAdapter } = await import('./ProductionApiAdapter');
                    return new ProductionApiAdapter(api);
                } catch (err) {
                    // If we're inside an iframe, falling back to DevAuthShim often causes quota/perf issues.
                    // Surface the injection failure instead of silently switching auth modes.
                    if (inIframe) {
                        throw err;
                    }
                    console.warn('[GeotabApiFactory] Injected API unavailable, falling back to DevAuthShim:', err);
                }
            }

            // Local standalone: use credential-based shim only when explicitly enabled.
            const credentials = await this.getDevShimCredentials();
            if (credentials) {
                const { DevAuthShim } = await import('./DevAuthShim');
                return DevAuthShim.create(credentials);
            }

            if (allowDevAuthShim || isLocalhost) {
                console.warn(
                    '[GeotabApiFactory] DevAuthShim requested but credentials are unavailable. ' +
                    'Configure .env.local and use local auth mode.'
                );
            }
        }

        // Production Mode: in Add-In/iframe scenarios, wait for injected API even if context signals are late.
        if (this.isApiReady() || this.isGeotabContext() || inIframe) {
            try {
                const api = await this.waitForApi(30_000);
                const { ProductionApiAdapter } = await import('./ProductionApiAdapter');
                return new ProductionApiAdapter(api);
            } catch (err) {
                console.error('[GeotabApiFactory] Failed to acquire API:', err);
                throw err;
            }
        }

        // If we reach here, we are in Production build but not in Geotab context.
        // We cannot fallback to DevAuthShim because we don't have credentials in production build.
        throw new Error('Geotab API not detected. Please ensure you are running inside MyGeotab or use Development mode.');
    }

    private static async getDevShimCredentials(): Promise<GeotabCredentials | null> {
        // Security: keep VITE_GEOTAB_* references in a dedicated module so deployment builds
        // can tree-shake credential access when local auth shim is not enabled.
        if (!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_AUTH_SHIM === '1')) {
            return null;
        }

        const { getDevShimCredentials } = await import('./devShimCredentials');
        return getDevShimCredentials();
    }

    private static waitForApi(timeoutMs = 10_000): Promise<any> {
        return new Promise((resolve, reject) => {
            // Check immediately
            if (this.isApiReady()) {
                resolve((window as any).geotabApi || (window as any).api || (window as any).geotab?.api);
                return;
            }

            let attempts = 0;
            const pollMs = 100;
            const maxAttempts = Math.ceil(timeoutMs / pollMs);

            const interval = setInterval(() => {
                attempts++;
                if (this.isApiReady()) {
                    clearInterval(interval);
                    resolve((window as any).geotabApi || (window as any).api || (window as any).geotab?.api);
                } else if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    console.error('[GeotabApiFactory] Timeout waiting for Geotab API injection');
                    reject(new Error(`Geotab API not found after ${Math.round(timeoutMs / 1000)}s timeout`));
                }
            }, pollMs);
        });
    }
}
