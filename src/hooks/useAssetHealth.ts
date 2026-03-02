import { useState, useEffect, useCallback, useMemo } from 'react';
import type { VehicleData, FaultData, ExceptionEvent, ExtendedDiagnostics } from '@/types/geotab';
import { useGeotabApi } from '@/hooks/useGeotabApi';
import { FleetDataService } from '@/services/FleetDataService';
import { classifyFaults, VehicleFaultSummary } from '@/services/FaultService';
import { useRaiStore } from '@/features/rai/store/useRaiStore';
import { buildExpandedVehicleDetailSnapshot } from '@/features/rai/context/expandedDetailSnapshot';

interface AssetHealthState {
    isLoading: boolean;
    error: string | null;
    faults: FaultData[];
    exceptions: ExceptionEvent[];
    statusData: any[]; // Status logs
    analysis: VehicleFaultSummary | null;
    extendedDiagnostics?: ExtendedDiagnostics;
}

export function useAssetHealth(vehicle: VehicleData) {
    const { api } = useGeotabApi();
    const upsertExpandedDetail = useRaiStore((state) => state.upsertExpandedDetail);
    const lookbackDays = useMemo(() => {
        const MIN_LOOKBACK_DAYS = 30;
        const MAX_LOOKBACK_DAYS = 365;
        const dayMs = 24 * 60 * 60 * 1000;

        const zoneDays = vehicle.zoneDurationMs && vehicle.zoneDurationMs > 0
            ? Math.ceil(vehicle.zoneDurationMs / dayMs)
            : 0;

        const heartbeatMs = vehicle.status?.dateTime ? new Date(vehicle.status.dateTime).getTime() : Number.NaN;
        const staleDays = Number.isNaN(heartbeatMs)
            ? 0
            : Math.max(0, Math.ceil((Date.now() - heartbeatMs) / dayMs));

        const dormantDays = typeof vehicle.dormancyDays === 'number' ? Math.max(0, Math.ceil(vehicle.dormancyDays)) : 0;
        const dynamicDays = Math.max(zoneDays, staleDays, dormantDays);

        return Math.max(MIN_LOOKBACK_DAYS, Math.min(MAX_LOOKBACK_DAYS, dynamicDays));
    }, [vehicle.zoneDurationMs, vehicle.status?.dateTime, vehicle.dormancyDays]);

    const [state, setState] = useState<AssetHealthState>({
        isLoading: true,
        error: null,
        faults: [],
        exceptions: [],
        statusData: [],
        analysis: null,
        extendedDiagnostics: undefined
    });

    const loadHistory = useCallback(async () => {
        if (!api) return;
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const service = new FleetDataService(api);
            // console.log(`[useAssetHealth] Fetching deep history for ${vehicle.device.name}...`);

            const { faults, exceptions, statusData, extendedDiagnostics } = await service.getAssetHealthDetails(
                vehicle.device.id,
                lookbackDays
            );

            const analysis = classifyFaults(faults, exceptions);
            const detailSnapshot = buildExpandedVehicleDetailSnapshot({
                vehicle,
                lookbackDays,
                analysis,
                faults,
                exceptions,
                extendedDiagnostics,
            });
            upsertExpandedDetail(detailSnapshot);

            setState({
                isLoading: false,
                error: null,
                faults,
                exceptions,
                statusData: statusData || [],
                analysis,
                extendedDiagnostics
            });
        } catch (err) {
            console.error('[useAssetHealth] Error:', err);
            const msg = err instanceof Error ? err.message : String(err);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: `Failed to load detailed history: ${msg}`
            }));
        }
    }, [api, lookbackDays, upsertExpandedDetail, vehicle]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    return { ...state, loadHistory, lookbackDays };
}
