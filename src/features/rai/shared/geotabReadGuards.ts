export const ALLOWED_GEOTAB_READ_TYPES = [
    'Device',
    'DeviceStatusInfo',
    'FaultData',
    'ExceptionEvent',
    'StatusData',
    'Trip',
    'DVIRLog',
    'DVIRDefect',
    'LogRecord',
    'Zone',
    'ChargeEvent',
] as const;

export type AllowedGeotabReadType = (typeof ALLOWED_GEOTAB_READ_TYPES)[number];

export interface GeotabReadGetRequest {
    method: 'Get';
    typeName: AllowedGeotabReadType;
    search?: Record<string, unknown>;
    fromDate?: string;
    toDate?: string;
    resultsLimit: number;
}

export interface GuardedValue<T> {
    ok: boolean;
    value?: T;
    error?: string;
}

const READ_ONLY_METHOD = 'Get';
const MAX_RESULTS_LIMIT = 250;
const DEFAULT_RESULTS_LIMIT = 100;
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_OBJECT_DEPTH = 3;
const MAX_OBJECT_KEYS = 40;
const MAX_ARRAY_LENGTH = 50;
const FORBIDDEN_FIELD_FRAGMENTS = ['add', 'set', 'remove', 'delete', 'update', 'execute', 'command'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIsoDate(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.trim().length === 0) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString();
}

function clampResultsLimit(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RESULTS_LIMIT;
    return Math.max(1, Math.min(MAX_RESULTS_LIMIT, Math.round(value)));
}

function sanitizeSearchValue(value: unknown, depth: number): unknown {
    if (depth > MAX_OBJECT_DEPTH) return undefined;

    if (
        value === null
        || typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
    ) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_LENGTH)
            .map((entry) => sanitizeSearchValue(entry, depth + 1))
            .filter((entry) => entry !== undefined);
    }

    if (!isPlainObject(value)) return undefined;

    const output: Record<string, unknown> = {};
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);

    for (const [key, entryValue] of entries) {
        const normalizedKey = key.toLowerCase();
        if (FORBIDDEN_FIELD_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment))) {
            continue;
        }

        const cleaned = sanitizeSearchValue(entryValue, depth + 1);
        if (cleaned !== undefined) {
            output[key] = cleaned;
        }
    }

    return output;
}

export function sanitizeGeotabReadGetRequest(input: unknown): GuardedValue<GeotabReadGetRequest> {
    if (!isPlainObject(input)) {
        return { ok: false, error: 'Tool payload must be an object.' };
    }

    const rawMethod = typeof input.method === 'string' ? input.method : READ_ONLY_METHOD;
    if (rawMethod !== READ_ONLY_METHOD) {
        return { ok: false, error: 'Only Geotab Get read operations are allowed.' };
    }

    const typeName = typeof input.typeName === 'string' ? input.typeName : '';
    if (!ALLOWED_GEOTAB_READ_TYPES.includes(typeName as AllowedGeotabReadType)) {
        return { ok: false, error: `Entity type ${typeName || 'unknown'} is not allowed.` };
    }

    const fromDate = normalizeIsoDate(input.fromDate);
    const toDate = normalizeIsoDate(input.toDate);

    if ((input.fromDate && !fromDate) || (input.toDate && !toDate)) {
        return { ok: false, error: 'Date filters must be valid ISO dates.' };
    }

    if (fromDate && toDate) {
        const delta = new Date(toDate).getTime() - new Date(fromDate).getTime();
        if (delta < 0) {
            return { ok: false, error: 'toDate must be after fromDate.' };
        }
        if (delta > MAX_RANGE_MS) {
            return { ok: false, error: 'Date window exceeds the maximum of 31 days.' };
        }
    }

    const resultsLimit = clampResultsLimit(input.resultsLimit);

    const sanitizedSearch = sanitizeSearchValue(input.search, 0);
    const search = isPlainObject(sanitizedSearch) ? sanitizedSearch : undefined;

    return {
        ok: true,
        value: {
            method: READ_ONLY_METHOD,
            typeName: typeName as AllowedGeotabReadType,
            search,
            fromDate,
            toDate,
            resultsLimit,
        },
    };
}
