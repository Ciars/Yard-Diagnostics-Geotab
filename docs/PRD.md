# Product Requirements Document (PRD)
# GeoYard Diagnostics

**Version**: 2.0  
**Last Updated**: 2026-02-05  
**Product Owner**: Ciaran Madigan  
**Target Deployment**: Geotab MyGeotab Add-In Platform  

---

## Executive Summary

**GeoYard Diagnostics** is a high-density fleet management command center purpose-built for Circet UK & Ireland's transport operations. It provides a "single pane of glass" into yard-level vehicle health, location, and operational readiness, enabling transport administrators to make informed dispatch decisions without physical inspections.

### Key Value Proposition

> *"Know which vehicles are road-ready before you dispatch them."*

The application bridges the gap between **telematics health data** (from Geotab) and **physical location** (geofenced yards), surfacing actionable intelligence about vehicle exceptions (faults, dead batteries, DVIR defects, dormancy) in real-time.

---

## 1. Product Vision & Mission

### Vision Statement
To become the definitive yard management tool for Geotab fleet operators managing 1,000+ vehicles across distributed depot networks, ensuring every asset is "Road Ready" without manual inspection overhead.

### Mission
Deliver a native-feeling Geotab experience that scales to 10,000+ vehicles while maintaining sub-2-second interactions through intelligent zone-first filtering and batched API calls.

### Problem Statement

**Current Pain Points:**
1. **Geotab's native map view** shows all 10,000 vehicles simultaneously → performance degrades, cognitive overload
2. **No yard-centric filtering** → Admins must manually scan lists to find "Vehicles in Ashford Depot"
3. **Scattered health information** → Fault codes, battery voltage, DVIR defects live in separate tabs
4. **No proactive alerts** → Admins discover dead batteries or critical faults only when drivers report them
5. **Limited dormancy insights** → No easy way to identify underutilized assets consuming parking space

### Solution Overview

GeoYard Diagnostics solves these problems by:
- **Zone-first architecture**: Filter 10,000 vehicles → 50-150 per yard instantly
- **Health KPI dashboard**: Critical/Silent/Dormant/Charging/Service KPIs at-a-glance
- **Expandable diagnostics**: Deep-dive into any vehicle's health with one click
- **Geofence visualization**: See exactly where vehicles are within yard boundaries
- **Real-time updates**: 60-second polling ensures data freshness

---

## 2. Target Users & Personas

### Primary Persona: Transport Administrator (Tactical)

**Background:**
- Manages daily operations for a regional depot (50-200 vehicles)
- Responsible for dispatch assignments and vehicle readiness
- Non-technical, prefers simple interfaces

**Goals:**
- Quickly identify which vehicles have **critical faults** or **low batteries** before dispatch
- Review **open DVIR defects** to avoid sending unsafe vehicles to job sites
- Monitor **dormant vehicles** occupying valuable depot space
- Track **charging status** for EV fleet readiness

**Pain Points:**
- Wasting time manually checking 15+ individual vehicle pages in MyGeotab
- Discovering vehicle issues *after* dispatch (driver calls back)
- No visibility into "which EVs will be charged by 6am tomorrow"

**Key User Story:**
> *"As a Transport Admin, I want to see all vehicles in my Ashford yard with critical faults so I can dispatch mechanics before morning rush."*

---

### Secondary Persona: Transport Manager (Strategic)

**Background:**
- Oversees 5-10 depots across UK & Ireland
- Responsible for asset utilization, maintenance budgets, fleet planning
- Data-driven decision maker

**Goals:**
- Identify **dormant assets** for redeployment or disposal
- Track **fleet-wide charging patterns** for EV charging infrastructure planning
- Monitor **service due trends** to optimize preventative maintenance schedules
- Benchmark **yard efficiency** (average duration in yard, turnover rate)

**Pain Points:**
- Lack of aggregated KPIs across multiple depots
- No historical dormancy reports to justify asset disposal
- Reactive maintenance instead of predictive scheduling

**Key User Story:**
> *"As a Transport Manager, I want to see which 20% of vehicles consume 80% of maintenance costs so I can plan replacements strategically."*

---

## 3. Core Features & Functionality

### 3.1 Zone-Based Filtering (Primary Navigation)

