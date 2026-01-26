import React, { useEffect, useState } from 'react';
import { useFleetStore, selectSelectedZone } from '../../store/useFleetStore';
import { GeotabApiFactory } from '../../services/GeotabApiFactory';

export const DebugOverlay: React.FC = () => {
    const vehicles = useFleetStore((s) => s.vehicles);
    const selectedZone = useFleetStore(selectSelectedZone);

    const [envType, setEnvType] = useState<string>('Detecting...');
    const [error, setError] = useState<string | null>(null);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [deviceCount, setDeviceCount] = useState<string>('?');

    const log = (msg: string) => setDebugLog(prev => [msg, ...prev].slice(0, 5));

    useEffect(() => {
        const checkEnv = async () => {
            try {
                // Use new detection methods
                const inContext = GeotabApiFactory.isGeotabContext();
                const ready = GeotabApiFactory.isApiReady();

                let status = 'UNKNOWN';
                if (inContext && ready) status = 'PRODUCTION (Ready)';
                else if (inContext && !ready) status = 'PRODUCTION (Waiting for API...)';
                else status = 'DEVELOPMENT (Local)';

                setEnvType(status);

                if (inContext && ready) {
                    const api = await GeotabApiFactory.getInstance();
                    const session = await api.getSession();
                    log(`Session: ${session.userName}`);

                    // Quick check of total fleet size
                    const allDevices = await api.call<unknown[]>('Get', { typeName: 'DeviceStatusInfo', resultsLimit: 10 });
                    setDeviceCount(allDevices.length > 0 ? `Found ${allDevices.length}+ (Sample)` : 'No Data');
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
            maxWidth: '300px',
            maxHeight: '400px',
            overflow: 'auto',
            border: '1px solid #00ff00'
        }}>
            <h3 style={{ margin: '0 0 10px', borderBottom: '1px solid #333' }}>🕵️ Deep Debug</h3>
            <div><strong>Env:</strong> {envType}</div>
            <div><strong>Selected Zone:</strong> {selectedZone?.name || 'None'}</div>
            <div><strong>Vehicles (In Zone):</strong> {vehicles.length}</div>
            <div><strong>API Test:</strong> {deviceCount}</div>

            <div style={{ marginTop: '10px', borderTop: '1px solid #333' }}>
                <strong>Log:</strong>
                {debugLog.map((l, i) => <div key={i} style={{ fontSize: '10px' }}>{l}</div>)}
            </div>

            {error && (
                <div style={{ color: 'red', marginTop: '10px' }}>
                    <strong>LAST ERROR:</strong><br />
                    {error}
                </div>
            )}
        </div>
    );
};
