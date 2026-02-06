/**
 * Sidebar Component
 * 
 * Refined sidebar with GeoYard branding and improved list styling.
 */

import { useEffect, useMemo } from 'react';
import { useFleetStore, selectSelectedZoneId, selectSearchQuery, selectSidebarCollapsed, selectZones } from '@/store/useFleetStore';
import { useZones, useZoneCounts } from '@/hooks';
import { IconSearch, IconMapPin, IconLayoutSidebarLeftCollapse, IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import './Sidebar.css';

export function Sidebar() {
    const selectedZoneId = useFleetStore(selectSelectedZoneId);
    const searchQuery = useFleetStore(selectSearchQuery);
    const sidebarCollapsed = useFleetStore(selectSidebarCollapsed);
    const storeZones = useFleetStore(selectZones);
    const isPollingPaused = useFleetStore((s) => s.isPollingPaused);

    const setSelectedZone = useFleetStore((s) => s.setSelectedZone);
    const setSearchQuery = useFleetStore((s) => s.setSearchQuery);
    const toggleSidebar = useFleetStore((s) => s.toggleSidebar);
    const setZones = useFleetStore((s) => s.setZones);

    const { zones: apiZones, isLoading, error } = useZones();
    const { counts: zoneCounts, isLoading: countsLoading } = useZoneCounts(storeZones, isPollingPaused);

    // Sync zones from API to Store
    useEffect(() => {
        if (apiZones.length > 0) {
            setZones(apiZones);
        }
    }, [apiZones, setZones]);

    const filteredZones = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const zones = query
            ? storeZones.filter((zone) => zone.name.toLowerCase().includes(query))
            : storeZones;

        // Alphanumeric sort for display
        return [...zones].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
    }, [storeZones, searchQuery]);

    const handleZoneClick = (zoneId: string) => {
        setSelectedZone(zoneId);
    };

    if (sidebarCollapsed) {
        return (
            <aside className="sidebar sidebar--collapsed">
                <button className="sidebar__toggle" onClick={toggleSidebar} aria-label="Expand sidebar">
                    <IconLayoutSidebarRightCollapse size={18} />
                </button>
            </aside>
        );
    }

    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <div className="sidebar__logo">
                    <h1>GeoYard</h1>
                    <span className="subtitle">Yard Vision</span>
                    <span className="sidebar__build-meta">
                        v{__APP_VERSION__} ({new Date(__BUILD_TIMESTAMP__).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                </div>
                <button
                    className="sidebar__zone-toggle"
                    aria-label="Collapse sidebar"
                    onClick={toggleSidebar}
                    title="Collapse sidebar"
                >
                    <IconLayoutSidebarLeftCollapse size={18} />
                </button>
            </div>

            <div className="sidebar__zones">
                <div className="sidebar__search">
                    <IconSearch className="search-icon" size={14} />
                    <input
                        type="text"
                        className="sidebar__search-input"
                        placeholder="Search Zones..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="sidebar__list">
                    {isLoading ? (
                        <div className="sidebar__loading">Loading zones...</div>
                    ) : error ? (
                        <div className="sidebar__error">
                            <p>Failed to load zones</p>
                            <small>{(error as Error).message}</small>
                        </div>
                    ) : filteredZones.length === 0 ? (
                        <div className="sidebar__empty">
                            No zones found
                            <p className="sidebar__api-note">
                                (API Connected)
                            </p>
                        </div>
                    ) : filteredZones.map((zone) => (
                        <button
                            key={zone.id}
                            className={`sidebar__zone ${selectedZoneId === zone.id ? 'sidebar__zone--active' : ''}`}
                            onClick={() => handleZoneClick(zone.id)}
                        >
                            <span className="sidebar__zone-name">
                                <IconMapPin size={12} style={{ marginRight: '8px', opacity: 0.6 }} />
                                {zone.name}
                            </span>
                            <span className="sidebar__zone-badge">
                                {countsLoading ? '...' : (zoneCounts[zone.id] ?? 0)}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* DEBUG FOOTER - Remove in production */}
            {import.meta.env.DEV && (
                <div className="sidebar__debug">
                    <div>API Ready: {apiZones ? 'Yes' : 'No'}</div>
                    <div>Zones: {apiZones?.length ?? 0}</div>
                    <div>Store: {storeZones.length}</div>
                    <div>Loading: {String(isLoading)}</div>
                    {error && <div className="sidebar__debug-error">Err: {(error as Error).message}</div>}
                </div>
            )}
        </aside>
    );
}