**Description:**  
Sidebar navigation lists all Geotab zones (geofenced depots/yards), each showing live vehicle count badges.

**Behavior:**
- **Search**: Real-time filter of zone list by name
- **Selection**: Click zone → filter entire app to show only vehicles in that zone
- **Auto-zoom**: Map automatically fits bounds to selected zone polygon
- **Persistence**: Selected zone preserved across sessions (localStorage)

**Data Source:**  
Geotab `Zone` API → Filter by `Zone.groups` containing "Depot" or "Yard"

**Performance Requirement:**  
Zone selection → vehicle list update in <500ms for 150 vehicles

---

### 3.2 KPI Dashboard (Health Metrics)

**Description:**  
5 interactive cards displaying exception counts for the selected zone.

#### KPI Cards:

| KPI | Definition | Color | Icon |
|-----|------------|-------|------|
| **Critical Health** | Vehicles with severe faults (red DTC codes) or battery <11.8V | Red | ⚠️ |
| **Silent Assets** | Vehicles not communicating with Geotab (>24hrs offline) | Gray | 📡 |
| **Dormant** | Vehicles stationary >14 days | Amber | 🔍 |
| **Charging** | EVs currently charging (HV Battery Current < 0) | Teal | ⚡ |
| **Service Due** | Vehicles <500 miles from scheduled service | Gray | 🔧 |

**Interactions:**
- **Click to filter**: Clicking "Critical Health" → table shows only critical vehicles
- **Active state**: Filtered KPI highlighted with darker border
- **Click again**: Deactivate filter, show all vehicles

**Calculation Logic:**
```typescript
// Critical Health
hasCriticalFaults: boolean = faults.some(f => f.controller?.name !== 'Telematics Device')
  || batteryVoltage < 11.8

// Silent Assets
isDeviceOffline: boolean = lastHeartbeat > 24 hours ago

// Dormant
isDormant: boolean = timeSinceLastTrip > 14 days

// Charging
isCharging: boolean = diagnosticId('HV_BATTERY_CURRENT') < 0

// Service Due (placeholder - future enhancement)
isServiceDue: boolean = odometer > (lastServiceOdometer + serviceInterval - 500)
```

---

### 3.3 Interactive Zone Map (Leaflet.js)

**Description:**  
Displays geofenced zone boundaries and vehicle markers with status color-coding.

