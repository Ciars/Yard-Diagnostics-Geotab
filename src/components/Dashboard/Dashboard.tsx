/**
 * Dashboard Component
 * 
 * Main layout with refreshed header and data telemetry.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useFleetStore, selectSelectedZoneId, selectSelectedZone, selectIsPollingPaused, selectSidebarCollapsed } from '@/store/useFleetStore';
import { useVehiclesInZone } from '@/hooks';
import { POLLING_INTERVALS } from '@/lib/queryClient';
import { Sidebar } from '@/components/Sidebar/Sidebar';
// import { DebugOverlay } from '@/components/Debug/DebugOverlay';
import { KpiTiles } from '@/components/KpiTiles/KpiTiles';
import { AssetTable } from '@/components/AssetTable/AssetTable';
import { ZoneMap } from '@/components/Map/ZoneMap';
import { WeatherTablet } from '@/components/Weather/WeatherTablet';
import { useZoneWeather } from '@/hooks/useZoneWeather';
import { useVehicleFilter } from '@/hooks/useVehicleFilter';
import {
    IconFileDownload,
    IconRefresh,
    IconCheck,
    IconPlayerPause,
    IconPlayerPlay,
    IconMapPin,
    IconClockHour3,
    IconGripVertical
} from '@tabler/icons-react';
import './Dashboard.css';

const EXPANDED_SIDEBAR_WIDTH_PX = 280;
const COLLAPSED_SIDEBAR_WIDTH_PX = 56;
const SPLITTER_WIDTH_PX = 12;
const MIN_MAP_PANEL_WIDTH_PX = 240;

function getInitialMapPanelWidth(): number {
    if (typeof window === 'undefined') return 320;
    return window.innerWidth >= 1600 ? 640 : 320;
}

export function Dashboard() {
    const selectedZoneId = useFleetStore(selectSelectedZoneId);
    const selectedZone = useFleetStore(selectSelectedZone);
    const sidebarCollapsed = useFleetStore(selectSidebarCollapsed);
    const isPollingPaused = useFleetStore(selectIsPollingPaused);
    const setPollingPaused = useFleetStore((s) => s.setPollingPaused);
    const setExpandedVehicle = useFleetStore((s) => s.setExpandedVehicle);
    const [lastRefreshTime, setLastRefreshTime] = useState<string>('15:20:25');
    const [exporting, setExporting] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [mapPanelWidth, setMapPanelWidth] = useState<number>(getInitialMapPanelWidth);
    const [isResizingPanels, setIsResizingPanels] = useState(false);
    const [mapLayoutRevision, setMapLayoutRevision] = useState(0);
    const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
    const [mapFocusRequest, setMapFocusRequest] = useState<{
        vehicleId: string;
        latitude: number;
        longitude: number;
        zoomDelta: number;
        seq: number;
    } | null>(null);
    const resizeStateRef = useRef({ startX: 0, startWidth: getInitialMapPanelWidth() });
    const sidebarWidthPx = sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH_PX : EXPANDED_SIDEBAR_WIDTH_PX;

    // Fetch vehicles for selected zone
    const { vehicles, kpis, isLoading, dataUpdatedAt, isEnriching, isFetching, isPollingActive, refetch } = useVehiclesInZone(selectedZone);
    const filteredVehicles = useVehicleFilter(vehicles);
    const filteredVehicleIds = useMemo(
        () => filteredVehicles.map((vehicle) => vehicle.device.id),
        [filteredVehicles]
    );
    const { data: zoneWeather } = useZoneWeather(selectedZone, dataUpdatedAt);

    useEffect(() => {
        if (dataUpdatedAt) {
            setLastRefreshTime(new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
    }, [dataUpdatedAt]);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const dataAgeMs = dataUpdatedAt ? Math.max(0, now - dataUpdatedAt) : 0;
    const staleThresholdMs = POLLING_INTERVALS.STATUS_DATA * 2;
    const isDataStale = !!selectedZoneId && !!dataUpdatedAt && dataAgeMs > staleThresholdMs;
    const dataAgeLabel = useMemo(() => {
        if (!dataUpdatedAt) return 'Awaiting first sync';

        const seconds = Math.floor(dataAgeMs / 1000);
        if (seconds < 60) return `${seconds}s ago`;

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;

        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    }, [dataUpdatedAt, dataAgeMs]);
    const weatherLabel = zoneWeather?.temperatureC !== null && zoneWeather?.temperatureC !== undefined
        ? `${Math.round(zoneWeather.temperatureC)}°C`
        : '--°C';
    const weatherFamily = zoneWeather?.family ?? 'unknown';
    const weatherIntensity = zoneWeather?.intensity ?? 'light';
    const weatherTitle = zoneWeather
        ? `${zoneWeather.summary} · ${weatherLabel}`
        : 'Weather unavailable';
    const weatherAnimationKey = `${selectedZoneId ?? 'none'}:${zoneWeather?.weatherCode ?? 'none'}:${weatherLabel}`;

    const clampMapPanelWidth = useCallback((nextWidth: number) => {
        if (typeof window === 'undefined') return nextWidth;

        const availableWidth = Math.max(400, window.innerWidth - sidebarWidthPx - SPLITTER_WIDTH_PX);
        const maxWidth = Math.max(MIN_MAP_PANEL_WIDTH_PX, Math.round(availableWidth * 0.65));
        return Math.min(maxWidth, Math.max(MIN_MAP_PANEL_WIDTH_PX, nextWidth));
    }, [sidebarWidthPx]);

    useEffect(() => {
        const handleWindowResize = () => {
            setMapPanelWidth((current) => clampMapPanelWidth(current));
        };

        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, [clampMapPanelWidth]);

    useEffect(() => {
        setMapPanelWidth((current) => clampMapPanelWidth(current));
        setMapLayoutRevision((revision) => revision + 1);
    }, [clampMapPanelWidth, sidebarCollapsed]);

    useEffect(() => {
        if (!isResizingPanels) return;

        const handlePointerMove = (event: PointerEvent) => {
            const deltaX = event.clientX - resizeStateRef.current.startX;
            const nextWidth = resizeStateRef.current.startWidth - deltaX;
            setMapPanelWidth(clampMapPanelWidth(nextWidth));
        };

        const handlePointerUp = () => {
            setIsResizingPanels(false);
            setMapLayoutRevision((revision) => revision + 1);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [clampMapPanelWidth, isResizingPanels]);

    const handleExport = () => {
        if (vehicles.length === 0) return;

        const headers = ['Asset', 'Make/Model', 'Driver', 'Fuel', 'SOC', 'Zone Duration'];
        const rows = vehicles.map(v => [
            v.device.name,
            v.makeModel || '--',
            v.driverName || 'No Driver',
            v.fuelLevel !== undefined ? `${Math.round(v.fuelLevel)}%` : '--',
            v.stateOfCharge !== undefined ? `${Math.round(v.stateOfCharge)}%` : '--',

            v.zoneEntryTime ? `${Math.round((v.zoneDurationMs ?? 0) / (1000 * 60 * 60))}h` : '--'
        ]);

        const tsvContent = [headers, ...rows].map(row => row.join('\t')).join('\n');
        navigator.clipboard.writeText(tsvContent).then(() => {
            setExporting(true);
            setTimeout(() => setExporting(false), 2000);
        });
    };

    const handleRefresh = () => {
        if (!selectedZoneId) {
            window.location.reload();
            return;
        }
        refetch();
    };

    const handleToggleLiveUpdates = () => {
        setPollingPaused(!isPollingPaused);
    };

    const handleVehicleMapClick = (vehicleId: string) => {
        setExpandedVehicle(vehicleId);
    };

    const handleRowHoverChange = useCallback((vehicleId: string | null) => {
        setHoveredVehicleId(vehicleId);
    }, []);

    const handleRowToggle = useCallback((vehicleId: string, isExpanding: boolean) => {
        const targetVehicle = vehicles.find((vehicle) =>
            vehicle.device.id === vehicleId
            && Number.isFinite(vehicle.status.latitude)
            && Number.isFinite(vehicle.status.longitude)
        );

        if (!targetVehicle) return;

        setMapFocusRequest((prev) => ({
            vehicleId,
            latitude: targetVehicle.status.latitude,
            longitude: targetVehicle.status.longitude,
            zoomDelta: isExpanding ? 1 : -1,
            seq: (prev?.seq ?? 0) + 1
        }));
    }, [vehicles]);

    const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        resizeStateRef.current = { startX: event.clientX, startWidth: mapPanelWidth };
        setIsResizingPanels(true);
    };

    const dashboardStyle = {
        '--sidebar-width': `${sidebarWidthPx}px`,
        '--map-panel-width': `${mapPanelWidth}px`,
    } as CSSProperties;

    return (
        <div className={`dashboard ${isResizingPanels ? 'dashboard--resizing' : ''}`} style={dashboardStyle}>
            {/* DebugOverlay removed for production polish */}
            {/* <DebugOverlay /> */}
            {/* Panel 1: Sidebar (Left) */}
            <Sidebar />

            {/* Panel 2: Main Content (Middle) - KPIs & Table */}
            <main className="dashboard__middle-panel">
                {/* Sticky Header */}
                <header className="dashboard__header sticky-header">
                    <div className="dashboard__title-wrap">
                        <h1 className="dashboard__title">
                            {selectedZoneId ? (selectedZone?.name ?? 'Loading zone...') : 'Select a Zone'}
                        </h1>
                        <span className="dashboard__title-meta">
                            {selectedZoneId ? `${vehicles.length} vehicles in zone` : 'Choose a zone to begin monitoring'}
                        </span>
                    </div>
                    <div className="dashboard__header-actions">
                        <button
                            className={`action-btn action-btn--live ${isPollingActive ? 'action-btn--live-active' : 'action-btn--live-paused'}`}
                            onClick={handleToggleLiveUpdates}
                            title={isPollingActive ? 'Pause live updates' : 'Resume live updates'}
                        >
                            {isPollingActive ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                            <span>{isPollingActive ? 'LIVE' : 'PAUSED'}</span>
                        </button>
                        <button
                            className={`action-btn action-btn--export ${exporting ? 'action-btn--success' : ''}`}
                            onClick={handleExport}
                            disabled={vehicles.length === 0}
                        >
                            {exporting ? <IconCheck size={16} /> : <IconFileDownload size={16} />}
                            <span>{exporting ? 'COPIED!' : 'EXPORT'}</span>
                        </button>
                        <button className="action-btn" onClick={handleRefresh} title="Refresh data">
                            <IconRefresh size={18} />
                        </button>
                    </div>
                </header>

                <div className="dashboard__scroll-content">
                    {!selectedZoneId ? (
                        <div className="dashboard__empty-state">
                            <div className="empty-state">
                                <div className="empty-state__icon"><IconMapPin size={48} /></div>
                                <h2 className="empty-state__title">Select a Yard</h2>
                                <p className="empty-state__description">
                                    Choose a yard from the left panel to view diagnostics
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* KPI Tiles */}
                            <section className="dashboard__kpi-section">
                                <KpiTiles kpis={kpis} isLoading={isLoading} />
                            </section>

                            <div className="dashboard__data-status">
                                <WeatherTablet
                                    family={weatherFamily}
                                    intensity={weatherIntensity}
                                    temperatureLabel={weatherLabel}
                                    title={weatherTitle}
                                    animationKey={weatherAnimationKey}
                                />
                                <span className={`status-chip ${isDataStale ? 'status-chip--stale' : 'status-chip--fresh'}`}>
                                    {isDataStale ? 'STALE' : 'FRESH'}
                                </span>
                                <span className="timestamp">
                                    <IconClockHour3 size={14} />
                                    Data from: {lastRefreshTime}
                                </span>
                                <span className="age">({dataAgeLabel})</span>
                                <span className={`status-chip ${isPollingActive ? 'status-chip--live' : 'status-chip--paused'}`}>
                                    {isPollingActive ? (isFetching ? 'SYNCING' : 'LIVE') : 'PAUSED'}
                                </span>
                            </div>

                            {/* Asset Table */}
                            <section className="dashboard__table-section">
                                <AssetTable
                                    vehicles={vehicles}
                                    isLoading={isLoading}
                                    isEnriching={isEnriching}
                                    onRowHoverChange={handleRowHoverChange}
                                    onRowToggle={handleRowToggle}
                                />
                            </section>
                        </>
                    )}
                </div>
            </main>

            <div
                className="dashboard__splitter"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize vehicle list and map panels"
                onPointerDown={handleResizeStart}
                onDoubleClick={() => setMapPanelWidth(getInitialMapPanelWidth())}
                title="Drag to resize panels"
            >
                <IconGripVertical size={14} />
            </div>

            {/* Panel 3: Map (Right) */}
            <aside className="dashboard__right-panel">
                {selectedZoneId ? (
                    <div className="map-container-full">
                        <ZoneMap
                            zone={selectedZone}
                            vehicles={vehicles}
                            filteredVehicleIds={filteredVehicleIds}
                            layoutRevision={mapLayoutRevision}
                            hoveredVehicleId={hoveredVehicleId}
                            focusRequest={mapFocusRequest}
                            onVehicleClick={handleVehicleMapClick}
                        />
                    </div>
                ) : (
                    <div className="map-empty-state">
                        <span>Select a Zone to view Map</span>
                    </div>
                )}
            </aside>
        </div>
    );
}
