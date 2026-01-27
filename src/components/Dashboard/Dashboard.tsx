/**
 * Dashboard Component
 * 
 * Main layout with refreshed header and data telemetry.
 */

import { useEffect, useState } from 'react';
import { useFleetStore, selectSelectedZoneId, selectSelectedZone } from '@/store/useFleetStore';
import { useVehiclesInZone } from '@/hooks';
import { Sidebar } from '@/components/Sidebar/Sidebar';
// import { DebugOverlay } from '@/components/Debug/DebugOverlay';
import { KpiTiles } from '@/components/KpiTiles/KpiTiles';
import { AssetTable } from '@/components/AssetTable/AssetTable';
import { ZoneMap } from '@/components/Map/ZoneMap';
import { FileDown, RefreshCw, Check } from 'lucide-react';
import './Dashboard.css';

export function Dashboard() {
    const selectedZoneId = useFleetStore(selectSelectedZoneId);
    const selectedZone = useFleetStore(selectSelectedZone);
    // const setVehicles = useFleetStore((s) => s.setVehicles); removed
    const [lastRefreshTime, setLastRefreshTime] = useState<string>('15:20:25');
    const [exporting, setExporting] = useState(false);

    // Fetch vehicles for selected zone
    const { vehicles, kpis, isLoading, dataUpdatedAt } = useVehiclesInZone(selectedZone);

    useEffect(() => {
        if (dataUpdatedAt) {
            setLastRefreshTime(new Date(dataUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }
    }, [dataUpdatedAt]);

    // Sync vehicles to store for filtering
    // Sync vehicles to store is handled by useVehiclesInZone hook now

    const handleExport = () => {
        if (vehicles.length === 0) return;

        const headers = ['Asset', 'Make/Model', 'Driver', 'Fuel', 'SOC', 'Service', 'Zone Duration'];
        const rows = vehicles.map(v => [
            v.device.name,
            v.makeModel || '--',
            v.driverName || 'No Driver',
            v.fuelLevel !== undefined ? `${Math.round(v.fuelLevel)}%` : '--',
            v.stateOfCharge !== undefined ? `${Math.round(v.stateOfCharge)}%` : '--',
            v.serviceDueDays !== undefined ? `Due in ${v.serviceDueDays}d` : '--',
            v.zoneEntryTime ? `${Math.round((v.zoneDurationMs ?? 0) / (1000 * 60 * 60))}h` : '--'
        ]);

        const tsvContent = [headers, ...rows].map(row => row.join('\t')).join('\n');
        navigator.clipboard.writeText(tsvContent).then(() => {
            setExporting(true);
            setTimeout(() => setExporting(false), 2000);
        });
    };

    return (
        <div className="dashboard">
            {/* DebugOverlay removed for production polish */}
            {/* <DebugOverlay /> */}
            {/* Panel 1: Sidebar (Left) */}
            <Sidebar />

            {/* Panel 2: Main Content (Middle) - KPIs & Table */}
            <main className="dashboard__middle-panel">
                {/* Sticky Header */}
                <header className="dashboard__header sticky-header">
                    <h1 className="dashboard__title">GeoYard Diagnostics</h1>
                    <div className="dashboard__header-actions">
                        <button
                            className={`action-btn action-btn--export ${exporting ? 'action-btn--success' : ''}`}
                            onClick={handleExport}
                            disabled={vehicles.length === 0}
                        >
                            {exporting ? <Check size={16} /> : <FileDown size={16} />}
                            <span>{exporting ? 'COPIED!' : 'EXPORT'}</span>
                        </button>
                        <button className="action-btn" onClick={() => window.location.reload()} title="Refresh data">
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </header>

                <div className="dashboard__scroll-content">
                    {!selectedZoneId ? (
                        <div className="dashboard__empty-state">
                            <div className="empty-state">
                                <div className="empty-state__icon">📍</div>
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
                                <span className="timestamp">🕒 Data from: {lastRefreshTime}</span>
                            </div>

                            {/* Asset Table */}
                            <section className="dashboard__table-section">
                                <AssetTable vehicles={vehicles} isLoading={isLoading} />
                            </section>
                        </>
                    )}
                </div>
            </main>

            {/* Panel 3: Map (Right) */}
            <aside className="dashboard__right-panel">
                {selectedZoneId ? (
                    <div className="map-container-full">
                        <div className="map-header-overlay">
                            <h2>{selectedZone?.name ?? 'Loading...'}</h2>
                            <span className="vehicle-count">{vehicles.length} vehicles</span>
                        </div>
                        <ZoneMap
                            zone={selectedZone}
                            vehicles={vehicles}
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
