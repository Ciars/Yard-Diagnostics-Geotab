# GeoYard Diagnostics - Development Roadmap

> **Project**: GeoYard Diagnostics for Circet UK & Ireland  
> **Target**: 10,000-vehicle fleet management across infrastructure yards  
> **Last Updated**: 2026-01-23

---

## Progress Overview

| Milestone | Status | Tickets |
|-----------|--------|---------|
| **M1**: Core Infrastructure | ✅ Complete | 3/3 |
| **M2**: UI Component Library | ✅ Complete | 5/5 |
| **M3**: Data & Logic Orchestration | ✅ Complete | 4/4 |
| **M4**: Interactive Features & Map | ✅ Complete | 4/4 |
| **M5**: Data Quality & Accuracy | 🔄 In Progress | 0/3 |

---

# Milestone 5: Data Quality & Accuracy 🔄

> **Goal**: Fix critical data accuracy issues - Make/Model, Zone Duration, Service Due

## M5-T1: Make/Model via VIN Decoding 🔴 HIGH PRIORITY

**Problem**: Currently showing license plates/asset IDs instead of manufacturer and model.

**Solution**: Use Geotab's `DecodeVins` API to decode `device.vehicleIdentificationNumber`.

**Target Files**:
- `src/services/VinDecoderService.ts` [NEW]
- `src/services/FleetDataService.ts` [MODIFY]

**Acceptance Criteria**:
- [ ] Collect all VINs from devices in zone
- [ ] Batch call `DecodeVins` API with VINs
- [ ] Cache decoded results (VIN data is static)
- [ ] Display as "Make Model" (e.g., "Ford Transit")
- [ ] Show "--" only if VIN is missing/invalid

---

## M5-T2: Zone Duration Improvements 🟡 MEDIUM PRIORITY

**Problem**: Some vehicles showing blank duration despite being in zone.

**Root Causes**:
1. No trip data available for some vehicles
2. Trip.stopPoint not matching zone polygon

**Solution**: Improve fallback chain with multiple data sources.

**Target Files**:
- `src/services/FleetDataService.ts` [MODIFY]

**Acceptance Criteria**:
- [ ] Primary: Trip.stopPoint inside zone polygon
- [ ] Fallback 1: Last Trip.stop timestamp (if in zone now)
- [ ] Fallback 2: DeviceStatusInfo.dateTime (last known position time)
- [ ] Never show blank - always show a value or "Just Now"
- [ ] Add debug logging for matching failures

---

## M5-T3: Service Due Investigation 🟢 LOW PRIORITY

**Problem**: All vehicles showing "--" for service due.

**Investigation Required**:
1. Query MaintenanceReminder without device filter to check if ANY exist
2. If none exist, this is a MyGeotab configuration issue
3. Consider hiding column if no data available

**Target Files**:
- `src/services/FleetDataService.ts` [MODIFY]
- `src/components/AssetTable/AssetTable.tsx` [MODIFY]

**Acceptance Criteria**:
- [ ] Add diagnostic query to check MaintenanceReminder availability
- [ ] If no reminders in database: hide SERVICE column
- [ ] If reminders exist: debug why they're not matching devices



---

# Milestone 1: Core Infrastructure ✅

> **Goal**: Establish the Geotab API connection layer with dual-mode authentication.

## M1-T1: Geotab Service Layer ✅

**Target Files**:
- `src/services/GeotabApiFactory.ts` ✅
- `src/services/ProductionApiAdapter.ts` ✅
- `src/services/DevAuthShim.ts` ✅
- `src/types/geotab.ts` ✅

**Acceptance Criteria**:
- [x] Factory detects production vs development environment
- [x] DevAuthShim authenticates via JSON-RPC
- [x] DevAuthShim handles invalid `path` responses (thisserver fix)
- [x] All Geotab entity types are defined
- [x] TypeScript build passes with strict mode

---

## M1-T2: Manifest & Lifecycle Hooks ✅

**Target Files**:
- `public/manifest.json` ✅
- `src/geotab/lifecycle.ts` (pending wire-up)

**Acceptance Criteria**:
- [x] manifest.json defines Add-in page configuration
- [x] `initialize`, `focus`, `blur` lifecycle methods typed
- [ ] Lifecycle methods wired to React app (deferred to M2)

---

## M1-T3: TanStack Query & Hooks ✅

