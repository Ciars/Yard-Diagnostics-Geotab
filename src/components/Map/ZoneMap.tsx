/**
 * Zone Map Component
 *
 * Leaflet map displaying zone polygon and vehicle markers.
 * Per UI_BLUEPRINT.md Section 2.C
 */

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBounds } from 'leaflet';
import {
    IconAntennaBarsOff,
    IconAlertTriangle,
    IconBatteryExclamation,
    IconBolt,
    IconCameraOff,
    IconCar,
    IconEngine,
    IconMap2,
    IconMoonStars,
    IconPlugConnected,
    IconRefresh,
    IconWifiOff
} from '@tabler/icons-react';
import 'leaflet/dist/leaflet.css';
import type { Zone, VehicleData } from '@/types/geotab';
import {
    BATTERY_CRITICAL_VOLTS,
    hasVehicleCameraIssue,
    isVehicleCharging,
    isVehicleCritical,
    isVehicleDormant,
    isVehicleSilent
} from '@/lib/vehicleHealthPredicates';
import { isTelematicsFault } from '@/services/FaultService';
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

type MarkerSeverity = 'healthy' | 'issue' | 'critical';
type MarkerCore = 'vehicle' | 'charging' | 'dormant' | 'offline';
type MarkerBadge = 'none' | 'engine' | 'telematics' | 'camera' | 'battery';

interface VehicleMarker {
    key: string;
    center: [number, number];
    vehicle: VehicleData;
    severity: MarkerSeverity;
    core: MarkerCore;
    badge: MarkerBadge;
}

const MARKER_COLORS = {
    critical: '#A01F0E',
    issue: '#E07A16',
    healthy: '#4AA75E'
} as const;

// Geotab Zone points use {x: lon, y: lat}
// Leaflet expects [lat, lon]
function convertZonePoints(zone: Zone): [number, number][] {
    if (!zone.points || zone.points.length === 0) {
        return [];
    }
    return zone.points.map((point) => [point.y, point.x] as [number, number]);
}

function hasLowBattery(vehicle: VehicleData): boolean {
    return typeof vehicle.batteryVoltage === 'number' && vehicle.batteryVoltage <= BATTERY_CRITICAL_VOLTS;
}

function hasEngineIssue(vehicle: VehicleData): boolean {
    if (vehicle.hasCriticalFaults) return true;
    return (vehicle.activeFaults ?? []).some((fault) => !isTelematicsFault(fault));
}

function hasTelematicsIssue(vehicle: VehicleData): boolean {
    if (isVehicleSilent(vehicle)) return true;

    const healthIssues = vehicle.health?.issues ?? [];
    if (healthIssues.some((issue) => issue.source === 'device')) return true;

    return (vehicle.activeFaults ?? []).some(isTelematicsFault);
}

function getMarkerSeverity(vehicle: VehicleData): MarkerSeverity {
    if (isVehicleCritical(vehicle)) return 'critical';

    if (
        isVehicleSilent(vehicle)
        || isVehicleDormant(vehicle)
        || isVehicleCharging(vehicle)
        || hasVehicleCameraIssue(vehicle)
        || hasEngineIssue(vehicle)
        || hasTelematicsIssue(vehicle)
        || hasLowBattery(vehicle)
    ) {
        return 'issue';
    }

    return 'healthy';
}

function getMarkerCore(vehicle: VehicleData): MarkerCore {
    if (isVehicleSilent(vehicle)) return 'offline';
    if (isVehicleCharging(vehicle)) return 'charging';
    if (isVehicleDormant(vehicle)) return 'dormant';
    return 'vehicle';
}

function getMarkerBadge(vehicle: VehicleData): MarkerBadge {
    if (hasEngineIssue(vehicle)) return 'engine';
    if (hasTelematicsIssue(vehicle)) return 'telematics';
    if (hasVehicleCameraIssue(vehicle)) return 'camera';
    if (hasLowBattery(vehicle)) return 'battery';
    return 'none';
}

