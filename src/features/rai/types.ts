import type { KpiCounts } from '@/types/geotab';

export type RaiRole = 'user' | 'assistant';

export interface RaiMessage {
    id: string;
    role: RaiRole;
    text: string;
    createdAt: number;
    cites?: string[];
    usedData?: string[];
}

export type RaiToolName =
    | 'get_loaded_context_snapshot'
    | 'get_vehicle_detail_by_id'
    | 'geotab_read_get';

export interface RaiToolCall {
    id: string;
    name: RaiToolName;
    args: Record<string, unknown>;
}

export interface RaiToolResult {
    toolCallId: string;
    name: RaiToolName;
    ok: boolean;
    data?: unknown;
    error?: string;
}

export interface RaiVehicleReference {
    id: string;
    name: string;
    driverName?: string;
    isOffline: boolean;
    isCharging: boolean;
    hasCriticalFaults: boolean;
    hasUnrepairedDefects: boolean;
    dormancyDays: number | null;
    zoneDurationHours: number | null;
}

export interface RaiVehicleDetailSnapshot {
    vehicleId: string;
    capturedAt: string;
    lookbackDays: number;
    diagnostics: {
        batteryVoltage?: number;
        fuelLevel?: number;
        stateOfCharge?: number;
        engineHours?: number;
        odometer?: number;
        defLevel?: number;
        coolantTemp?: number;
        engineSpeed?: number;
        electricalSystemRating?: number;
    };
    faults: {
        ongoingCount: number;
        severeCount: number;
        historicalCount: number;
        recentFaultLabels: string[];
    };
    exceptions: {
        activeCount: number;
    };
    dvir: {
        openDefectCount: number;
        latestInspectionAt?: string;
    };
    timeline: {
        lastHeartbeat?: string;
        dormancyDays: number | null;
        zoneDurationHours: number | null;
    };
    dataSources: string[];
}

export interface RaiContextSnapshot {
    builtAt: string;
    app: {
        selectedZoneId: string | null;
        selectedZoneName: string | null;
        activeKpiFilter: string | null;
        searchQuery: string;
        sortField: string;
        sortDirection: string;
        expandedVehicleId: string | null;
        kpis: KpiCounts;
    };
    summary: {
        totalVehiclesInZone: number;
        visibleVehicles: number;
        criticalCount: number;
        silentCount: number;
        chargingCount: number;
        dormantCount: number;
        unrepairedDvirCount: number;
    };
    focus: {
        expandedVehicleId: string | null;
        expandedVehicleName: string | null;
        detail: RaiVehicleDetailSnapshot | null;
    };
    visibleVehicles: RaiVehicleReference[];
    entityReferences: {
        zoneId: string | null;
        vehicleIds: string[];
        visibleVehicleIds: string[];
    };
}

export interface RaiChatRequest {
    requestId: string;
    sessionId: string;
    userHash: string;
    conversation: Array<Pick<RaiMessage, 'role' | 'text' | 'createdAt'>>;
    context: RaiContextSnapshot;
    toolResults?: RaiToolResult[];
}

export type RaiChatResponse =
    | {
        type: 'answer';
        requestId: string;
        answer: string;
        cites: string[];
        usedData: string[];
    }
    | {
        type: 'tool_call';
        requestId: string;
        calls: RaiToolCall[];
    }
    | {
        type: 'error';
        requestId: string;
        message: string;
    };

export interface RaiSuggestedPrompt {
    id: string;
    label: string;
    prompt: string;
}
