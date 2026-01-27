---
name: Geotab Data Model (Advanced)
description: Expert guide on Geotab's data model, focusing on Faults vs. Exceptions, Active States, and proper querying for fleet health dashboards.
---

# Geotab Data Model & Query Guide

This skill encapsulates advanced knowledge related to Geotab's data architecture, specifically derived from the "API Adapter DM2" solution guide but applicable to general SDK usage.

## Core Concept: Faults vs. Exceptions

A common mistake is confusing `FaultData` (Raw Diagnostic Trouble Codes) with `ExceptionEvents` (Rule Violations).

### 1. ExceptionEvents (`ExceptionEvent`)
**What it is**: Represents a vehicle violating a Rule. This is **Stateful**.
*   **Key Fields**:
    *   `activeFrom`: When the issue started.
    *   `activeTo`: When the issue ended (NULL = Still Active).
    *   `rule`: The rule that was broken (e.g., "Idling", "General Engine Fault").
    *   `device`: The asset.
*   **Use Case**: "Show me all vehicles that currently have a problem."
*   **Querying for Active Issues**:
    ```javascript
    api.call('Get', {
        typeName: 'ExceptionEvent',
        search: {
            fromDate: '2024-01-01T00:00:00.000Z', // Context window
            activeFrom: '2024-01-01T00:00:00.000Z', // Look for events active since...
            // To find currently active: Filter client-side for activeTo === 'MaxDate' or null
            // OR use inclusion logic (activeFrom < now AND activeTo > now)
        }
    });
    ```
    *Note: The API often returns "MaxDate" (2050-12-31) instead of NULL for ongoing events.*
*   **Critical "Engine Fault" Rule**: Geotab has a built-in rule (often `RuleEngineFaultId`) that triggers when *any* serious DTC is detected. Querying this Rule's exceptions is often more reliable for "Asset Health" than querying raw faults.

### 2. FaultData (`FaultData`)
**What it is**: A raw data point recording a Diagnostic Status or Error Code from a Controller (ECU).
*   **Key Fields**:
    *   `dateTime`: Timestamp of the log.
    *   `diagnostic`: The type of fault (DTC).
    *   `controller`: Source (e.g., Engine, Transmission).
    *   `failureMode`: specific failure code.
*   **Nature**: Point-in-time. Most Faults are "Events".
*   **Querying**:
    ```javascript
    api.call('Get', {
        typeName: 'FaultData',
        search: {
            fromDate: '...',
            deviceSearch: { id: '...' }
        }
    });
    ```

## Dashboard Implementation Strategy

To replicate Geotab's native "Asset Health" view properly:

1.  **Fetch `ExceptionEvents`** (The "Red Flags"):
    *   Query `ExceptionEvent` for specific Health Rules (e.g., Engine Fault, Battery Drain).
    *   Any event where `activeTo > Now` (or MaxDate) is an **ACTIVE ALERT**.

2.  **Fetch `FaultData`** (The "Details"):
    *   Use this to populate the specific list of codes (P0123, etc.) shown in the details pane.
    *   Correlate: An Active Exception often "wraps" a series of FaultData logs.

3.  **Entity Mapping** (DM2 Style):
    *   `FaultData` joins `Diagnostic` -> Human Readable Name.
    *   `ExceptionEvent` joins `Rule` -> Human Readable Name.

## Common Pitfalls
*   **Zero Faults Returned**: Querying `FaultData` with a short window (e.g., 24h) returns nothing if the fault occurred 3 days ago and is still active. The *Fault Log* happens at start. The *Exception State* persists.
    *   **Fix**: Query `ExceptionEvent` to see the *State*.
