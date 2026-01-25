---
description: Guide for working with Geotab MyGeotab SDK API including authentication, common methods, and data patterns
---

# Geotab SDK Skill

## Overview

The Geotab SDK enables integration with MyGeotab telematics platform. This skill covers common API patterns for fleet management applications.

## Authentication

### Development Mode (Add-In)
```typescript
// In Geotab Add-In context, API is provided globally
const api = window.geotab?.api;
api.call('Get', { typeName: 'Device' }, callback, errorCallback);
```

### Direct Authentication
```typescript
const api = new GeotabApi({
    path: 'my.geotab.com',
    database: 'database_name',
    userName: 'user@example.com',
    password: 'password'
});
```

## Key Entities

| Entity | Description | Common Use |
|--------|-------------|------------|
| `Device` | Vehicle/asset with telematics device | Fleet inventory |
| `DeviceStatusInfo` | Real-time location and state | Live tracking |
| `Zone` | Geofence polygon | Yard monitoring |
| `Trip` | Start/stop movement record | Dormancy, zone entry |
| `StatusData` | Diagnostic readings | Fuel, SOC, voltage |
| `FaultData` | Engine fault codes | Health alerts |
| `MaintenanceReminder` | Scheduled service | Service due |

## Common API Patterns

### Batch Queries with MultiCall
```typescript
const calls = [
    { method: 'Get', params: { typeName: 'Device' }},
    { method: 'Get', params: { typeName: 'Zone' }}
];
const [devices, zones] = await api.multiCall(calls);
```

### Get Vehicle Make/Model from VIN
```typescript
// VIN is in device.vehicleIdentificationNumber
const vins = devices.map(d => d.vehicleIdentificationNumber).filter(Boolean);
const decoded = await api.call('DecodeVins', { vins });
// Returns: [{ vin, make, model, year, ... }]
```

### Get Diagnostic Data
```typescript
// Common diagnostic IDs
const DiagnosticIds = {
    FUEL_LEVEL: 'DiagnosticFuelLevelId',
    STATE_OF_CHARGE: 'DiagnosticStateOfChargeId',
    BATTERY_VOLTAGE: 'DiagnosticInternalDeviceVoltageId',
    CHARGING_STATE: 'DiagnosticChargingStateId',
    ODOMETER: 'DiagnosticOdometerId'
};

await api.call('Get', {
    typeName: 'StatusData',
    search: {
        deviceSearch: { id: deviceId },
        diagnosticSearch: { id: DiagnosticIds.FUEL_LEVEL },
        fromDate: oneDayAgo
    },
    resultsLimit: 1
});
```

### Point-in-Polygon for Zone Detection
```typescript
// Zone.points is array of { x: longitude, y: latitude }
function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}
```

## Add-In Lifecycle (For Embedded Apps)

```typescript
// Geotab Add-In entry point
geotab.addin.myAddin = function(api, state) {
    return {
        initialize: function(freshApi, state, callback) {
            // Called when Add-In loads
            callback();
        },
        focus: function(api, state) {
            // Called when user navigates to Add-In
        },
        blur: function(api, state) {
            // Called when user navigates away
        }
    };
};
```

## Rate Limits & Best Practices

1. **Use MultiCall** - Batch requests to reduce API calls
2. **Cache static data** - Zones, Devices don't change frequently
3. **Limit results** - Use `resultsLimit` to avoid large responses
4. **Use fromDate/toDate** - Always scope time-series queries
5. **Poll sparingly** - 60-second intervals for dashboard updates

## Resources

- [API Reference](https://developers.geotab.com/)
- [SDK Examples](https://github.com/Geotab/sdk/tree/master/src/software/js-samples)
