import type { IGeotabApi } from '@/services/GeotabApiFactory';
import type { RaiContextSnapshot, RaiToolCall, RaiToolResult, RaiVehicleDetailSnapshot } from '@/features/rai/types';
import { sanitizeGeotabReadGetRequest } from '@/features/rai/shared/geotabReadGuards';

interface ExecuteRaiToolCallDeps {
    api: IGeotabApi | null;
    getContextSnapshot: () => RaiContextSnapshot;
    getExpandedDetail: (vehicleId: string) => RaiVehicleDetailSnapshot | null;
}

const MAX_TOOL_RESULT_PREVIEW_ITEMS = 60;

function compactToolResult(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.slice(0, MAX_TOOL_RESULT_PREVIEW_ITEMS);
    }
    return value;
}

function toToolErrorResult(call: RaiToolCall, message: string): RaiToolResult {
    return {
        toolCallId: call.id,
        name: call.name,
        ok: false,
        error: message,
    };
}

export async function executeRaiToolCall(
    call: RaiToolCall,
    deps: ExecuteRaiToolCallDeps
): Promise<RaiToolResult> {
    if (call.name === 'get_loaded_context_snapshot') {
        return {
            toolCallId: call.id,
            name: call.name,
            ok: true,
            data: deps.getContextSnapshot(),
        };
    }

    if (call.name === 'get_vehicle_detail_by_id') {
        const vehicleId = typeof call.args.vehicleId === 'string' ? call.args.vehicleId : '';
        if (!vehicleId) {
            return toToolErrorResult(call, 'vehicleId is required.');
        }

        const snapshot = deps.getExpandedDetail(vehicleId);
        if (!snapshot) {
            return toToolErrorResult(call, `No expanded detail available for vehicle ${vehicleId}.`);
        }

        return {
            toolCallId: call.id,
            name: call.name,
            ok: true,
            data: snapshot,
        };
    }

    if (call.name === 'geotab_read_get') {
        if (!deps.api) {
            return toToolErrorResult(call, 'Geotab API is not available.');
        }

        const guarded = sanitizeGeotabReadGetRequest(call.args);
        if (!guarded.ok || !guarded.value) {
            return toToolErrorResult(call, guarded.error || 'Invalid read request.');
        }

        const { typeName, search, fromDate, toDate, resultsLimit } = guarded.value;
        const params: Record<string, unknown> = {
            typeName,
            search,
            resultsLimit,
        };

        if (fromDate) params.fromDate = fromDate;
        if (toDate) params.toDate = toDate;

        try {
            const result = await deps.api.call<unknown>('Get', params);
            const safeResult = compactToolResult(result);

            return {
                toolCallId: call.id,
                name: call.name,
                ok: true,
                data: {
                    typeName,
                    resultsLimit,
                    returned: Array.isArray(result) ? result.length : 1,
                    result: safeResult,
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Geotab read call failed.';
            return toToolErrorResult(call, message);
        }
    }

    return toToolErrorResult(call, `Unsupported tool: ${call.name}`);
}

export async function executeRaiToolCalls(
    calls: RaiToolCall[],
    deps: ExecuteRaiToolCallDeps
): Promise<RaiToolResult[]> {
    const results: RaiToolResult[] = [];

    for (const call of calls) {
        // Tool calls are executed sequentially to avoid parallel request bursts against Geotab API.
        const result = await executeRaiToolCall(call, deps);
        results.push(result);
    }

    return results;
}
