import {
    IconArrowsSort,
    IconArrowUp,
    IconArrowDown,
    IconCar,
    IconClipboardCheck,
    IconAntennaBars5,
    IconCamera
} from '@tabler/icons-react';
import type { SortField, SortDirection } from '@/hooks/useVehicleSort';

interface AssetTableHeaderProps {
    sortField: SortField;
    sortDirection: SortDirection;
    onSort: (field: SortField) => void;
}

export function AssetTableHeader({ sortField, sortDirection, onSort }: AssetTableHeaderProps) {
    const SortIndicator = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <IconArrowsSort size={12} className="sort-indicator sort-indicator--inactive" />;
        return sortDirection === 'asc'
            ? <IconArrowUp size={12} className="sort-indicator" />
            : <IconArrowDown size={12} className="sort-indicator" />;
    };

    return (
        <div className="asset-table__header">
            <button className="asset-table__header-cell col-asset sortable" onClick={() => onSort('asset')}>
                ASSET <SortIndicator field="asset" />
            </button>
            <button className="asset-table__header-cell col-model sortable" onClick={() => onSort('model')}>
                MAKE/MODEL <SortIndicator field="model" />
            </button>
            <button className="asset-table__header-cell col-driver sortable" onClick={() => onSort('driver')}>
                DRIVER <SortIndicator field="driver" />
            </button>
            <button className="asset-table__header-cell col-fuel sortable" onClick={() => onSort('fuel')}>
                FUEL <SortIndicator field="fuel" />
            </button>
            <button className="asset-table__header-cell col-soc sortable" onClick={() => onSort('soc')}>
                SOC <SortIndicator field="soc" />
            </button>
            <div className="asset-table__header-cell col-icons">
                <span className="status-icon-slot">
                    <IconCar size={14} className="icon--muted" />
                </span>
                <span className="status-icon-slot">
                    <IconClipboardCheck size={14} className="icon--muted" />
                </span>
                <span className="status-icon-slot">
                    <IconAntennaBars5 size={14} className="icon--muted" />
                </span>
                <span className="status-icon-slot">
                    <IconCamera size={14} className="icon--muted" />
                </span>
            </div>
            <button className="asset-table__header-cell col-dur sortable" onClick={() => onSort('duration')}>
                STAY <SortIndicator field="duration" />
            </button>
        </div>
    );
}
