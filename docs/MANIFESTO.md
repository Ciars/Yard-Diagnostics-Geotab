# GeoYard Diagnostics - Project Manifesto

> **Mission**: A high-density asset management command center for Circet UK & Ireland, providing Transport teams with a "single pane of glass" into yard-level operations.

---

## 1. Vision Statement

GeoYard Diagnostics bridges the gap between physical location and telematics health, ensuring every asset is **"Road Ready"** without requiring a physical inspection. It is purpose-built for the Geotab ecosystem and designed to scale to 10,000+ vehicles.

---

## 2. Key Personas

### The Transport Admin (Tactical)
> "Which vehicles in **this yard** have critical faults, dead batteries, or open DVIR defects so I can dispatch mechanics immediately?"

### The Transport Manager (Strategic)
> "What is our overall asset utilization? Which vehicles are **Dormant**? How is our EV fleet charging status?"

---

## 3. Core Product Principles

| Principle | Description |
|-----------|-------------|
| **Native Integration** | Must feel like a core part of MyGeotab, not an external tool |
| **Stateless Architecture** | No external databases. All data remains within Geotab |
| **Actionable Intelligence** | Highlight "Exceptions" (vehicles needing attention), not just dots on a map |
| **Performance at Scale** | Performant for 10,000 vehicles using zone-first filtering and batched multicall |

---

## 4. Hard Constraints (Guardrails)

> [!CAUTION]
> These constraints are non-negotiable.

- **Zero Backend**: All logic runs client-side using the Geotab API
- **Security**: Authentication via active Geotab session only. No PII/credentials in source code or localStorage
- **Design Language**: Strict adherence to **Geotab Zenith Design System**
- **Data Accuracy**: Calculations reflect latest telematics data, typically within 60-90 seconds of device heartbeat

---

## 5. Definition of Done

A feature is **"Done"** when it is:

- [ ] Typed correctly in TypeScript (strict mode)
- [ ] Verified in both Development Shim and Production Portal
- [ ] Responsive on standard monitors and large dashboard displays
- [ ] Styled with Zenith-compliant components
- [ ] Tested with realistic data volumes (100+ vehicles per zone)

---

*Document Version: 1.1 | Last Updated: 2026-01-23 | Approved by: CTO*
