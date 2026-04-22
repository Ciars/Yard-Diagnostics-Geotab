# GeoYard Diagnostics - Data & Logic Dictionary

---

## 1. Primary Geotab Entities

| Entity | Purpose | Key Properties |
|--------|---------|----------------|
| **Device** | Hardware asset | `id`, `serialNumber`, `name`, `vehicleIdentificationNumber` |
| **Zone** | Geofence/Yard | `id`, `name`, `zoneTypes`, `points` |
| **DeviceStatusInfo** | Real-time status | `device`, `currentZone`, `driver`, `speed`, `currentStateDuration`, `isDeviceCommunicating` |
| **StatusData** | Telemetry readings | `device`, `diagnostic`, `data`, `dateTime` |
| **FaultData** | Fault codes (DTCs) | `device`, `diagnostic`, `failureMode`, `dateTime` |
| **Trip** | Movement history | `device`, `start`, `stop`, `driver`, `distance` |
| **DVIRDefect** | DVIR inspection defects | `device`, `repairStatus`, `severity`, `dateTime` |
| **MaintenanceReminder** | Service schedules | `device`, `rule`, `dueDate`, `dueMileage` |

> [!NOTE]
> **Correction**: Use `DVIRDefect` (not `DutyStatusLog`) for DVIR defect tracking.
> `DutyStatusLog` is for ELD/Hours of Service compliance.

---

## 2. KPI Tile Logic (The "Big 5")

| # | Tile | Query Logic | Threshold |
|---|------|-------------|-----------|
| 1 | **Critical Health** | `FaultData` where `failureMode.severity = 'Critical'` AND `isActive = true` + `DVIRDefect` where `repairStatus != 'Repaired'` | Count of unique devices |
| 2 | **Silent Assets** | `DeviceStatusInfo.lastCommunicationTime` vs `now()` | > 24 hours |
| 3 | **Dormant** | Stationary `DeviceStatusInfo.currentStateDuration` plus elapsed time since `DeviceStatusInfo.dateTime`; moving vehicles with `speed >= 5` are active | >= 14 whole days |
| 4 | **Vehicles Charging** | `StatusData` for `DiagnosticChargingStateId` where `data > 0` | Count of unique devices |
| 5 | **Service Due** | `MaintenanceReminder.dueDate` or `dueMileage` approaching | < 500 miles or < 7 days |

---

## 3. Diagnostic ID Reference

| Diagnostic | Geotab ID | Alert Threshold |
|------------|-----------|-----------------|
| Battery Voltage | `DiagnosticInternalDeviceVoltageId` | < 11.8V (Critical) |
| Fuel Level | `DiagnosticFuelLevelId` | Percentage (0-100) |
| EV State of Charge | `DiagnosticStateOfChargeId` | Percentage (0-100) |
| EV Range | `DiagnosticElectricVehicleRangeId` | Miles remaining |
| Charging State | `DiagnosticChargingStateId` | `> 0` = Charging (binary simplification) |
| Odometer | `DiagnosticOdometerId` | For service interval calculation |

> [!IMPORTANT]
> **Charging State Simplification**: Geotab returns multiple values (0=Not Charging, 1=L1/L2, 2=DC Fast, 3=Complete).
> For this app, we simplify: `value > 0 = "Charging"`, `value = 0 = "Not Charging"`.

---

## 4. UI-Specific Data Logic

### Dormancy / "Just Arrived" Display
```typescript
if (deviceStatus.speed >= 5) return "Active";

const parsedDurationMs = parseCurrentStateDuration(deviceStatus.currentStateDuration);
const elapsedSinceStatusMs = differenceInMilliseconds(now, deviceStatus.dateTime);
const stationaryMs = parsedDurationMs === null
  ? elapsedSinceStatusMs
  : parsedDurationMs + elapsedSinceStatusMs;
const stationaryMinutes = Math.floor(stationaryMs / 60000);

if (stationaryMinutes < 5) return "Just Arrived";
if (stationaryMinutes < 60) return `${stationaryMinutes}m`;
if (stationaryMinutes < 1440) return `${Math.floor(stationaryMinutes / 60)}h`;
return `${Math.floor(stationaryMinutes / 1440)}d`;
```

### Last Known Driver
```typescript
// Driver is on DeviceStatusInfo, not Device
const driver = deviceStatusInfo.driver?.name;
if (!driver || driver === 'Unknown') {
  // Fallback: query last Trip for this device
  const lastTrip = await api.call('Get', {
    typeName: 'Trip',
    search: { deviceId, toDate: now },
    resultsLimit: 1
  });
  return lastTrip[0]?.driver?.name ?? 'Unknown';
}
return driver;
```

### GPS Drift Filter

GPS drift filtering is not part of dormancy. Dormancy is based on `DeviceStatusInfo.currentStateDuration`, with `DeviceStatusInfo.dateTime` age only as a fallback when the duration is missing or invalid.

```typescript
// Ignore micro-movements when ignition OFF
const isValidMovement = (logRecord: LogRecord, prevRecord: LogRecord) => {
  if (!logRecord.ignitionOn) {
    const distance = calculateDistance(logRecord, prevRecord);
    return distance >= 10; // meters
  }
  return true;
};
```

---

## 5. Fetching Strategy (Zone-First Performance)

### Never fetch all 10,000 vehicles at once!

```typescript
// Step 1: Get devices in selected zone
const devicesInZone = await api.call('Get', {
  typeName: 'DeviceStatusInfo',
  search: { currentZoneSearch: { id: zoneId } }
}); // Returns ~50-200 devices

// Step 2: Batch fetch diagnostics for ONLY those devices
const deviceIds = devicesInZone.map(d => d.device.id);
const calls = deviceIds.flatMap(id => [
  { method: 'Get', params: { typeName: 'StatusData', search: { deviceId: id, fromDate: subDays(now, 1) }}},
  { method: 'Get', params: { typeName: 'FaultData', search: { deviceId: id, isActive: true }}},
]);

const results = await api.multiCall(calls);
```

### Polling Strategy

| Data Type | Refresh Interval | Cache Duration |
|-----------|------------------|----------------|
| Device (static props) | On focus only | Until blur |
| Zone list | On focus only | Until blur |
| DeviceStatusInfo | 60 seconds | 30 seconds stale |
| StatusData / FaultData | 60 seconds | 30 seconds stale |
| Dormancy (`DeviceStatusInfo.currentStateDuration`) | 60 seconds | 30 seconds stale |

---

*Document Version: 1.1 | Last Updated: 2026-01-23 | Approved by: CTO*
