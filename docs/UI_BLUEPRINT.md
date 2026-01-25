# GeoYard Diagnostics - UI/UX Blueprint

---

## 1. Visual Identity

### Design Framework
**Geotab Zenith Design System** - Strict adherence required.

### Color Palette

| Role | Color | Usage |
|------|-------|-------|
| Sidebar Background | `#1a2b49` (Navy) | Primary navigation |
| Main Stage | `#f5f7fa` (Light Gray) | Content area background |
| Circet Blue (Accent) | `#0066cc` | Selected states, CTAs |
| Success | Zenith Green | Healthy status, charging |
| Warning | Zenith Amber | Service due, low battery |
| Danger | Zenith Red | Critical faults, dormant |
| Muted | `#6b7280` (Slate) | Secondary text, inactive |

### Typography
- **Headers**: Zenith sans-serif, semi-bold
- **Body**: System font stack, regular weight
- **Data**: Tabular/monospace for numbers

---

## 2. Layout Structure

```
┌────────────────────────────────────────────────────────────────┐
│                        Header Bar                               │
├──────────────┬─────────────────────────────────────────────────┤
│              │              KPI Tiles (5 cards)                 │
│   Sidebar    ├─────────────────────────────────────────────────┤
│   (280px)    │                                                  │
│              │              Zone Map (Leaflet)                  │
│  - Search    │              min-height: 300px                   │
│  - Zone List │                                                  │
│              ├─────────────────────────────────────────────────┤
│              │                                                  │
│              │         Asset Table (Expandable Rows)            │
│              │         Sticky header, internal scroll           │
│              │                                                  │
└──────────────┴─────────────────────────────────────────────────┘
```

---

## 3. Component Architecture

### A. Sidebar Organism (`Sidebar.tsx`)

| Element | Behavior |
|---------|----------|
| **Search Input** | Top-docked, filters Zone list in real-time |
| **Zone List** | Scrollable, shows zone name + vehicle count badge |
| **Active State** | Selected zone highlighted with Circet Blue |
| **Collapse** | Toggleable on screens < 1024px |

### B. KPI Tiles Molecule (`KpiTiles.tsx`)

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│ ▌ Critical  │ ▌ Silent    │ ▌ Dormant   │ ▌ Charging  │ ▌ Service   │
│   Health    │   Assets    │             │             │   Due       │
│     12      │     3       │     28      │     45      │     7       │
│  Vehicles   │  Vehicles   │  > 14 days  │  Currently  │  < 500 mi   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
     (red)        (slate)       (amber)       (teal)        (gray)
```

**Styling**:
- White cards with 2px colored top border
- Large bold number, small uppercase label
- Clickable: toggles filter mode (pressed state)

### C. Zone Map Organism (`ZoneMap.tsx`)

| Feature | Implementation |
|---------|----------------|
| Engine | Leaflet.js |
| Markers | SVG circles with status colors |
| Clustering | Enable for zones with 50+ vehicles |
| Zones | Draw geofence polygon from `Zone.points` |
| Auto-zoom | `fitBounds()` on zone selection or filter change |
| Hidden | Vehicles outside selected zone not rendered |

### D. Asset Table Organism (`AssetTable.tsx`)

**Pattern**: Master-Detail (Expandable Rows)

| Column | Content | Width |
|--------|---------|-------|
| Asset | ID + vehicle type icon | 200px |
| Battery | Icon only (red < 11.8V, green otherwise) | 60px |
| Service | "Due in X mi/days" or "OK" | 120px |
| DUR | "Just Arrived" / "Xh" / "Xd" | 100px |
| Chevron | Expand/collapse indicator | 40px |

**Expanded Row (Detail Drawer)**:
- Active faults table: Timestamp, Code, Description
- Severity badges: Critical (red), Medium (amber), Low (green)

---

## 4. Interaction & Feedback

### Loading States
| Context | Pattern |
|---------|---------|
| Initial load | Skeleton loaders for KPI tiles and table |
| Background refresh | No visible loader; data updates silently |
| Zone change | Brief skeleton on table only |

> [!WARNING]
> Never use a full-screen blocking spinner.

### Empty States
- **No vehicles in zone**: Zenith empty illustration + "No vehicles currently in this yard"
- **No zones match search**: "No yards match your search"

### Background Polling Behavior
```
Polling every 60 seconds...

If data changed AND user has row expanded:
  → Show toast: "New Updates Available" (bottom-center)
  → Do NOT auto-refresh table
  → Wait for user to click toast

If data changed AND no row expanded:
  → Silently update table
```

---

## 5. Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| ≥ 1440px | Full layout, sidebar visible |
| 1024-1439px | Sidebar collapsible |
| < 1024px | Sidebar hidden by default, hamburger menu |
| Map | Minimum height 300px always |
| Table | Internal scroll, sticky header |

---

## 6. Accessibility

- All interactive elements keyboard navigable
- ARIA labels on icon-only buttons
- Color is never the only indicator (icons + color)
- Minimum contrast ratio 4.5:1

---

*Document Version: 1.1 | Last Updated: 2026-01-23 | Approved by: CTO*
