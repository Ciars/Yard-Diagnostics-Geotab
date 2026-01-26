import React, { useEffect, useState } from 'react';
import { useFleetStore } from '../../store/useFleetStore';
import { GeotabApiFactory } from '../../services/GeotabApiFactory';

export const DebugOverlay: React.FC = () => {
    const { vehicles, lastUpdated, isPollingPaused } = useFleetStore();
    const [envType, setEnvType] = useState<string>('Detecting...');
    const [error, setError] = useState<string | null>(null);
    const [windowPayload, setWindowPayload] = useState<string>('');

    useEffect(() => {
        const checkEnv = async () => {
            try {
                const isProd = GeotabApiFactory.isProductionEnvironment();
                setEnvType(isProd ? 'PRODUCTION (window.api found)' : 'DEVELOPMENT (DevAuthShim)');

                // Inspect window object for debugging
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const w = window as any;
                const debugInfo = {
                    hasApi: !!w.api,
                    hasGeotab: !!w.geotab,
                    location: window.location.href,
                    params: window.location.search
                };
                setWindowPayload(JSON.stringify(debugInfo, null, 2));

                if (isProd) {
                    // Test a simple call
                    const api = await GeotabApiFactory.getInstance();
                    const session = await api.getSession();
                    console.log('Session retrieved:', session);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
        };

        checkEnv();
    }, []);

    return (
        <div style={{
            position: 'fixed',
            bottom: 10,
            right: 10,
            backgroundColor: 'rgba(0,0,0,0.9)',
            color: '#00ff00',
            padding: '1rem',
            borderRadius: '8px',
            zIndex: 99999,
            fontFamily: 'monospace',
            fontSize: '12px',
            maxWidth: '400px',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '1px solid #00ff00'
        }}>
            <h3 style={{ margin: '0 0 10px', borderBottom: '1px solid #333' }}>🕵️ Debug Console</h3>
            <div><strong>Env:</strong> {envType}</div>
            <div><strong>Vehicles:</strong> {vehicles.length}</div>
            <div><strong>Last Upd:</strong> {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}</div>
            <div><strong>Polling:</strong> {isPollingPaused ? 'PAUSED' : 'ACTIVE'}</div>

            {error && (
                <div style={{ color: 'red', marginTop: '10px' }}>
                    <strong>LAST ERROR:</strong><br />
                    {error}
                </div>
            )}

            <div style={{ marginTop: '10px' }}>
                <strong>Window State:</strong>
                <pre style={{ margin: 0, fontSize: '10px' }}>
                    {windowPayload}
                </pre>
            </div>
        </div>
    );
};