**Map Layers:**
1. **OpenStreetMap Base Layer** (or Geotab's preferred tile server)
2. **Zone Polygon**: Blue outline of selected geofence boundary
3. **Vehicle Markers**: SVG circles with status colors

**Marker Color Logic:**
- 🔴 **Red**: Critical health (hasCriticalFaults || batteryVoltage < 11.8)
- 🟡 **Amber**: Dormant (>14 days stationary)
- ⚫ **Gray**: Silent (offline >24hrs)
- 🟢 **Green**: Healthy and active
- 🔵 **Blue**: Charging (EVs only)

**Interactions:**
- **Click marker**: Select vehicle → scroll to that row in table
- **Hover**: Show tooltip with vehicle name + primary status
- **Zoom/Pan**: Standard Leaflet controls

**Performance Optimization:**
- Enable **marker clustering** for zones with >100 vehicles
- Hide markers for vehicles outside selected zone (not rendered at all)

---

### 3.4 Asset Table (Master-Detail Pattern)

**Description:**  
Sortable, virtualized table of vehicles in the selected zone with expandable rows for deep diagnostics.

#### Collapsed Row (Summary View)

| Column | Content | Width | Sort |
|--------|---------|-------|------|
| **Asset** | Vehicle ID + Icon (🚛 Truck / 🚗 Car / ⚡ EV) | 200px | ✓ |
| **Battery** | Icon: 🔋 (Green >11.8V, Red <11.8V) | 60px | ✓ |
| **Service** | "Due in 450 mi" or "✓ OK" | 120px | ✓ |
| **DUR** (Duration in Zone) | "2h 15m" or "3d" or "Just Arrived" | 100px | ✓ |
| **Chevron** | ▼ Expand indicator | 40px | - |

**Sorting:**
- Default: Duration descending (longest in yard first)
- Click column header to toggle asc/desc
- Persist sort preference in localStorage

#### Expanded Row (Detail View)

**Layout:**  
**2-column grid** → Left: Asset Health | Right: Device Health

##### Left Column: Asset Health

**1. Immediate Actions Banner** (only if severe faults exist)
- Red gradient background
- "⚠️ Immediate Actions: X severe faults detected"
- Displays only for vehicles with `analysis.severeCount > 0`

**2. Risk of Breakdown Gauge**
- Visual gauge (0-100%)
- Color-coded: 0-20% Green, 20-40% Amber, >40% Red
- Calculation algorithm:
  ```
  risk = (severeCount × 15) 
       + (ongoingCount × 5)
       + ((100 - ESR) ÷ 2)
       + (defLevel < 20% ? 10 : 0)
       + (coolantTemp > 95°C ? 15 : 0)
  Max: 100%
  ```

**3. Fault Analysis (3-Bucket Classification)**

Displays faults categorized into:
- **Ongoing**: Active faults with no end time
- **Severe**: Critical engine/transmission DTCs (controller ≠ "Telematics Device")
- **Historical**: Resolved faults (have end time)

Each fault shows:
- Timestamp
- Fault code (e.g., "SPN 641 FMI 2")
- Human-readable description
- Severity badge (Critical/Medium/Low)

**4. Diagnostics Grid** (6 tiles)

| Metric | Source | Display | Color Logic |
|--------|--------|---------|-------------|
| **Odometer** | `DiagnosticOdometerId` | "125,432 km" | White |
| **Electrical System Rating** | Calculated from battery voltage (last 20 readings) | "87%" | Green >80%, Amber 50-80%, Red <50% |
| **Engine Hours** | `DiagnosticEngineHoursId` | "2,345.6 h" | White |
| **DEF Level** | `DiagnosticDefFluidLevelId` | "45%" | Green >30%, Amber 15-30%, Red <15% |
| **Coolant Temp** | `DiagnosticEngineCoolantTemperatureId` | "82°C" | Green <90°C, Amber 90-95°C, Red >95°C |
| **Battery Voltage** | `DiagnosticInternalDeviceVoltageId` | "12.4 V" | Green >11.8V, Red ≤11.8V |

**Notes:**
- EV vehicles display "N/A" for Engine Hours and DEF Level
- If no diagnostic data exists, display "N/A" gracefully

##### Right Column: Device Health

**1. Device Status Card**
- Device type badge: "GO9" or "GO9+"
- Online status pill: "● Active" (green) or "Offline" (gray)
- Last heartbeat timestamp
- Serial number

**2. Camera Status Card** (conditional - only if camera detected)
- Camera type (Surfsight, Lytx, Generic)
- Health indicator: Good / Warning / Critical / Offline
- Last camera heartbeat

**3. DVIR Defects** (conditional - only if defects exist)
- List of open defects from Driver Vehicle Inspection Reports
- Each defect shows:
  - Defect name
  - Comment (if any)
  - Date reported
  - Driver name
  - Repair status

---

### 3.5 Real-Time Data Updates

**Polling Strategy:**
- **Interval**: 60 seconds (TanStack Query `refetchInterval`)
- **Pause when hidden**: Stop polling if tab/window loses focus
- **Optimistic updates**: Keep existing data while refetching (stale-while-revalidate)

**Data Refresh Flow:**
```
Every 60 seconds:
  1. Fetch updated StatusData for all vehicles in selected zone
  2. Recalculate KPI counts
  3. Update table rows in place (no full re-render)
  4. If user has row expanded → preserve expanded state
```

**Background Update Behavior:**
- **Silent update**: If no row expanded, data updates without user notification
- **Notification toast**: If row expanded, show "New updates available" toast (user must click to refresh)

---

## 4. Technical Architecture

### 4.1 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Framework** | React | 19.0 | UI components, hooks |
| **Build Tool** | Vite | 6.0 | Dev server, production bundling |
| **Language** | TypeScript | 5.6 | Type safety, IDE support |
| **State Management** | Zustand | 5.0 | Global state (selectedZone, KPI filter) |
| **Data Fetching** | TanStack Query | 5.90 | API caching, background refetch |
| **UI Components** | Geotab Zenith | 3.4 | Atoms, Molecules (buttons, inputs, cards) |
| **Map Engine** | Leaflet.js | 1.9 | Geospatial rendering |
| **Virtualization** | react-window | 2.2 | Table performance (1000+ rows) |
| **Testing** | Vitest | 4.0 | Unit/integration tests |
| **Hosting** | Cloudflare Pages | - | Static CDN deployment |

---

### 4.2 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Browser (MyGeotab)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │          GeoYard Diagnostics (React SPA)               │    │
│  ├────────────────────────────────────────────────────────┤    │
│  │  Sidebar │ KPI Tiles │ Map │ Asset Table               │    │
│  └─────┬────────────────────────────────────────────┬─────┘    │
│        │                                             │          │
│  ┌─────▼─────────────────────────────────────────────▼─────┐   │
│  │     Zustand Store (selectedZone, vehicles, KPIs)        │   │
│  └─────┬───────────────────────────────────────────────────┘   │
│        │                                                        │
│  ┌─────▼──────────────────────────────────────────────────┐   │
│  │        TanStack Query (Cache, Background Polling)       │   │
│  └─────┬──────────────────────────────────────────────────┘   │
│        │                                                        │
│  ┌─────▼──────────────────────────────────────────────────┐   │
│  │            GeotabApiFactory (Dual-Mode Bridge)          │   │
│  ├────────────────────────┬────────────────────────────────┤   │
│  │  ProductionAdapter     │     DevAuthShim (.env.local)   │   │
│  │  (window.geotab.api)   │     (Credentials from env)     │   │
│  └────────────────────────┴────────────────────────────────┘   │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Geotab MyGeotab   │
                    │   REST API Server   │
                    └─────────────────────┘
```

---

### 4.3 Data Flow

#### Initial Load Sequence

```
1. User clicks "Yard Diagnostics" in MyGeotab sidebar
   └─> geotab.focus() lifecycle hook fires

2. GeotabApiFactory.getInstance()
   └─> Detect environment: Production (window.geotab.addin) or Dev (.env.local)
   └─> Return IGeotabApi instance

3. TanStack Query: Fetch zones
   └─> GET api.call('Zone', { search: { groups: ['Depot'] } })
   └─> Store in Zustand: useFleetStore.setZones(zones)

4. User clicks "Ashford Depot"
   └─> Zustand: setSelectedZone('zone123')
   └─> TanStack Query: Fetch vehicles for zone123
       ├─> GET DeviceList + DeviceStatusInfo
       ├─> Batch GET StatusData (fuel, battery, SOC, odometer)
       ├─> Batch GET FaultData (last 30 days)
       └─> Calculate KPI metrics (critical, silent, dormant, charging)

5. Render UI
   └─> KPI Tiles: Display counts
   └─> Map: Draw zone polygon + vehicle markers
   └─> Table: Render rows (virtualized if >50 vehicles)
```

#### Expanded Row Deep Dive

```
1. User clicks chevron on vehicle row
   └─> Component: AssetHealthDashboard mounts
   └─> Hook: useAssetHealth(vehicle) fires

2. useAssetHealth internals
   └─> Call FleetDataService.getAssetHealthDetails(deviceId)
       ├─> GET FaultData (12-month window, limit 5000)
       ├─> GET ExceptionEvents (12-month window)
       ├─> GET StatusData (7-day window for 9 diagnostic IDs)
       │   - Battery Voltage (last 20 readings for ESR calc)
       │   - Odometer
       │   - Engine Hours
       │   - DEF Level
       │   - Coolant Temp
       │   - Engine Speed
       │   - Camera diagnostics
       └─> Calculate extendedDiagnostics
           - ESR = f(battery voltage avg over last 20 readings)
           - Latest odometer = max(StatusData timestamps)

3. Render expanded view
   ├─> Immediate Actions banner (if severeCount > 0)
   ├─> Risk of Breakdown gauge
   ├─> 3-bucket fault classification
   ├─> Diagnostics grid (6 tiles)
   └─> Device health cards
```

---

### 4.4 Key Services & Utilities

#### FleetDataService

**Responsibilities:**
- Fetch and enrich vehicle data with diagnostics, faults, drivers
- Calculate dormancy (days since last trip)
- Calculate zone duration (time vehicle has been in current zone)
- Batch API calls for performance (vehicle-scoped micro-batching)

**Key Methods:**
```typescript
class FleetDataService {
  async getVehiclesInZone(zoneId: string): Promise<VehicleData[]>
  async getAssetHealthDetails(deviceId: string): Promise<{
    faults: FaultData[]
    exceptions: ExceptionEvent[]
    statusData: StatusData[]
    extendedDiagnostics: ExtendedDiagnostics
  }>
  async enrichVehicleData(vehicles: VehicleData[]): Promise<VehicleData[]>
  
  // Private helpers
  private calculateESR(statusData: StatusData[]): number
  private getLatestDiagnosticValue(data: StatusData[], id: string): number
}
```

#### FaultService

**Responsibilities:**
- Classify faults into Ongoing / Severe / Historical buckets
- Match FaultData with ExceptionEvents for correlation
- Determine active vs resolved status

**Classification Algorithm:**
```typescript
function classifyFaults(faults: FaultData[], exceptions: ExceptionEvent[]) {
  const ongoing = faults.filter(f => !f.dateTime || !f.endTime)
  const severe = ongoing.filter(f => 
    f.controller?.name !== 'Telematics Device' // Mechanical faults
  )
  const historical = faults.filter(f => f.endTime !== undefined)
  
  return { ongoing, severe, historical, ongoingCount, severeCount }
}
```

#### HealthService

**Responsibilities:**
- Calculate battery health indicators
- Analyze camera diagnostic status
- Format health metrics for display

---

### 4.5 Data Model (TypeScript Interfaces)

#### Core Entities

```typescript
// Geotab Native Types (from API)
interface Device {
  id: string
  name: string // "IE-F-026"
  deviceType: string // "GO9+"
  serialNumber: string
  vehicleIdentificationNumber?: string
}

interface DeviceStatusInfo {
  device: { id: string }
  latitude: number
  longitude: number
  dateTime: string // ISO timestamp of last GPS ping
  speed: number
}

interface Zone {
  id: string
  name: string // "Ashford Depot"
  groups: Group[] // [{ id: 'GroupDepotId', name: 'Depot' }]
  points: GeoPoint[] // Polygon boundary coordinates
}

interface FaultData {
  id: string
  device: { id: string }
  diagnostic: { id: string, name: string } // SPN/FMI code
  failureMode: { id: string, name: string }
  controller: { id: string, name: string } // "Engine" vs "Telematics Device"
  dateTime: string // Fault start time
  endTime?: string // Fault cleared time (undefined = active)
}

interface StatusData {
  device: { id: string }
  diagnostic: { id: string, name: string }
  dateTime: string
  data: number // Numeric value (e.g., 12.3 for voltage)
}
```

#### Application-Specific Types

```typescript
interface VehicleData {
  device: Device
  status: DeviceStatusInfo
  driverName?: string
  makeModel?: string // "Ford Transit 350"
  batteryVoltage?: number
  fuelLevel?: number // 0-100%
  stateOfCharge?: number // 0-100% for EVs
  isCharging: boolean
  dormancyDays: number | null // null = never moved
  zoneEntryTime?: string
  zoneDurationMs: number | null
  isZoneEntryEstimate?: boolean
  hasCriticalFaults: boolean
  hasUnrepairedDefects: boolean
  
  health: {
    dvir: {
      defects: Array<{
        id: string
        defectName: string
        comment?: string
        date: string
        driverName: string
        isRepaired?: boolean
      }>
      isClean: boolean
    }
    faultAnalysis?: {
      items: ClassifiedFault[]
      ongoingCount: number
      severeCount: number
      historicalCount: number
    }
    issues: VehicleIssue[] // Unified list of telematics + mechanical issues
    hasRecurringIssues: boolean
    isDeviceOffline: boolean
    lastHeartbeat: string | undefined
  }
  
  activeFaults: FaultData[]
  lastTrip?: Trip
  extendedDiagnostics?: ExtendedDiagnostics
  cameraStatus?: {
    isOnline: boolean
    health?: 'good' | 'warning' | 'critical' | 'offline'
    lastHeartbeat?: string
    deviceId?: string
    name?: string
  }
}

interface ExtendedDiagnostics {
  odometer?: number // km
  engineHours?: number // hours
  defLevel?: number // 0-100%
  coolantTemp?: number // °C
  engineSpeed?: number // RPM
  electricalSystemRating?: number // 0-100% (calculated)
}
```

---

## 5. API Integration (Geotab MyGeotab SDK)

### 5.1 Authentication

**Production Mode** (Geotab Add-In):
```typescript
// Auto-injected by MyGeotab portal
const api: IGeotabApi = window.geotab.addin.api
```

**Development Mode** (.env.local):
```typescript
// Manual credentials for local dev server
VITE_GEOTAB_DATABASE=circet
VITE_GEOTAB_USERNAME=admin@example.com
VITE_GEOTAB_PASSWORD=***
```

**Security Requirements:**
- Never commit `.env.local` to Git (`.gitignored`)
- Tree-shake dev-only code from production builds
- Never log session tokens or credentials

---

### 5.2 Critical API Calls

#### 1. Get All Zones (Depots)

```typescript
const zones = await api.call<Zone[]>('Get', {
  typeName: 'Zone',
  search: {
    groups: [{ id: 'GroupDepotId' }] // Filter for depot zones
  }
})
```

#### 2. Get Vehicles in Zone

```typescript
// Step 1: Get all devices
const devices = await api.call<Device[]>('Get', {
  typeName: 'Device',
  search: { groups: [{ id: 'GroupCompanyId' }] }
})

// Step 2: Get latest status for all devices
const statuses = await api.call<DeviceStatusInfo[]>('Get', {
  typeName: 'DeviceStatusInfo'
})

// Step 3: Filter by zone geofence (client-side)
const vehiclesInZone = statuses.filter(status => 
  isPointInPolygon(status.latitude, status.longitude, zone.points)
)
```

#### 3. Get Diagnostic Data (Batched)

```typescript
// Fetch last 7 days of StatusData for multiple diagnostics
const diagnosticIds = [
  'DiagnosticInternalDeviceVoltageId',
  'DiagnosticFuelLevelId',
  'DiagnosticOdometerId',
  'DiagnosticEngineHoursId',
  'DiagnosticDefFluidLevelId',
  'DiagnosticEngineCoolantTemperatureId'
]

const calls = diagnosticIds.map(diagId => [
  'Get', {
    typeName: 'StatusData',
    search: {
      deviceSearch: { id: deviceId },
      diagnosticSearch: { id: diagId },
      fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    resultsLimit: 100
  }
])

const results = await api.multiCall(calls)
```

#### 4. Get Fault History

```typescript
const faults = await api.call<FaultData[]>('Get', {
  typeName: 'FaultData',
  search: {
    deviceSearch: { id: deviceId },
    fromDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  },
  resultsLimit: 5000
})
```

---

### 5.3 Performance Optimizations

**Problem:** Fetching data for 150 vehicles × 6 diagnostics = 900 API calls → slow

**Solution:** Vehicle-Scoped Micro-Batching
1. Group API calls by vehicle (not by diagnostic type)
2. Use `api.call` sequentially per vehicle (more stable than `multiCall` for large batches)
3. Process vehicles in chunks of 10 concurrent promises
4. Use `Promise.allSettled()` to handle partial failures gracefully

**Result:** 150-vehicle zone loads in 3-5 seconds

---

## 6. User Flows

### Flow 1: Morning Dispatch Readiness Check

```
1. Transport Admin logs into MyGeotab
2. Clicks "Yard Diagnostics" in sidebar
3. Selects "Ashford Depot" from zone list
   → KPIs update: 3 Critical, 1 Silent, 12 Dormant, 8 Charging, 2 Service Due
4. Clicks "Critical Health" KPI tile
   → Table filters to 3 vehicles with red health icons
5. Expands first vehicle row
   → Sees "Immediate Actions: 2 severe faults detected"
   → Reads fault: "SPN 110 FMI 18 - Engine Coolant Temperature High"
   → Notes battery voltage: 11.2V (critical)
6. Calls mechanic to inspect vehicle before dispatch
7. Repeats for remaining 2 critical vehicles
8. Deselects KPI filter, reviews dormant vehicles
   → Identifies van stationary 28 days → flags for disposal
```

---

### Flow 2: EV Fleet Charging Status

```
1. Transport Manager selects "Dublin Depot"
2. Clicks "Charging" KPI (8 vehicles)
   → Map shows 8 blue markers clustered near charging stations
3. Expands EV row
   → Diagnostics grid shows:
      - State of Charge: 67%
      - HV Battery Current: -15A (charging)
      - Battery Voltage: 385V
4. Mental calculation: 67% + 6 hours overnight = 95% by 6am
5. Marks vehicle as available for long-haul job next day
```

---

### Flow 3: Identifying Recurring Fault Patterns

```
1. Admin expands vehicle with amber warning icon
2. Sees "Fault Analysis: 5 ongoing, 2 severe, 47 historical"
3. Scrolls through "Historical" bucket
   → Notices "AdBlue Level Low" fault cleared and re-appeared 6 times in 30 days
4. Flags vehicle for diesel exhaust fluid system inspection
5. Creates maintenance work order in external system
```

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Initial Load Time** | <3s for 150 vehicles | Users expect instant readiness |
| **Zone Switch** | <1s for UI update | Maintains responsive feel |
| **Expanded Row Load** | <2s for deep health data | Acceptable for on-demand detail |
| **Background Polling** | 60s interval | Balance freshness vs API load |
| **Table Virtualization** | Support 1000+ rows | Handle entire fleet in one zone |

### 7.2 Scalability

- **Max Vehicles Per Zone**: 500 (typical depot: 50-200)
- **Max Total Vehicles**: 10,000 (Circet UK & Ireland fleet)
- **Concurrent Users**: 50 (all depot admins logged in)
- **API Rate Limiting**: Respect Geotab's 5 req/sec per session limit

### 7.3 Security

- **Zero Backend**: No external database, all data ephemeral
- **Authentication**: Geotab session only (no custom login)
- **Data Privacy**: No PII logged or stored in browser storage
- **HTTPS Only**: Enforce secure transport (Cloudflare always-SSL)

### 7.4 Accessibility

- **WCAG 2.1 AA Compliance**
- Keyboard navigation for all interactions
- ARIA labels on icon-only buttons
- Color never the only indicator (icons + color)
- Minimum contrast ratio 4.5:1

### 7.5 Browser Support

- Chrome 120+ (primary)
- Edge 120+
- Firefox 120+
- Safari 17+ (limited testing - Geotab primarily Chrome-based)

---

## 8. Future Roadmap

### Phase 2 (Q2 2026)

**Predictive Maintenance Alerts**
- ML model to predict battery failure 7 days in advance
- Integrate historical fault patterns → "This vehicle likely to fail inspection"

**Service Integration**
- Auto-create work orders in external CMMS (Fleet Maintenance System)
- Two-way sync: Mark repairs complete → clear DVIR defects

**Multi-Zone Comparison**
- Side-by-side KPI comparison for 2-3 depots
- Benchmark "Ashford vs Dublin" utilization rates

### Phase 3 (Q3 2026)

**Historical Reporting**
- Export dormancy trends to CSV/PDF
- "Vehicles stationary >30 days in last quarter" → disposal candidates

**Driver Assignment Tracking**
- Show which driver last operated vehicle
- "Vehicle IE-F-026 last driven by John Smith 3 days ago"

**Advanced Geofencing**
- Multi-polygon zones (e.g., "Ashford Main Yard + Overflow Lot")
- Auto-assign vehicles to closest depot based on GPS

---

## 9. Success Metrics

### Primary KPIs (6-Month Post-Launch)

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Daily Active Users** | 40+ (80% of depot admins) | TanStack Query logs |
| **Time to Identify Critical Vehicles** | <30 seconds (vs 10 minutes manual) | User survey |
| **Reduction in Dispatch Failures** | 50% fewer "vehicle not ready" incidents | Incident tracking |
| **Battery-Related Breakdowns** | 30% reduction | Geotab fault codes correlation |

### Secondary Metrics

- **Average Session Duration**: 5-10 minutes (indicates quick decision-making)
- **Zone Switches Per Session**: 2-4 (multi-depot managers cross-checking)
- **Expanded Rows Per Session**: 3-5 (balanced detail inspection)

---

## 10. Technical Constraints & Limitations

### Known Limitations

1. **No Offline Mode**: Requires active internet (Geotab API dependency)
2. **Data Latency**: Vehicle data ~60-90 seconds behind real-time (Geotab device heartbeat)
3. **No Historical Trends**: Only shows current snapshot (future enhancement)
4. **Zone Boundary Precision**: GPS accuracy ±10 meters (can cause edge-case misclassification)
5. **Camera Support**: Limited to Surfsight, Lytx, SmartWitness (Geotab-integrated cameras only)

### Hard Constraints

- **Geotab API Throttling**: Max 5 requests/second → must batch calls
- **Browser Memory**: Large fleets (>500 vehicles in one zone) may strain client RAM
- **Mobile Safari**: Limited testing/support (MyGeotab desktop-first)

---

## 11. Deployment & Operations

### Hosting

**Platform**: Cloudflare Pages (Static SPA)
- **Build Command**: `npm run build`
- **Output Directory**: `dist/`
- **CDN**: Global edge caching for <100ms load times

### Geotab Add-In Registration

**manifest.json**:
```json
{
  "name": "GeoYard Diagnostics",
  "version": "1.1.0",
  "items": [{
    "page": "GeoYardDiagnostics",
    "path": "Engine/",
    "menuName": { "en": "Yard Diagnostics" }
  }]
}
```

**Required Permissions**:
- `DeviceList` (read vehicles)
- `ZoneList` (read geofences)
- `StatusDataList` (read diagnostics)
- `FaultDataList` (read fault codes)
- `TripList` (calculate dormancy)
- `DVIRDefectList` (read inspection defects)

### Monitoring

- **Error Tracking**: Console errors logged to internal dashboard (future)
- **Performance**: TanStack Query devtools for API call inspection
- **Uptime**: Cloudflare Pages 99.9% SLA

---

## 12. Open Questions & Decisions Pending

1. **Service Due Logic**: Waiting for Circet's maintenance interval data structure
2. **Multi-Tenant Support**: Should different Geotab databases see different zone lists? (Depots vs Customers)
3. **Localization**: Currently English-only. Irish Gaelic needed?
4. **Maintenance History**: Should we fetch historical work orders from external system?

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **DTC** | Diagnostic Trouble Code (fault code from vehicle's ECU) |
| **DVIR** | Driver Vehicle Inspection Report (pre/post-trip checklist) |
| **ECU** | Engine Control Unit (vehicle computer) |
| **ESR** | Electrical System Rating (battery health score 0-100%) |
| **GO9** | Geotab GO9+ telematics device model |
| **KPI** | Key Performance Indicator (e.g., Critical Health count) |
| **MyGeotab** | Geotab's web portal for fleet management |
| **SPN/FMI** | Suspect Parameter Number / Failure Mode Indicator (DTC format) |
| **Telematics** | Remote vehicle monitoring via GPS + sensors |
| **Zone** | Geofenced geographic boundary (depot/yard) |

---

## Appendix B: API Response Examples

### Example: FaultData Response

```json
{
  "id": "aAbCdEfG",
  "device": { "id": "b123" },
  "diagnostic": {
    "id": "DiagnosticSuspectParameterNumber94FaultModIdentifier18Id",
    "name": "SPN 94 FMI 18"
  },
  "controller": {
    "id": "ControllerEngineController1Id",
    "name": "Engine"
  },
  "failureMode": {
    "id": "FailureModeDataValidButBelowNormalOperatingRangeModeratelySevereLevel",
    "name": "Data Valid But Below Normal Operating Range - Moderately Severe Level"
  },
  "dateTime": "2026-02-04T14:32:00.000Z",
  "endTime": null // Still active
}
```

### Example: ExtendedDiagnostics Calculation

```json
{
  "odometer": 125432.5, // km
  "engineHours": 2345.6, // hours
  "defLevel": 45, // %
  "coolantTemp": 82, // °C
  "engineSpeed": 0, // RPM (vehicle parked)
  "electricalSystemRating": 87 // Calculated from last 20 voltage readings (avg 12.6V)
}
```

---

**END OF DOCUMENT**

---

**Document Prepared By**: AI Assistant (Gemini)  
**For**: LLM Context Transfer  
**Date**: 2026-02-05  
**Total Pages**: 16  
**Word Count**: ~7,500
