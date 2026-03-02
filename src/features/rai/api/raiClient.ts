import type { RaiChatRequest, RaiChatResponse } from '@/features/rai/types';

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function parseError(response: Response): Promise<string> {
    try {
        const json = await response.json() as { message?: string };
        return json.message || `Rai request failed with HTTP ${response.status}`;
    } catch {
        return `Rai request failed with HTTP ${response.status}`;
    }
}

export async function postRaiChat(request: RaiChatRequest, signal: AbortSignal): Promise<RaiChatResponse> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const response = await fetch('/api/rai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
            signal,
        });

        if (response.ok) {
            return await response.json() as RaiChatResponse;
        }

        if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
            throw new Error(await parseError(response));
        }

        await sleep(Math.min(400 * 2 ** (attempt - 1), 2_000));
    }

    throw new Error('Rai request failed.');
}

export function hashStableId(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createClientRequestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    return `rai-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
