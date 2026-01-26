/**
 * Zone Map Component
 * 
 * Leaflet map displaying zone polygon and vehicle markers.
 * Per UI_BLUEPRINT.md Section 2.C
 */

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Map as LeafletMap, LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Zone, VehicleData } from '@/types/geotab';
import './ZoneMap.css';

interface ZoneMapProps {
    zone: Zone | null;
    vehicles: VehicleData[];
    filteredVehicleIds?: string[];
}

// Geotab Zone points use {x: lon, y: lat}
// Leaflet expects [lat, lon]
function convertZonePoints(zone: Zone): [number, number][] {
    if (!zone.points || zone.points.length === 0) {
        return [];
    }
    return zone.points.map(point => [point.y, point.x] as [number, number]);
}

// Get marker color based on vehicle status
function getMarkerColor(vehicle: VehicleData): string {
    if (vehicle.hasCriticalFaults || vehicle.hasUnrepairedDefects) {
        return '#ef4444'; // Red - critical
    }
    if (vehicle.isCharging) {
        return '#14b8a6'; // Teal - charging
    }
    if (vehicle.dormancyDays === null || vehicle.dormancyDays >= 14) {
        return '#f59e0b'; // Amber - dormant
    }
    if (!vehicle.status.isDeviceCommunicating) {
        return '#6b7280'; // Slate - silent
    }
    return '#10b981'; // Green - healthy
}

// Component to handle map bounds
function MapBoundsHandler({ bounds }: { bounds: LatLngBounds | null }) {
    const map = useMap();

    useEffect(() => {
        if (bounds && bounds.isValid()) {
            map.fitBounds(bounds, { padding: [20, 20] });
        }
    }, [map, bounds]);

    return null;
}

export function ZoneMap({ zone, vehicles, filteredVehicleIds }: ZoneMapProps) {
    const mapRef = useRef<LeafletMap | null>(null);

    // Convert zone points to Leaflet format
    const zonePolygon = useMemo(() => {
        return zone ? convertZonePoints(zone) : [];
    }, [zone]);

    // Calculate bounds from zone polygon
    const bounds = useMemo(() => {
        if (zonePolygon.length === 0) return null;

        const latLngs = zonePolygon.map(([lat, lng]) => L.latLng(lat, lng));
        return L.latLngBounds(latLngs);
    }, [zonePolygon]);

    // Filter vehicles if filter is active
    const displayVehicles = useMemo(() => {
        if (!filteredVehicleIds || filteredVehicleIds.length === 0) {
            return vehicles;
        }
        return vehicles.filter(v => filteredVehicleIds.includes(v.device.id));
    }, [vehicles, filteredVehicleIds]);

    // Default center (UK)
    const defaultCenter: [number, number] = [53.5, -2.5];
    const defaultZoom = 6;

    if (!zone) {
        return (
            <div className="zone-map zone-map--empty">
                <div className="zone-map__placeholder">
                    <span className="zone-map__placeholder-icon">🗺️</span>
                    <span className="zone-map__placeholder-text">Select a yard to view on map</span>
                </div>
            </div>
        );
    }

    return (
        <div className="zone-map">
            <MapContainer
                center={bounds?.getCenter() || defaultCenter}
                zoom={defaultZoom}
                className="zone-map__container"
                ref={mapRef}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Auto-fit to bounds when zone changes */}
                <MapBoundsHandler bounds={bounds} />

                {/* Zone polygon */}
                {zonePolygon.length > 2 && (
                    <Polygon
                        positions={zonePolygon}
                        pathOptions={{
                            color: '#0066cc',
                            fillColor: '#0066cc',
                            fillOpacity: 0.1,
                            weight: 2,
                        }}
                    />
                )}

                {/* Vehicle markers */}
                {displayVehicles.map((vehicle) => {
                    // Get last known position from status
                    const lat = vehicle.status.latitude;
                    const lng = vehicle.status.longitude;

                    if (!lat || !lng) return null;

                    const color = getMarkerColor(vehicle);

                    return (
                        <CircleMarker
                            key={vehicle.device.id}
                            center={[lat, lng]}
                            radius={5}
                            pathOptions={{
                                color: color,
                                fillColor: color,
                                fillOpacity: 0.5,
                                weight: 1.5,
                            }}
                        >
                            <Popup>
                                <div className="marker-popup">
                                    <strong>{vehicle.device.name}</strong>
                                    <br />
                                    {vehicle.isCharging && <span>⚡ Charging</span>}
                                    {vehicle.hasCriticalFaults && <span>⚠️ Has Faults</span>}
                                    {(vehicle.dormancyDays === null || vehicle.dormancyDays >= 14) && (
                                        <span>💤 Dormant ({vehicle.dormancyDays === null ? 'Since Install' : `${Math.round(vehicle.dormancyDays)}d`})</span>
                                    )}
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {displayVehicles.length > 0 && (
                <button className="zone-map__updates-badge">
                    <span className="icon">🔄</span> New Updates Available
                </button>
            )}

            <div className="zone-map__legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: '#10b981' }} /> Healthy</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} /> Critical</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} /> Dormant</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#14b8a6' }} /> Charging</span>
            </div>
        </div>
    );
}
