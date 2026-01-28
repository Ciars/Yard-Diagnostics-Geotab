/**
 * Fleet Global Store (Zustand)
 * 
 * Central state management for GeoYard Diagnostics.
 * Handles zone selection, KPI filtering, and UI state.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Zone, VehicleData, KpiFilterType } from '@/types/geotab';

// =============================================================================
// State Interface
// =============================================================================

interface FleetState {
    // Data
    zones: Zone[];
    vehicles: VehicleData[];

    // Selection
    selectedZoneId: string | null;
    activeKpiFilter: KpiFilterType | null;
    expandedVehicleId: string | null;

    // UI
    sidebarCollapsed: boolean;
    searchQuery: string;

    // Meta
    lastUpdated: number | null;
    isPollingPaused: boolean;
}

interface FleetActions {
    // Zone actions
    setZones: (zones: Zone[]) => void;
    setSelectedZone: (zoneId: string | null) => void;

    // Vehicle actions
    setVehicles: (vehicles: VehicleData[]) => void;

    // Filter actions
    toggleKpiFilter: (filter: KpiFilterType) => void;
    clearKpiFilter: () => void;

    // UI actions
    setExpandedVehicle: (vehicleId: string | null) => void;
    toggleSidebar: () => void;
    setSearchQuery: (query: string) => void;

    // Meta actions
    setLastUpdated: (timestamp: number) => void;
    setPollingPaused: (paused: boolean) => void;

    // Reset
    reset: () => void;
}

type FleetStore = FleetState & FleetActions;

// =============================================================================
// Initial State
// =============================================================================

const initialState: FleetState = {
    zones: [],
    vehicles: [],
    selectedZoneId: null,
    activeKpiFilter: null,
    expandedVehicleId: null,
    sidebarCollapsed: false,
    searchQuery: '',
    lastUpdated: null,
    isPollingPaused: false,
};

// =============================================================================
// Store
// =============================================================================

export const useFleetStore = create<FleetStore>()(
    // Only enable devtools in development mode
    import.meta.env.DEV ? devtools(
        (set) => ({
            ...initialState,

            // Zone actions
            setZones: (zones) => set({ zones }, false, 'setZones'),

            setSelectedZone: (zoneId) => set(
                {
                    selectedZoneId: zoneId,
                    // Clear filter when changing zone
                    activeKpiFilter: null,
                    expandedVehicleId: null,
                },
                false,
                'setSelectedZone'
            ),

            // Vehicle actions
            setVehicles: (vehicles) => set(
                { vehicles, lastUpdated: Date.now() },
                false,
                'setVehicles'
            ),

            // Filter actions
            toggleKpiFilter: (filter) => set(
                (state) => ({
                    activeKpiFilter: state.activeKpiFilter === filter ? null : filter,
                    expandedVehicleId: null, // Collapse any expanded row
                }),
                false,
                'toggleKpiFilter'
            ),

            clearKpiFilter: () => set(
                { activeKpiFilter: null },
                false,
                'clearKpiFilter'
            ),

            // UI actions
            setExpandedVehicle: (vehicleId) => set(
                { expandedVehicleId: vehicleId },
                false,
                'setExpandedVehicle'
            ),

            toggleSidebar: () => set(
                (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
                false,
                'toggleSidebar'
            ),

            setSearchQuery: (query) => set(
                { searchQuery: query },
                false,
                'setSearchQuery'
            ),

            // Meta actions
            setLastUpdated: (timestamp) => set(
                { lastUpdated: timestamp },
                false,
                'setLastUpdated'
            ),

            setPollingPaused: (paused) => set(
                { isPollingPaused: paused },
                false,
                'setPollingPaused'
            ),

            // Reset
            reset: () => set(initialState, false, 'reset'),
        }),
        { name: 'FleetStore' }
    ) : (set) => ({
        ...initialState,

        // Zone actions
        setZones: (zones) => set({ zones }),

        setSelectedZone: (zoneId) => set(
            {
                selectedZoneId: zoneId,
                // Clear filter when changing zone
                activeKpiFilter: null,
                expandedVehicleId: null,
            }
        ),

        // Vehicle actions
        setVehicles: (vehicles) => set(
            { vehicles, lastUpdated: Date.now() }
        ),

        // Filter actions
        toggleKpiFilter: (filter) => set(
            (state) => ({
                activeKpiFilter: state.activeKpiFilter === filter ? null : filter,
                expandedVehicleId: null, // Collapse any expanded row
            })
        ),

        clearKpiFilter: () => set(
            { activeKpiFilter: null }
        ),

        // UI actions
        setExpandedVehicle: (vehicleId) => set(
            { expandedVehicleId: vehicleId }
        ),

        toggleSidebar: () => set(
            (state) => ({ sidebarCollapsed: !state.sidebarCollapsed })
        ),

        setSearchQuery: (query) => set(
            { searchQuery: query }
        ),

        // Meta actions
        setLastUpdated: (timestamp) => set(
            { lastUpdated: timestamp }
        ),

        setPollingPaused: (paused) => set(
            { isPollingPaused: paused }
        ),

        // Reset
        reset: () => set(initialState),
    })
);

// =============================================================================
// Selectors (for optimized subscriptions)
// =============================================================================

export const selectZones = (state: FleetStore) => state.zones;
export const selectSelectedZoneId = (state: FleetStore) => state.selectedZoneId;
export const selectVehicles = (state: FleetStore) => state.vehicles;
export const selectActiveKpiFilter = (state: FleetStore) => state.activeKpiFilter;
export const selectExpandedVehicleId = (state: FleetStore) => state.expandedVehicleId;
export const selectSidebarCollapsed = (state: FleetStore) => state.sidebarCollapsed;
export const selectSearchQuery = (state: FleetStore) => state.searchQuery;

/**
 * Selector: Get filtered zones based on search query
 */
export const selectFilteredZones = (state: FleetStore) => {
    const query = state.searchQuery.toLowerCase().trim();
    if (!query) return state.zones;
    return state.zones.filter((zone) =>
        zone.name.toLowerCase().includes(query)
    );
};

/**
 * Selector: Get the currently selected zone object
 */
export const selectSelectedZone = (state: FleetStore) => {
    if (!state.selectedZoneId) return null;
    return state.zones.find((z) => z.id === state.selectedZoneId) ?? null;
};

/**
 * Selector: Get vehicles filtered by active KPI filter
 */
export const selectFilteredVehicles = (state: FleetStore) => {
    const { vehicles, activeKpiFilter } = state;
    if (!activeKpiFilter) return vehicles;

    switch (activeKpiFilter) {
        case 'critical':
            return vehicles.filter((v) => v.hasCriticalFaults || v.hasUnrepairedDefects);
        case 'silent':
            return vehicles.filter((v) => !v.status.isDeviceCommunicating);
        case 'dormant':
            return vehicles.filter((v) => (v.dormancyDays ?? 0) >= 14);
        case 'charging':
            return vehicles.filter((v) => v.isCharging);

        default:
            return vehicles;
    }
};
