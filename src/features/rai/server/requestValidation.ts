import type { RaiChatRequest, RaiContextSnapshot, RaiToolResult } from '@/features/rai/types';

const MAX_CONVERSATION_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 1_500;
const MAX_CONTEXT_VISIBLE = 80;
const MAX_TOOL_RESULTS = 8;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function sanitizeText(value: unknown, maxChars: number): string {
    if (typeof value !== 'string') return '';
    const withoutControls = value.replace(/[\u0000-\u001f\u007f]/g, ' ');
    return withoutControls.trim().slice(0, maxChars);
}

function sanitizeToolResults(value: unknown): RaiToolResult[] {
    if (!Array.isArray(value)) return [];

    const allowedNames = new Set<RaiToolResult['name']>([
        'get_loaded_context_snapshot',
        'get_vehicle_detail_by_id',
        'geotab_read_get',
    ]);

    const mapped: Array<RaiToolResult | null> = value.slice(0, MAX_TOOL_RESULTS)
        .map((entry) => {
            if (!isObject(entry)) return null;

            const toolCallId = sanitizeText(entry.toolCallId, 80);
            const name = sanitizeText(entry.name, 60);
            const ok = Boolean(entry.ok);
            const error = sanitizeText(entry.error, 300);
            if (!allowedNames.has(name as RaiToolResult['name'])) return null;

            return {
                toolCallId,
                name: name as RaiToolResult['name'],
                ok,
                data: entry.data,
                error: error || undefined,
            };
        });

    return mapped
        .filter((entry): entry is RaiToolResult => entry !== null && entry.toolCallId.length > 0);
}

function sanitizeContext(raw: unknown): RaiContextSnapshot | null {
    if (!isObject(raw)) return null;

    const context = raw as unknown as RaiContextSnapshot;
    if (!isObject(context.app) || !isObject(context.summary) || !isObject(context.entityReferences)) {
        return null;
    }

    const visibleVehicles = Array.isArray(context.visibleVehicles)
        ? context.visibleVehicles.slice(0, MAX_CONTEXT_VISIBLE)
        : [];

    return {
        ...context,
        builtAt: sanitizeText(context.builtAt, 40),
        visibleVehicles,
        app: {
            ...context.app,
            selectedZoneName: sanitizeText(context.app.selectedZoneName, 120) || null,
            activeKpiFilter: sanitizeText(context.app.activeKpiFilter, 40) || null,
            searchQuery: sanitizeText(context.app.searchQuery, 120),
            sortField: sanitizeText(context.app.sortField, 30),
            sortDirection: sanitizeText(context.app.sortDirection, 10),
        },
    };
}

export function validateAndSanitizeRaiChatRequest(input: unknown): { ok: boolean; request?: RaiChatRequest; error?: string } {
    if (!isObject(input)) {
        return { ok: false, error: 'Invalid payload.' };
    }

    const requestId = sanitizeText(input.requestId, 80);
    const sessionId = sanitizeText(input.sessionId, 120);
    const userHash = sanitizeText(input.userHash, 120);

    if (!requestId || !sessionId || !userHash) {
        return { ok: false, error: 'Missing request identity fields.' };
    }

    if (!Array.isArray(input.conversation) || input.conversation.length === 0) {
        return { ok: false, error: 'Conversation is required.' };
    }

    const conversation = input.conversation
        .slice(-MAX_CONVERSATION_MESSAGES)
        .map((entry) => {
            if (!isObject(entry)) return null;

            const role = sanitizeText(entry.role, 20) as 'user' | 'assistant';
            if (role !== 'user' && role !== 'assistant') return null;

            const text = sanitizeText(entry.text, MAX_MESSAGE_CHARS);
            if (!text) return null;

            const createdAt = typeof entry.createdAt === 'number' ? entry.createdAt : Date.now();
            return { role, text, createdAt };
        })
        .filter((entry): entry is RaiChatRequest['conversation'][number] => entry !== null);

    if (conversation.length === 0) {
        return { ok: false, error: 'Conversation has no valid messages.' };
    }

    const context = sanitizeContext(input.context);
    if (!context) {
        return { ok: false, error: 'Context payload is required.' };
    }

    return {
        ok: true,
        request: {
            requestId,
            sessionId,
            userHash,
            conversation,
            context,
            toolResults: sanitizeToolResults(input.toolResults),
        },
    };
}
