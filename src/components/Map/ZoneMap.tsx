/**
 * Zone Map Component
 * 
 * Leaflet map displaying zone polygon and vehicle markers.
 * Per UI_BLUEPRINT.md Section 2.C
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Map as LeafletMap, LatLngBounds } from 'leaflet';
import { IconMap2, IconRefresh, IconBolt, IconAlertTriangle, IconMoonStars } from '@tabler/icons-react';
import 'leaflet/dist/leaflet.css';
import type { Zone, VehicleData } from '@/types/geotab';
import { isVehicleCharging, isVehicleCritical, isVehicleDormant, isVehicleSilent } from '@/lib/vehicleHealthPredicates';
import './ZoneMap.css';

interface ZoneMapProps {
    zone: Zone | null;
    vehicles: VehicleData[];
    filteredVehicleIds?: string[];
    layoutRevision?: number;
    hoveredVehicleId?: string | null;
    focusRequest?: {
        vehicleId: string;
        latitude: number;
        longitude: number;
        zoomDelta: number;
        seq: number;
    } | null;
    onVehicleClick?: (vehicleId: string) => void;
}

interface ClusterMarker {
    key: string;
    center: [number, number];
    vehicles: VehicleData[];
    bounds: LatLngBounds;
    color: string;
}

const MARKER_COLORS = {
    critical: '#A01F0E',
    charging: '#0C74C3',
    dormant: '#59480D',
    silent: '#8DA4B9',
    healthy: '#4AA75E'
} as const;

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
    if (isVehicleCritical(vehicle)) {
        return MARKER_COLORS.critical;
    }
    if (isVehicleCharging(vehicle)) {
        return MARKER_COLORS.charging;
    }
    if (isVehicleDormant(vehicle)) {
        return MARKER_COLORS.dormant;
    }
    if (isVehicleSilent(vehicle)) {
        return MARKER_COLORS.silent;
    }
    return MARKER_COLORS.healthy;
}

function getClusterGridSizeDegrees(zoom: number): number {
    return Math.max(0.003, 1.3 / Math.pow(2, Math.max(0, zoom - 5)));
}

function getClusterColor(vehicles: VehicleData[]): string {
    if (vehicles.some(isVehicleCritical)) return MARKER_COLORS.critical;
    if (vehicles.some(isVehicleCharging)) return MARKER_COLORS.charging;
    if (vehicles.some(isVehicleDormant)) return MARKER_COLORS.dormant;
    if (vehicles.some(isVehicleSilent)) return MARKER_COLORS.silent;
    return MARKER_COLORS.healthy;
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

function MapZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
    const map = useMapEvents({
        zoomend: () => {
            onZoomChange(map.getZoom());
        }
    });

    useEffect(() => {
        onZoomChange(map.getZoom());
    }, [map, onZoomChange]);

    return null;
}

const DEFAULT_CENTER: [number, number] = [53.5, -2.5];
const DEFAULT_ZOOM = 6;

function MapResizeHandler({
    bounds,
    layoutRevision
}: {
    bounds: LatLngBounds | null;
    layoutRevision: number;
}) {
    const map = useMap();

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            map.invalidateSize();
            if (bounds && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [20, 20] });
                return;
            }
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [map, bounds, layoutRevision]);

    return null;
}

function MapFocusHandler({
    focusRequest
}: {
    focusRequest: ZoneMapProps['focusRequest'];
}) {
    const map = useMap();

    useEffect(() => {
        if (!focusRequest) return;
        const nextZoom = Math.max(3, Math.min(19, map.getZoom() + focusRequest.zoomDelta));
        map.setView([focusRequest.latitude, focusRequest.longitude], nextZoom, { animate: true });
    }, [focusRequest, map]);

    return null;
}

export function ZoneMap({
    zone,
    vehicles,
    filteredVehicleIds,
    layoutRevision = 0,
    hoveredVehicleId = null,
    focusRequest = null,
    onVehicleClick
}: ZoneMapProps) {
    const mapRef = useRef<LeafletMap | null>(null);
    const [zoom, setZoom] = useState(6);

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
    const filteredVehicleSet = useMemo(() => {
        if (!filteredVehicleIds || filteredVehicleIds.length === 0) return null;
        return new Set(filteredVehicleIds);
    }, [filteredVehicleIds]);

    const displayVehicles = useMemo(() => {
        if (!filteredVehicleSet) {
            return vehicles;
        }
        return vehicles.filter((v) => filteredVehicleSet.has(v.device.id));
    }, [vehicles, filteredVehicleSet]);

    const shouldCluster = displayVehicles.length > 100 && zoom < 13;

    const markerData = useMemo<ClusterMarker[]>(() => {
        const positionedVehicles = displayVehicles.filter((vehicle) =>
            Number.isFinite(vehicle.status.latitude) && Number.isFinite(vehicle.status.longitude)
        );

        if (!shouldCluster) {
            return positionedVehicles.map((vehicle) => {
                const lat = vehicle.status.latitude;
                const lng = vehicle.status.longitude;
                const bounds = L.latLngBounds([L.latLng(lat, lng), L.latLng(lat, lng)]);
                return {
                    key: vehicle.device.id,
                    center: [lat, lng],
                    vehicles: [vehicle],
                    bounds,
                    color: getMarkerColor(vehicle)
                };
            });
        }

        const cellSize = getClusterGridSizeDegrees(zoom);
        const buckets = new Map<string, {
            vehicles: VehicleData[];
            latSum: number;
            lngSum: number;
            minLat: number;
            maxLat: number;
            minLng: number;
            maxLng: number;
        }>();

        positionedVehicles.forEach((vehicle) => {
            const lat = vehicle.status.latitude;
            const lng = vehicle.status.longitude;
            const row = Math.floor(lat / cellSize);
            const col = Math.floor(lng / cellSize);
            const key = `${row}:${col}`;

            const existing = buckets.get(key);
            if (!existing) {
                buckets.set(key, {
                    vehicles: [vehicle],
                    latSum: lat,
                    lngSum: lng,
                    minLat: lat,
                    maxLat: lat,
                    minLng: lng,
                    maxLng: lng
                });
                return;
            }

            existing.vehicles.push(vehicle);
            existing.latSum += lat;
            existing.lngSum += lng;
            existing.minLat = Math.min(existing.minLat, lat);
            existing.maxLat = Math.max(existing.maxLat, lat);
            existing.minLng = Math.min(existing.minLng, lng);
            existing.maxLng = Math.max(existing.maxLng, lng);
        });

        return Array.from(buckets.entries()).map(([key, bucket]) => {
            const centerLat = bucket.latSum / bucket.vehicles.length;
            const centerLng = bucket.lngSum / bucket.vehicles.length;
            const bounds = L.latLngBounds(
                L.latLng(bucket.minLat, bucket.minLng),
                L.latLng(bucket.maxLat, bucket.maxLng)
            );

            return {
                key,
                center: [centerLat, centerLng],
                vehicles: bucket.vehicles,
                bounds,
                color: getClusterColor(bucket.vehicles)
            };
        });
    }, [displayVehicles, shouldCluster, zoom]);

    const handleClusterClick = useCallback((boundsToFit: LatLngBounds) => {
        if (!mapRef.current || !boundsToFit.isValid()) return;
        mapRef.current.fitBounds(boundsToFit, {
            padding: [28, 28],
            maxZoom: 15
        });
    }, []);

    if (!zone) {
        return (
            <div className="zone-map zone-map--empty">
                <div className="zone-map__placeholder">
                    <span className="zone-map__placeholder-icon">
                        <IconMap2 size={32} />
                    </span>
                    <span className="zone-map__placeholder-text">Select a yard to view on map</span>
                </div>
            </div>
        );
    }

    return (
        <div className="zone-map">
            <MapContainer
                center={bounds?.getCenter() || DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                className="zone-map__container"
                ref={mapRef}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Auto-fit to bounds when zone changes */}
                <MapBoundsHandler bounds={bounds} />
                <MapResizeHandler bounds={bounds} layoutRevision={layoutRevision} />
                <MapFocusHandler focusRequest={focusRequest} />
                <MapZoomTracker onZoomChange={setZoom} />

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
                {markerData.map((marker) => {
                    if (marker.vehicles.length === 1) {
                        const vehicle = marker.vehicles[0];
                        const isHovered = hoveredVehicleId === vehicle.device.id;

                        return (
                            <CircleMarker
                                key={marker.key}
                                center={marker.center}
                                radius={isHovered ? 10 : 5}
                                pathOptions={{
                                    color: marker.color,
                                    fillColor: marker.color,
                                    fillOpacity: isHovered ? 0.85 : 0.5,
                                    weight: isHovered ? 2.5 : 1.5,
                                }}
                                eventHandlers={{
                                    click: () => onVehicleClick?.(vehicle.device.id)
                                }}
                            >
                                <Popup>
                                    <div className="marker-popup">
                                        <strong>{vehicle.device.name}</strong>
                                        <br />
                                        {vehicle.isCharging && (
                                            <span className="marker-popup__status">
                                                <IconBolt size={13} />
                                                Charging
                                            </span>
                                        )}
                                        {isVehicleCritical(vehicle) && (
                                            <span className="marker-popup__status">
                                                <IconAlertTriangle size={13} />
                                                Requires attention
                                            </span>
                                        )}
                                        {isVehicleDormant(vehicle) && (
                                            <span className="marker-popup__status">
                                                <IconMoonStars size={13} />
                                                Dormant ({vehicle.dormancyDays === null ? 'Since Install' : `${Math.round(vehicle.dormancyDays)}d`})
                                            </span>
                                        )}
                                    </div>
                                </Popup>
                            </CircleMarker>
                        );
                    }

                    const criticalCount = marker.vehicles.filter(isVehicleCritical).length;
                    const silentCount = marker.vehicles.filter(isVehicleSilent).length;
                    const dormantCount = marker.vehicles.filter(isVehicleDormant).length;
                    const chargingCount = marker.vehicles.filter(isVehicleCharging).length;
                    const clusterRadius = Math.min(20, 8 + Math.log2(marker.vehicles.length) * 3);

                    return (
                        <CircleMarker
                            key={marker.key}
                            center={marker.center}
                            radius={clusterRadius}
                            pathOptions={{
                                color: marker.color,
                                fillColor: marker.color,
                                fillOpacity: 0.7,
                                weight: 2,
                            }}
                            eventHandlers={{
                                click: () => handleClusterClick(marker.bounds)
                            }}
                        >
                            <Tooltip permanent direction="center" className="zone-map__cluster-label">
                                {marker.vehicles.length}
                            </Tooltip>
                            <Popup>
                                <div className="marker-popup marker-popup--cluster">
                                    <strong>{marker.vehicles.length} vehicles in this area</strong>
                                    <span>Critical: {criticalCount}</span>
                                    <span>Silent: {silentCount}</span>
                                    <span>Dormant: {dormantCount}</span>
                                    <span>Charging: {chargingCount}</span>
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {displayVehicles.length > 0 && (
                <button className="zone-map__updates-badge">
                    <span className="icon"><IconRefresh size={14} /></span> New Updates Available
                </button>
            )}

            {shouldCluster && (
                <div className="zone-map__cluster-hint">
                    Dense view: markers clustered, zoom in for individual vehicles
                </div>
            )}

            <div className="zone-map__legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: MARKER_COLORS.healthy }} /> Healthy</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: MARKER_COLORS.critical }} /> Critical</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: MARKER_COLORS.dormant }} /> Dormant</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: MARKER_COLORS.charging }} /> Charging</span>
            </div>
        </div>
    );
}
