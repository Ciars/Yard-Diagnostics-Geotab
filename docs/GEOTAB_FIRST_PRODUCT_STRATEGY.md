# Geotab-First Product Strategy (Circet)

Last updated: 2026-02-08
Input basis: proxy operations discovery + external packs on EV adoption, standby optimization, and vendor dwell reduction.

## 1) Strategy Constraints

- Primary system-of-record available for product data: Geotab API.
- Shop is operationally critical but not API-integrated; design must work without direct Shop integration.
- Therefore, product logic should combine:
  - Geotab live signals as primary automation backbone.
  - Lightweight manual or CSV ingestion for non-Geotab fields (e.g., approval status, vendor ETA notes, new-hire demand plans).

## 2) North-Star Outcome

Increase dispatch reliability and reduce idle lease waste at the same time by controlling:
- readiness risk (what can go out now),
- long-tail repair dwell (what is stuck and why),
- standby calibration (how many vehicles to hold),
- EV assignment fit (who can realistically operate EVs).

## 3) Suggested Upgrades To Current Product

### Upgrade A: Dwell Control Tower (highest priority)

What it does:
- Tracks each offsite repair as a timed case.
- Shows stage aging and SLA breach risk.
- Enforces escalation ladder with named owner per case.
- Supports re-route decisions to alternate vendors.

Primary Geotab API usage:
- `Zone` + geofence events (vendor arrival/departure inference).
- `Device`, `Trip` (asset movement and return-to-service confirmation).
- `FaultData`, `DVIRLog`, `ExceptionEvent` (trigger context and severity).

Non-Geotab inputs (manual/CSV):
- vendor job reference,
- estimate received timestamp,
- approval timestamp,
- parts ETA,
- blocker reason code.

Why now:
- Strongest evidence-backed lever to reduce long-tail downtime and standby inflation.

Core KPIs:
- % cases > 5 / 14 / 30 days,
- % cases with unknown ETA,
- median and P90 dwell by vendor,
- response-to-query latency,
- replacement-hire cost linked to dwell.

### Upgrade B: Standby Buffer Optimizer (RAG + trigger rules)

What it does:
- Maintains a per-depot, per-vehicle-class standby target.
- Uses Red/Amber/Green penetration and weekly triggers to increase/decrease standby.
- Separates temporary surge actions from base-fleet resizing actions.

Primary Geotab API usage:
- `Device` availability and last-communication freshness,
- `Trip` and movement history to detect hoarded/unused standby,
- `Zone` occupancy for depot-level ready counts.

Non-Geotab inputs (manual/CSV):
- denied dispatch count,
- planned new starters,
- committed contract ramp signals.

Why now:
- Directly addresses Transport Manager’s weekly stressor (too much vs too little standby).

Core KPIs:
- red-zone frequency,
- missed dispatches due to no vehicle,
- standby utilization,
- spot-hire spend,
- idle standby lease cost.

### Upgrade C: 30-Second Dispatch Readiness Lens

What it does:
- Single page for first-wave dispatch decisions.
- Makes blockers explicit (roadworthy, telematics online, camera state, open defect, vendor dwell risk).

Primary Geotab API usage:
- `Device` heartbeat and connectivity,
- `FaultData`, `DVIRLog`,
- camera-health proxy from telemetry exceptions (where available),
- `Zone` for yard/depot context.

Non-Geotab inputs (manual/CSV):
- “dispatchable” gate overrides and notes.

Why now:
- Preserves current strengths while reducing surprise failures in first dispatch window.

Core KPIs:
- time-to-first-dispatch decision,
- same-day redispatch/reassignment events,
- false-ready rate.

### Upgrade D: EV Assignment Feasibility Panel

What it does:
- Scores whether EV assignment is feasible per driver-role profile.
- Flags cases that should default to diesel or managed public charging fallback.

Primary Geotab API usage:
- duty-cycle patterns via `Trip` history (distance/time on road),
- EV battery/charge telemetry (if vehicle/device supports it),
- route repetition patterns.

Optional public APIs:
- Open Charge Map API (public charging availability context),
- weather API (range risk modifier; e.g., Open-Meteo or Met Office),
- optional routing/travel-time APIs for duty realism.

Why now:
- Acceptance and utilization are currently the electrification bottleneck.

Core KPIs:
- EV acceptance rate,
- EV idle days,
- forced reassignment loop count,
- public-charging cost share.

## 4) Net-New Product Ideas (Geotab-First)

### Product 1: Vendor Uptime Network

What it is:
- Multi-fleet vendor performance intelligence product for leased fleets.
- Benchmarks dwell and ETA reliability across vendors/sites.

Geotab-first core:
- standardized vendor geofence timelines from `Zone` + `Trip`,
- fault/defect context from `FaultData`/`DVIRLog`.

Add-on data:
- customer-supplied stage updates (CSV/API),
- contract/SLA metadata.

Business value:
- Better routing decisions,
- commercial leverage in vendor negotiations,
- productized benchmarking revenue.

### Product 2: Fleet Availability Control Tower (cross-operator SaaS)

What it is:
- Integrated readiness + dwell + standby decision engine for high-volatility field fleets.

Geotab-first core:
- real-time asset state, movement, exception, and zone context.

Optional public APIs:
- weather risk,
- traffic/travel-time stress signals.

Business value:
- Reduces missed service and idle fleet simultaneously,
- deployable without deep ERP integration.

### Product 3: EV Deployment Assurance

What it is:
- EV rollout management product focused on assignment-fit, charging practicality, and operating economics.

Geotab-first core:
- trip and energy telemetry for suitability and utilization tracking.

Optional public APIs:
- charging network APIs,
- tariff/energy-price sources where available.

Business value:
- Converts EV strategy pressure into measurable operational decisions,
- reduces expensive public-charging overuse and idle EV inventory.

### Product 4: Compliance Evidence Studio

What it is:
- Compliance-facing evidence workspace built from Geotab defect and inspection signals plus exception chronology.

Geotab-first core:
- DVIR and defect timeline,
- vehicle state history and closure evidence.

Add-on inputs:
- manual sign-off and vendor documentation uploads.

Business value:
- Lower audit-prep burden,
- faster compliance assurance and clearer accountability.

## 5) Recommended Sequence (Now / Next / Later)

Now (0-90 days):
- Dwell Control Tower MVP.
- Standby Buffer Optimizer MVP.
- Dispatch Readiness Lens refresh.

Next (3-6 months):
- EV Assignment Feasibility Panel.
- Vendor scorecard + performance-based routing.

Later (6-12 months):
- Externalized Vendor Uptime Network.
- Fleet Availability Control Tower as standalone product line.

## 6) MVP Data Model To Start Immediately

Required daily fields:
- vehicle ID,
- depot/zone,
- off-road start,
- vendor arrival/departure (from geofence),
- diagnostic slot timestamp,
- estimate timestamp,
- approval timestamp,
- parts ETA,
- repair complete,
- return-to-service,
- blocker code,
- dispatch denial count,
- standby count at fixed cut-off time.

If these fields are captured reliably, product decisions can be automated even without Shop API integration.
