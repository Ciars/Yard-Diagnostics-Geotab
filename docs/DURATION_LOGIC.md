# Logic Explanation: Zone Duration & Time Calculations

## How Zone Duration is Calculated

The "Zone Duration" (Dwell Time) tracks how long a vehicle has been inside a specific zone.

### 1. Determining `zoneEntryTime`
The system identifies when a vehicle arrived in a zone using a priority hierarchy:

1.  **Polygon Match (High Confidence):**
    *   The system scans the vehicle's recent trips.
    *   It checks if a specific `trip.stopPoint` falls strictly *inside* the zone's polygon boundary.
    *   If found, that trip's `stop` time is used.

2.  **Last Trip Fallback (Medium Confidence):**
    *   If the vehicle is currently in the zone (according to Geotab) but no specific trip stop matches the polygon (e.g., GPS drift), the system defaults to the *most recent* trip's stop time.

3.  **Heartbeat Fallback (Low Confidence):**
    *   If no trip data is available, the system uses the device's last communication timestamp (`DeviceStatusInfo.dateTime`).

### 2. Computing the Duration
Once `zoneEntryTime` is established, the duration is calculated as:

```
Duration = current_system_time - zoneEntryTime
```

### 3. The "Negative Duration" Issue
**Problem:**
Occasionally, the `zoneEntryTime` returned by the server/device is slightly in the *future* relative to the client's system clock. This occurs due to:
*   **Clock Skew:** The user's computer clock lagging behind the Geotab server.
*   **Future-dated Logs:** Devices reporting timestamps slightly ahead of reality.

This resulted in negative values (e.g., `-5 minutes`), which appeared as negative numbers in Excel exports and caused sorting anomalies in the Asset Table.

### 4. The Solution (Clamping)
We have implemented a **Clamping Mechanism** in the calculation logic.

**New Formula:**
```javascript
Duration = Math.max(0, current_time - entry_time)
```

**Effect:**
*   If `entry_time` is in the past: The real duration is shown.
*   If `entry_time` is in the future: The duration is clamped to `0`.
*   **Display:** The UI shows "Just Now" (or "0h" in exports) instead of confusing negative numbers.
*   **Sorting:** These vehicles are correctly sorted as the most recent arrivals.
