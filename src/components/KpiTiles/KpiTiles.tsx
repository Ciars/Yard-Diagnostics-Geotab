/**
 * KPI Tiles Component
 * 
 * The "Big 5" KPI cards with click-to-filter functionality.
 * Per UI_BLUEPRINT.md Section 2.B
 */

import { useFleetStore, selectActiveKpiFilter } from '@/store/useFleetStore';
import type { KpiCounts, KpiFilterType } from '@/types/geotab';
import { AlertTriangle, WifiOff, PauseCircle, Zap, Wrench } from 'lucide-react';
import './KpiTiles.css';

interface KpiTilesProps {
    kpis: KpiCounts;
    isLoading?: boolean;
}

interface TileConfig {
    key: KpiFilterType;
    label: string;
    description: string;
    colorClass: string;
    icon: React.ElementType;
}

const TILE_CONFIG: TileConfig[] = [
    {
        key: 'critical',
        label: 'CRITICAL HEALTH',
        description: 'Requiring immediate action',
        colorClass: 'kpi-tile--critical',
        icon: AlertTriangle,
    },
    {
        key: 'silent',
        label: 'SILENT ASSETS',
        description: 'No signal > 24 hours',
        colorClass: 'kpi-tile--silent',
        icon: WifiOff,
    },
    {
        key: 'dormant',
        label: 'DORMANT',
        description: 'Stationary > 14 days',
        colorClass: 'kpi-tile--dormant',
        icon: PauseCircle,
    },
    {
        key: 'charging',
        label: 'VEHICLES CHARGING',
        description: 'Connected to power',
        colorClass: 'kpi-tile--charging',
        icon: Zap,
    },
    {
        key: 'serviceDue',
        label: 'SERVICE DUE',
        description: 'Within 7 days',
        colorClass: 'kpi-tile--service',
        icon: Wrench,
    },
];

export function KpiTiles({ kpis, isLoading }: KpiTilesProps) {
    const activeFilter = useFleetStore(selectActiveKpiFilter);
    const toggleKpiFilter = useFleetStore((s) => s.toggleKpiFilter);

    const handleTileClick = (filter: KpiFilterType) => {
        toggleKpiFilter(filter);
    };

    if (isLoading) {
        return (
            <div className="kpi-tiles">
                {TILE_CONFIG.map((tile) => (
                    <div key={tile.key} className={`kpi-tile ${tile.colorClass} kpi-tile--loading`}>
                        <span className="kpi-tile__value skeleton">--</span>
                        <span className="kpi-tile__label">{tile.label}</span>
                        <span className="kpi-tile__description">{tile.description}</span>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="kpi-tiles">
            {TILE_CONFIG.map((tile) => {
                const count = kpis[tile.key];
                const isActive = activeFilter === tile.key;

                return (
                    <button
                        key={tile.key}
                        className={`kpi-tile ${tile.colorClass} ${isActive ? 'kpi-tile--active' : ''}`}
                        onClick={() => handleTileClick(tile.key)}
                        aria-pressed={isActive}
                    >
                        <div className="kpi-tile__header">
                            <span className="kpi-tile__label">{tile.label}</span>
                            <tile.icon className="kpi-tile__icon" size={16} />
                        </div>
                        <span className="kpi-tile__value">{count}</span>
                        <span className="kpi-tile__description">{tile.description}</span>
                    </button>
                );
            })}
        </div>
    );
}
