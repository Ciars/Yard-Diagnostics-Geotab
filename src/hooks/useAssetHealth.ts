import { useState, useEffect, useCallback } from 'react';
import type { VehicleData, FaultData, ExceptionEvent, ExtendedDiagnostics } from '@/types/geotab';
import { useGeotabApi } from '@/hooks/useGeotabApi';
import { FleetDataService } from '@/services/FleetDataService';
import { classifyFaults, VehicleFaultSummary } from '@/services/FaultService';

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

            const { faults, exceptions, statusData, extendedDiagnostics } = await service.getAssetHealthDetails(vehicle.device.id);

            const analysis = classifyFaults(faults, exceptions);

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
    }, [api, vehicle.device.id]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    return { ...state, loadHistory };
}