**Target Files**:
- `src/lib/queryClient.ts` ✅
- `src/hooks/useGeotabApi.ts` ✅
- `src/hooks/useZones.ts` ✅
- `src/hooks/useVehiclesInZone.ts` ✅

**Acceptance Criteria**:
- [x] QueryClient configured with 60s polling
- [x] `useZones` fetches and caches zone list
- [x] `useVehiclesInZone` fetches vehicle data with auto-refresh
- [x] App displays "695 yards/depots" from live API

---

# Milestone 2: UI Component Library (Zenith Atoms)

> **Goal**: Build atomic React components matching Zenith Design System.

## M2-T1: Zustand Global Store

**Target Files**:
- `src/store/useFleetStore.ts` [NEW]

**Acceptance Criteria**:
- [ ] Store holds `selectedZoneId`, `activeKpiFilter`, `expandedVehicleId`
- [ ] Actions: `setSelectedZone()`, `toggleKpiFilter()`, `setExpandedVehicle()`
- [ ] Selective subscriptions work (no unnecessary re-renders)

**Sub-Agent Instructions**:
```
1. Read docs/TECH_SPEC.md for store structure requirements
2. Create Zustand store with typed state and actions
3. Export store and selector hooks
4. Write unit test verifying state updates
```

---

## M2-T2: Sidebar Component

**Target Files**:
- `src/components/Sidebar/Sidebar.tsx` [NEW]
- `src/components/Sidebar/ZoneListItem.tsx` [NEW]
- `src/components/Sidebar/Sidebar.css` [NEW]

