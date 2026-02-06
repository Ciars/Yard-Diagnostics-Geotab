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
        geotabApi: any; // Our custom global for the factory to find
    }
}

export function initGeotabPlugin() {
    if (typeof window === 'undefined') return;

    const w = window as any;
    w.geotab = w.geotab || {};
    const addinRegistry = w.geotab.addin || {};
    w.geotab.addin = addinRegistry;

    // Standard boilerplate for Geotab drive/addins
    const addinHandler = function (api: any, _state: any) {
        // console.log('[GeotabPlugin] Add-in initialized!', api, state);

        // EXPOSE API GLOBALLY so GeotabApiFactory can find it
        window.geotabApi = api;
        w.api = api;

        return {
            initialize: function (api: any, _state: any, callback: () => void) {
                // console.log('[GeotabPlugin] initialize called');
                window.geotabApi = api; // Ensure it's set
                w.api = api;
                callback();
            },
            focus: function (api: any, _state: any) {
                // console.log('[GeotabPlugin] focus called');
                window.geotabApi = api;
                w.api = api;
            },
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
    addinRegistry.geoyard_diagnostics_final = addinHandler;
    addinRegistry.geoyardDiagnosticsFinal = addinHandler;
    // Explicitly add the v2 version we encouraged the user to create
    addinRegistry.geoyard_diagnostics_final_v2 = addinHandler;

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
            addinRegistry[id] = addinHandler;
        }
    }

    // Also hook "tester" just in case the user IS running "tester"
    addinRegistry.tester = addinHandler;

    // Defensive fallback: proxy unknown add-in IDs to our handler.
    // MyGeotab can use arbitrary IDs depending on registration naming.
    if (!w.__geoyardAddinProxyInstalled) {
        w.geotab.addin = new Proxy(addinRegistry, {
            get(target, prop, receiver) {
                if (typeof prop === 'string' && !(prop in target)) {
                    target[prop] = addinHandler;
                }
                return Reflect.get(target, prop, receiver);
            }
        });
        w.__geoyardAddinProxyInstalled = true;
    }

    // If MyGeotab already exposes window.api, consume it immediately.
    if (w.api && typeof w.api.call === 'function') {
        window.geotabApi = w.api;
    }

    // console.log('[GeotabPlugin] Hooks registered');
}
