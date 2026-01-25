/**
 * Development Authentication Shim
 * 
 * Authenticates directly against the Geotab JSON-RPC API for local development.
 * Uses credentials from .env.local (never committed to source control).
 * 
 * ⚠️ This code is tree-shaken out of production builds!
 */

import type { IGeotabApi } from './GeotabApiFactory';
import type { ApiCall, GeotabCredentials, GeotabSession } from '@/types/geotab';

interface AuthenticateResult {
    credentials: {
        database: string;
        userName: string;
        sessionId: string;
    };
    path: string;
}

interface JsonRpcRequest {
    jsonrpc?: string;
    method: string;
    params: Record<string, unknown>;
    id?: number | string;
}

interface JsonRpcResponse<T> {
    result?: T;
    error?: {
        name: string;
        message: string;
        errors?: { name: string; message: string }[];
    };
    id?: number | string;
}

export class DevAuthShim implements IGeotabApi {
    private session: GeotabSession;
    private baseUrl: string;

    private constructor(session: GeotabSession, baseUrl: string) {
        this.session = session;
        this.baseUrl = baseUrl;
    }

    /**
     * Factory method - authenticates and returns ready-to-use instance
     */
    static async create(credentials: GeotabCredentials): Promise<DevAuthShim> {
        const baseUrl = `https://${credentials.server}/apiv1`;

        console.log(`[DevAuthShim] Authenticating to ${credentials.server}...`);

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'Authenticate',
                params: {
                    database: credentials.database,
                    userName: credentials.userName,
                    password: credentials.password,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`[DevAuthShim] HTTP ${response.status}: ${response.statusText}`);
        }

        const data: JsonRpcResponse<AuthenticateResult> = await response.json();

        if (data.error) {
            throw new Error(`[DevAuthShim] Auth failed: ${data.error.message}`);
        }

        if (!data.result) {
            throw new Error('[DevAuthShim] Auth failed: No result returned');
        }

        const session: GeotabSession = {
            database: data.result.credentials.database,
            userName: data.result.credentials.userName,
            sessionId: data.result.credentials.sessionId,
            path: data.result.path || credentials.server,
        };

        // Validate the path returned by auth - ignore placeholders like 'thisserver'
        const isValidPath = (path: string | undefined): boolean => {
            if (!path) return false;
            // Must contain a dot (be a real hostname) and not be a placeholder
            return path.includes('.') && !path.includes('thisserver');
        };

        // Use the path returned by auth (may redirect to regional server)
        const apiUrl = isValidPath(data.result.path)
            ? `https://${data.result.path}/apiv1`
            : baseUrl;

        console.log(`[DevAuthShim] Authenticated as ${session.userName}@${session.database}`);
        console.log(`[DevAuthShim] Using API URL: ${apiUrl}`);

        return new DevAuthShim(session, apiUrl);
    }

    /**
     * Execute a single API call
     */
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            method,
            params: {
                ...params,
                credentials: {
                    database: this.session.database,
                    userName: this.session.userName,
                    sessionId: this.session.sessionId,
                },
            },
            id: Date.now(),
        };

        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            throw new Error(`[DevAuthShim] HTTP ${response.status}: ${response.statusText}`);
        }

        const data: JsonRpcResponse<T> = await response.json();

        if (data.error) {
            const error = new Error(data.error.message);
            error.name = data.error.name;
            throw error;
        }

        return data.result as T;
    }

    /**
     * Execute multiple API calls using parallel requests with robust throttling
     * 
     * NOTE: We use throttled Promise.all instead of true JSON-RPC Batching because
     * some server environments reject massive batch payloads.
     */
    async multiCall<T extends unknown[]>(calls: ApiCall[]): Promise<T> {
        console.log(`[DevAuthShim] Processing ${calls.length} calls with concurrency limit...`);

        const CONCURRENCY_LIMIT = 5; // Browser safe limit (keep under 6)
        const results: unknown[] = new Array(calls.length);

        // Process in chunks to respect concurrency limit
        for (let i = 0; i < calls.length; i += CONCURRENCY_LIMIT) {
            const chunk = calls.map((call, index) => ({ call, index })).slice(i, i + CONCURRENCY_LIMIT);

            await Promise.all(
                chunk.map(async ({ call, index }) => {
                    try {
                        results[index] = await this.call(call.method, call.params);
                    } catch (error) {
                        const err = error as any;
                        const typeName = call.params.typeName || 'Unknown Type';
                        console.error(`[DevAuthShim] Call failed - ${call.method} ${typeName}:`, err.message);
                        results[index] = []; // Fallback to empty array
                    }
                })
            );
        }

        return results as T;
    }

    /**
     * Get session information
     */
    async getSession(): Promise<GeotabSession> {
        return this.session;
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(): boolean {
        return !!this.session.sessionId;
    }
}