**Acceptance Criteria**:
- [ ] Fixed 280px width sidebar with navy background (#1a2b49)
- [ ] Search input filters zones in real-time
- [ ] Zone list shows name + vehicle count badge
- [ ] Selected zone highlighted in Circet Blue
- [ ] Clicking zone updates Zustand `selectedZoneId`

**Sub-Agent Instructions**:
```
1. Read docs/UI_BLUEPRINT.md Section 2.A for Sidebar specs
2. Use useZones() hook to get zone data
3. Use useFleetStore() to read/write selectedZoneId
4. Implement real-time search filter with useMemo
5. Style according to Zenith color palette
```

---

## M2-T3: KPI Tiles Component

**Target Files**:
- `src/components/Dashboard/KpiTiles.tsx` [NEW]
- `src/components/Dashboard/KpiTile.tsx` [NEW]
- `src/components/Dashboard/KpiTiles.css` [NEW]

**Acceptance Criteria**:
- [ ] 5 horizontal white tiles with 2px colored top border
- [ ] Each tile shows: large number, label, description
- [ ] Tiles: Critical Health (red), Silent (slate), Dormant (amber), Charging (teal), Service Due (gray)
- [ ] Clicking tile toggles filter state in Zustand
- [ ] Active tile shows "pressed" visual state

**Sub-Agent Instructions**:
```
1. Read docs/UI_BLUEPRINT.md Section 2.B for KPI Tile specs
2. Read docs/DATA_LOGIC.md Section 2 for KPI calculation logic
3. Use useVehiclesInZone() to get vehicle data for selected zone
4. Calculate KPI counts using FleetDataService.calculateKpis()
5. Wire click handlers to useFleetStore().toggleKpiFilter()
```

---

## M2-T4: Asset Table Component

**Target Files**:
- `src/components/AssetTable/AssetTable.tsx` [NEW]
- `src/components/AssetTable/AssetRow.tsx` [NEW]
- `src/components/AssetTable/AssetDetail.tsx` [NEW]
- `src/components/AssetTable/AssetTable.css` [NEW]

**Acceptance Criteria**:
- [ ] Master-detail expandable row pattern
- [ ] Columns: Asset (ID+icon), Battery (icon), Service, DUR (dormancy)
- [ ] "Just Arrived" text for vehicles stopped < 5 minutes
- [ ] Expanded row shows active faults with severity badges
- [ ] Table filters by active KPI filter from Zustand
- [ ] Sticky header with internal scroll

**Sub-Agent Instructions**:
```
1. Read docs/UI_BLUEPRINT.md Section 2.D for table specs
2. Read docs/DATA_LOGIC.md Section 4 for "Just Arrived" logic
3. Use useVehiclesInZone() and filter by activeKpiFilter
4. Implement expandable rows with useFleetStore().expandedVehicleId
5. Style severity badges: Critical (red), Medium (amber), Low (green)
```

---

## M2-T5: Main Dashboard Layout

**Target Files**:
- `src/components/Dashboard/Dashboard.tsx` [NEW]
- `src/components/Dashboard/Dashboard.css` [NEW]
- `src/App.tsx` [MODIFY]

**Acceptance Criteria**:
- [ ] Layout: Sidebar left (280px), main content right
- [ ] Main content: KPI Tiles → Map placeholder → Asset Table
- [ ] Responsive: sidebar collapses on screens < 1024px
- [ ] Empty state shown when no zone selected

**Sub-Agent Instructions**:
```
1. Read docs/UI_BLUEPRINT.md Section 5 for layout constraints
2. Create flex layout with fixed sidebar and fluid main area
3. Integrate Sidebar, KpiTiles, and AssetTable components
4. Add responsive breakpoints for tablet/mobile
5. Replace App.tsx content with Dashboard component
```

---

# Milestone 3: Data & Logic Orchestration

> **Goal**: Implement optimized data fetching and business logic engines.

## M3-T1: Zone-First Multicall Optimization

**Target Files**:
- `src/services/FleetDataService.ts` [MODIFY]

**Acceptance Criteria**:
- [ ] `getVehicleDataForZone()` uses actual zone filtering
- [ ] Batched multicall with 100 devices per batch
- [ ] Fetch Device, StatusData, FaultData, Trip, DVIRDefect in single multicall
- [ ] Performance: < 3 seconds for 200 vehicles

**Sub-Agent Instructions**:
```
1. Read docs/DATA_LOGIC.md Section 5 for fetching strategy
2. Update getDevicesInZone() to filter by currentZoneSearch
3. Optimize multicall to minimize API round-trips
4. Add performance timing logs
5. Test with a zone containing 100+ vehicles
```

---

## M3-T2: Dormancy Calculation Engine

**Target Files**:
- `src/services/DormancyService.ts` [NEW]

**Acceptance Criteria**:
- [ ] Calculate whole stationary days from DeviceStatusInfo.currentStateDuration
- [ ] Fall back to DeviceStatusInfo.dateTime age only when currentStateDuration is missing or invalid
- [ ] Return "Just Arrived" for < 5 minute stops
- [ ] Flag vehicles dormant >= 14 days

**Sub-Agent Instructions**:
```
1. Read docs/DATA_LOGIC.md Section 2 (Dormant)
2. Create pure functions for dormancy calculation
3. Handle edge cases: missing or invalid currentStateDuration, null dates
4. Export formatDormancyDuration() for display
```

---

## M3-T3: EV Charging Status Engine

**Target Files**:
- `src/services/ChargingService.ts` [NEW]

**Acceptance Criteria**:
- [ ] Query DiagnosticChargingStateId for each device
- [ ] Binary classification: `value > 0` = Charging
- [ ] Query DiagnosticStateOfChargeId for battery percentage
- [ ] Return charging vehicles with SoC data

**Sub-Agent Instructions**:
```
1. Read docs/DATA_LOGIC.md Section 3 for Diagnostic IDs
2. Create getChargingStatus(deviceId) function
3. Use DiagnosticIds.CHARGING_STATE and DiagnosticIds.STATE_OF_CHARGE
4. Handle EV vs non-EV vehicles (no charging data = not EV)
```

---

## M3-T4: Critical Health Alerts Engine

**Target Files**:
- `src/services/HealthService.ts` [NEW]

**Acceptance Criteria**:
- [ ] Fetch active FaultData with severity = 'Critical'
- [ ] Fetch DVIRDefect with repairStatus != 'Repaired'
- [ ] Check battery voltage < 11.8V
- [ ] Aggregate into single "health score" per vehicle

**Sub-Agent Instructions**:
```
1. Read docs/DATA_LOGIC.md Section 2 (Critical Health) and Section 3
2. Query FaultData with isActive filter
3. Query DVIRDefect (NOT DutyStatusLog) for unrepaired defects
4. Check DiagnosticIds.BATTERY_VOLTAGE threshold
5. Return { hasCriticalFaults, hasUnrepairedDefects, lowBattery }
```

---

# Milestone 4: Interactive Features & Map

> **Goal**: Add Leaflet map integration and real-time updates.

## M4-T1: Leaflet Map Integration

**Target Files**:
- `src/components/Map/ZoneMap.tsx` [NEW]
- `src/components/Map/VehicleMarker.tsx` [NEW]
- `src/components/Map/ZoneMap.css` [NEW]

**Acceptance Criteria**:
- [ ] Leaflet map with OpenStreetMap tiles
- [ ] Render zone polygon from Zone.points
- [ ] SVG circle markers for vehicles with status colors
- [ ] Auto-zoom (fitBounds) on zone selection
- [ ] Minimum height 300px

**Sub-Agent Instructions**:
```
1. npm install leaflet react-leaflet @types/leaflet
2. Read docs/UI_BLUEPRINT.md Section 2.C for map specs
3. Create ZoneMap component with useRef for Leaflet instance
4. Convert Zone.points [{x,y}] to Leaflet LatLng [y,x]
5. Color markers by health status
```

---

## M4-T2: KPI → Table Filter Wiring

**Target Files**:
- `src/components/Dashboard/KpiTiles.tsx` [MODIFY]
- `src/components/AssetTable/AssetTable.tsx` [MODIFY]

**Acceptance Criteria**:
- [ ] Clicking KPI tile filters table to matching vehicles
- [ ] Map auto-zooms to filtered vehicle cluster
- [ ] Clicking same tile again clears filter
- [ ] URL state updates (optional: query params)

**Sub-Agent Instructions**:
```
1. Use useFleetStore() for activeKpiFilter state
2. In AssetTable, filter vehicles by activeKpiFilter
3. Pass filtered vehicle IDs to ZoneMap for fitBounds
4. Add clear filter button or click-to-toggle behavior
```

---

## M4-T3: 60-Second Background Polling

**Target Files**:
- `src/hooks/useVehiclesInZone.ts` [MODIFY]
- `src/components/Dashboard/UpdateToast.tsx` [NEW]

**Acceptance Criteria**:
- [ ] TanStack Query polls every 60 seconds
- [ ] Polling pauses when tab is hidden
- [ ] If data changes AND row is expanded, show toast instead of auto-refresh
- [ ] Toast: "New Updates Available" - click to refresh

**Sub-Agent Instructions**:
```
1. Read docs/UI_BLUEPRINT.md Section 3 for toast behavior
2. Add refetchInterval: 60_000 to query (already done)
3. Track previous data hash to detect changes
4. If expandedVehicleId is set and data changed, show toast
5. Toast click: refetch() and update data
```

---

## M4-T4: Geotab Lifecycle Wire-up

**Target Files**:
- `src/geotab/lifecycle.ts` [NEW]
- `src/main.tsx` [MODIFY]

**Acceptance Criteria**:
- [ ] Export `geoYardDiagnostics` object with initialize/focus/blur
- [ ] `focus()` starts polling, fetches initial data
- [ ] `blur()` pauses polling to save resources
- [ ] Works both in production portal and dev mode

**Sub-Agent Instructions**:
```
1. Read docs/TECH_SPEC.md Section 2 for lifecycle specs
2. Create lifecycle.ts exporting geoYardDiagnostics
3. In focus(), call queryClient.resumePausedMutations()
4. In blur(), call queryClient.cancelQueries()
5. Register on window.geotab.addin in main.tsx
```

---

## Appendix: Quick Reference

### Diagnostic ID Constants
```typescript
import { DiagnosticIds } from '@/types/geotab';
// DiagnosticIds.BATTERY_VOLTAGE
// DiagnosticIds.CHARGING_STATE
// DiagnosticIds.STATE_OF_CHARGE
// DiagnosticIds.FUEL_LEVEL
// DiagnosticIds.ODOMETER
```

### Key Hooks
```typescript
import { useZones, useVehiclesInZone, useGeotabApi } from '@/hooks';
import { useFleetStore } from '@/store/useFleetStore';
```

### Color Palette (CSS Variables)
```css
--color-primary: #0066cc (Circet Blue)
--color-danger: #ef4444 (Critical)
--color-warning: #f59e0b (Dormant/Service)
--color-success: #10b981 (Charging/Healthy)
--color-muted: #6b7280 (Silent/Inactive)
```

---

*Document Version: 1.0 | Created: 2026-01-23*
