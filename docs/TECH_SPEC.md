# GeoYard Diagnostics - Technical Specification

---

## 1. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | **React 19** | Leveraging Suspense, Transitions, and `use` API |
| Build Tool | **Vite 6** | Fast HMR, optimized production bundling |
| Language | **TypeScript** | Strict mode enabled |
| State Management | **Zustand** | Lightweight, selective subscriptions for 10k scale |
| Data Fetching | **TanStack Query** | Caching, background refetch, stale-while-revalidate |
| UI System | **Geotab Zenith** | Atomic components (Atoms, Molecules, Organisms) |
| Map Engine | **Leaflet.js** | Proven stability, wide documentation |
| Hosting | **Cloudflare Pages** | Static deployment via GitHub |

---

## 2. Geotab Add-in Lifecycle

The application must export standard Geotab lifecycle methods:

```typescript
// src/geotab/lifecycle.ts

export const geoYardDiagnostics = {
  /**
   * Called once when Add-in loads
   * - Setup API session
   * - Check user permissions (DeviceList, ZoneList)
   * - Initialize Zustand store
   */
  initialize(api: GeotabApi, state: GeotabState, callback: () => void): void,

  /**
   * Called when user clicks "GeoYard" menu item
   * - Start 60-second polling via TanStack Query
   * - Fetch initial zone/vehicle data
   */
  focus(api: GeotabApi, state: GeotabState): void,

  /**
   * Called when user navigates away
   * - Pause background polling
   * - Preserve state for quick resume
   */
  blur(api: GeotabApi, state: GeotabState): void,
};
```

---

## 3. API Service Layer (Dual-Mode Bridge)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Application                         │
├─────────────────────────────────────────────────────────────┤
│               TanStack Query + Zustand Store                 │
├─────────────────────────────────────────────────────────────┤
│                   GeotabApiFactory                           │
├────────────────────────┬────────────────────────────────────┤
│   ProductionAdapter    │          DevAuthShim               │
│   (window.api)         │    (import.meta.env credentials)   │
└────────────────────────┴────────────────────────────────────┘
```

### Security Requirements

> [!IMPORTANT]
> - Development credentials in `.env.local` only (gitignored)
> - Dev-only code must be tree-shaken from production build
> - Never log or expose session tokens

---

## 4. State Management Strategy

### Zustand Store Structure

```typescript
// src/store/fleetStore.ts

interface FleetStore {
  // Core data
  zones: Zone[];
  vehicles: VehicleData[];
  
  // UI state
  selectedZoneId: string | null;
  activeKpiFilter: KpiFilterType | null;
  expandedVehicleId: string | null;
  
  // Actions
  setSelectedZone: (zoneId: string) => void;
  toggleKpiFilter: (filter: KpiFilterType) => void;
  updateVehicleData: (data: VehicleData[]) => void;
}
```

### TanStack Query Configuration

```typescript
// src/lib/queryClient.ts

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s before refetch
      refetchInterval: 60_000,  // 60s background polling
      refetchIntervalInBackground: false, // Pause when tab hidden
    },
  },
});
```

---

## 5. Deployment & Configuration

### manifest.json

```json
{
  "name": "GeoYard Diagnostics",
  "items": [{
    "page": "GeoYardDiagnostics",
    "path": "Engine/",
    "menuName": { "en": "Yard Diagnostics" }
  }]
}
```

### Required Geotab Permissions

| Permission | Purpose |
|------------|---------|
| `DeviceList` | View vehicle data |
| `ZoneList` | View yard geofences |
| `StatusDataList` | Read diagnostic telemetry |
| `FaultDataList` | Read fault codes |
| `DeviceStatusInfo` | Calculate live dormancy/activity from current state |
| `DVIRDefectList` | Check unrepaired defects |

---

*Document Version: 1.1 | Last Updated: 2026-01-23 | Approved by: CTO*