function getSeverityColor(severity: MarkerSeverity): string {
    if (severity === 'critical') return MARKER_COLORS.critical;
    if (severity === 'issue') return MARKER_COLORS.issue;
    return MARKER_COLORS.healthy;
}

function renderCoreIcon(core: MarkerCore) {
    if (core === 'charging') return <IconPlugConnected size={24} stroke={2.2} />;
    if (core === 'dormant') return <IconMoonStars size={24} stroke={2.2} />;
    if (core === 'offline') return <IconWifiOff size={24} stroke={2.2} />;
    return <IconCar size={24} stroke={2.2} />;
}

function renderBadgeIcon(badge: MarkerBadge) {
    if (badge === 'engine') return <IconEngine size={10} stroke={2.2} />;
    if (badge === 'telematics') return <IconAntennaBarsOff size={10} stroke={2.2} />;
    if (badge === 'camera') return <IconCameraOff size={10} stroke={2.2} />;
    if (badge === 'battery') return <IconBatteryExclamation size={10} stroke={2.2} />;
    return null;
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

    const markerData = useMemo<VehicleMarker[]>(() => {
        return displayVehicles
            .filter((vehicle) => Number.isFinite(vehicle.status.latitude) && Number.isFinite(vehicle.status.longitude))
            .map((vehicle) => {
                const lat = vehicle.status.latitude;
                const lng = vehicle.status.longitude;
                return {
                    key: vehicle.device.id,
                    center: [lat, lng],
                    vehicle,
                    severity: getMarkerSeverity(vehicle),
                    core: getMarkerCore(vehicle),
                    badge: getMarkerBadge(vehicle)
                };
            });
    }, [displayVehicles]);

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
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Auto-fit to bounds when zone changes */}
                <MapBoundsHandler bounds={bounds} />
                <MapResizeHandler bounds={bounds} layoutRevision={layoutRevision} />
                <MapFocusHandler focusRequest={focusRequest} />

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
                    const { vehicle, severity, core, badge } = marker;
                    const isHovered = hoveredVehicleId === vehicle.device.id;
                    const markerColor = getSeverityColor(severity);

                    return (
                        <CircleMarker
                            key={marker.key}
                            center={marker.center}
                            radius={isHovered ? 24 : 12}
                            pathOptions={{
                                color: markerColor,
                                fillColor: markerColor,
                                fillOpacity: severity === 'healthy'
                                    ? (isHovered ? 0.55 : 0.38)
                                    : (isHovered ? 0.8 : 0.62),
                                weight: severity === 'critical'
                                    ? (isHovered ? 8 : 6)
                                    : (isHovered ? 6 : 4),
                                dashArray: severity === 'critical' ? '8 6' : undefined
                            }}
                            eventHandlers={{
                                click: () => onVehicleClick?.(vehicle.device.id)
                            }}
                        >
                            <Tooltip
                                permanent
                                direction="center"
                                opacity={1}
                                interactive={false}
                                className="zone-map__marker-tooltip"
                            >
                                <span className={`zone-map__marker-glyph zone-map__marker-glyph--${severity}`}>
                                    <span className="zone-map__marker-core">{renderCoreIcon(core)}</span>
                                    {badge !== 'none' && (
                                        <span className="zone-map__marker-badge">{renderBadgeIcon(badge)}</span>
                                    )}
                                </span>
                            </Tooltip>
                            <Popup>
                                <div className="marker-popup">
                                    <strong>{vehicle.device.name}</strong>
                                    <br />
                                    {isVehicleCharging(vehicle) && (
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
                                    {isVehicleSilent(vehicle) && (
                                        <span className="marker-popup__status">
                                            <IconWifiOff size={13} />
                                            Telematics signal lost
                                        </span>
                                    )}
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

            <div className="zone-map__legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: MARKER_COLORS.healthy }} /> Healthy</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: MARKER_COLORS.issue }} /> Issue</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: MARKER_COLORS.critical }} /> Critical</span>
            </div>
        </div>
    );
}
