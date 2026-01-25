/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEOTAB_SERVER: string
    readonly VITE_GEOTAB_DATABASE: string
    readonly VITE_GEOTAB_USERNAME: string
    readonly VITE_GEOTAB_PASSWORD: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

// Geotab API types for window.api
interface GeotabApi {
    call<T>(method: string, params: object, callback?: (result: T) => void, errorCallback?: (error: Error) => void): void;
    multiCall<T>(calls: GeotabApiCall[], callback?: (results: T[]) => void, errorCallback?: (error: Error) => void): void;
    getSession(callback: (session: GeotabSession) => void): void;
}

interface GeotabApiCall {
    method: string;
    params: object;
}

interface GeotabSession {
    database: string;
    userName: string;
    sessionId: string;
    path: string;
}

interface GeotabState {
    [key: string]: unknown;
}

declare global {
    interface Window {
        api?: GeotabApi;
        geotab?: {
            addin: {
                geoYardDiagnostics: {
                    initialize(api: GeotabApi, state: GeotabState, callback: () => void): void;
                    focus(api: GeotabApi, state: GeotabState): void;
                    blur(api: GeotabApi, state: GeotabState): void;
                };
            };
        };
    }
}

export { };
