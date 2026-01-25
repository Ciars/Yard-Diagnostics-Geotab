/**
 * Sidebar Component
 * 
 * Refined sidebar with GeoYard branding and improved list styling.
 */

import { useEffect, useMemo } from 'react';
import { useFleetStore, selectSelectedZoneId, selectSearchQuery, selectSidebarCollapsed, selectZones } from '@/store/useFleetStore';
import { useZones, useZoneCounts } from '@/hooks';
import { Search, LogOut, MapPin } from 'lucide-react';
import './Sidebar.css';

export function Sidebar() {
    const selectedZoneId = useFleetStore(selectSelectedZoneId);
    const searchQuery = useFleetStore(selectSearchQuery);
    const sidebarCollapsed = useFleetStore(selectSidebarCollapsed);
    const storeZones = useFleetStore(selectZones);

    const setSelectedZone = useFleetStore((s) => s.setSelectedZone);
    const setSearchQuery = useFleetStore((s) => s.setSearchQuery);
    const toggleSidebar = useFleetStore((s) => s.toggleSidebar);
    const setZones = useFleetStore((s) => s.setZones);

    const { zones: apiZones, isLoading } = useZones();
    const { counts: zoneCounts, isLoading: countsLoading } = useZoneCounts(storeZones);

    useEffect(() => {
        if (apiZones.length > 0 && storeZones.length === 0) {
            setZones(apiZones);
        }
    }, [apiZones, storeZones.length, setZones]);

    const filteredZones = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return storeZones;
        return storeZones.filter((zone) =>
            zone.name.toLowerCase().includes(query)
        );
    }, [storeZones, searchQuery]);

    const handleZoneClick = (zoneId: string) => {
        setSelectedZone(zoneId);
    };

    if (sidebarCollapsed) {
        return (
            <aside className="sidebar sidebar--collapsed">
                <button className="sidebar__toggle" onClick={toggleSidebar}>☰</button>
            </aside>
        );
    }

    return (
        <aside className="sidebar">
            <div className="sidebar__header">
                <div className="sidebar__logo">
                    <h1>GeoYard</h1>
                    <span className="subtitle">circet</span>
                </div>
                <button className="sidebar__logout" aria-label="Logout">
                    <LogOut size={18} />
                </button>
            </div>

            <div className="sidebar__search">
                <Search className="search-icon" size={14} />
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
                ) : filteredZones.map((zone) => (
                    <button
                        key={zone.id}
                        className={`sidebar__zone ${selectedZoneId === zone.id ? 'sidebar__zone--active' : ''}`}
                        onClick={() => handleZoneClick(zone.id)}
                    >
                        <span className="sidebar__zone-name">
                            <MapPin size={12} style={{ marginRight: '8px', opacity: 0.6 }} />
                            {zone.name}
                        </span>
                        <span className="sidebar__zone-badge">
                            {countsLoading ? '...' : (zoneCounts[zone.id] ?? 0)}
                        </span>
                    </button>
                ))}
            </div>
        </aside>
    );
}
