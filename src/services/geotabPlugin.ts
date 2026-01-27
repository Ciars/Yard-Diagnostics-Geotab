/**
 * Geotab Add-In Bootstrap
 * 
 * This script hooks into the MyGeotab add-in lifecycle.
 * When MyGeotab loads the iframe/app, it looks for:
 * window.geotab.addin.{ADDIN_NAME} = function(api, state) { ... }
 * 
 * We use this to capture the 'api' object and make it available globally
 * so our React app can find it via GeotabApiFactory.
 */

// Define global types
declare global {
    interface Window {
        // 'geotab' is likely already declared in another d.ts or library
        // We only add our custom one
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geotabApi: any; // Our custom global for the factory to find
    }
}

export function initGeotabPlugin() {
    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.geotab = w.geotab || {};
    w.geotab.addin = w.geotab.addin || {};

    // Standard boilerplate for Geotab drive/addins
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addinHandler = function (api: any, _state: any) {
        // console.log('[GeotabPlugin] Add-in initialized!', api, state);

        // EXPOSE API GLOBALLY so GeotabApiFactory can find it
        window.geotabApi = api;

        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            initialize: function (api: any, _state: any, callback: () => void) {
                // console.log('[GeotabPlugin] initialize called');
                window.geotabApi = api; // Ensure it's set
                callback();
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            focus: function (api: any, _state: any) {
                // console.log('[GeotabPlugin] focus called');
                window.geotabApi = api;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            blur: function (_api: any, _state: any) {
                // console.log('[GeotabPlugin] blur called');
            }
        };
    };

    // We must guess the add-in name or register a catch-all if possible.
    // The system ID in the config is "geoyard_diagnostics_final" (lowercase, spaces replaced usually)
    // or checks the URL hash.
    // To be safe, we assign the handler to likely potential names.

    // Name from config: "GeoYard Diagnostics Final"
    // Likely likely internal ID: "geoyard_diagnostics_final"
    // Or "geoyardDiagnosticsFinal" 

    // Let's register to the generic name AND derived names
    w.geotab.addin.geoyard_diagnostics_final = addinHandler;
    w.geotab.addin.geoyardDiagnosticsFinal = addinHandler;
    // Explicitly add the v2 version we encouraged the user to create
    w.geotab.addin.geoyard_diagnostics_final_v2 = addinHandler;

    // DYNAMIC REGISTRATION: Parse the current URL hash to find the actual ID Geotab is using
    // URL format: .../#addin-my_custom_id-index
    const hash = window.location.hash;
    if (hash && hash.includes('addin-')) {
        const parts = hash.split('addin-');
        if (parts.length > 1) {
            // Extract "my_custom_id" from "my_custom_id-index"
            let id = parts[1];
            if (id.includes('-index')) {
                id = id.split('-index')[0];
            }
            // console.log('[GeotabPlugin] Detected dynamic ID:', id);
            // Register this ID too
            w.geotab.addin[id] = addinHandler;
        }
    }

    // Also hook "tester" just in case the user IS running "tester"
    w.geotab.addin.tester = addinHandler;

    // console.log('[GeotabPlugin] Hooks registered');
}
