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

    const log = (msg: string) => setDebugLog(prev => [msg, ...prev].slice(0, 10));

    useEffect(() => {
        // Listen for custom debug events from FleetDataService
        const handleDebugEvent = (e: CustomEvent) => {
            if (e.detail?.type === 'error') {
                setError(e.detail.message);
                log(`❌ ${e.detail.message}`);
            } else {
                log(`ℹ️ ${e.detail.message}`);
            }
        };

        window.addEventListener('geoyard-debug', handleDebugEvent as EventListener);

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

        return () => {
            window.removeEventListener('geoyard-debug', handleDebugEvent as EventListener);
        };
    }, []);

    return (
        <div style={{
            position: 'fixed',
            bottom: 10,
            right: 10,
            backgroundColor: 'rgba(0,0,0,0.95)',
            color: '#00ff00',
            padding: '1rem',
            borderRadius: '8px',
            zIndex: 99999,
            fontFamily: 'monospace',
            fontSize: '11px',
            width: '320px',
            maxHeight: '500px',
            overflow: 'auto',
            border: '2px solid #00ff00',
            boxShadow: '0 0 10px rgba(0,255,0,0.2)'
        }}>
            <h3 style={{ margin: '0 0 10px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
                <span>🕵️ Deep Debug</span>
                <button onClick={() => { setError(null); setDebugLog([]); }} style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#666' }}>🗑️</button>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '10px' }}>
                <div><strong>Env:</strong> {envType}</div>
                <div><strong>Zone:</strong> {selectedZone?.name || '-'}</div>
                <div><strong>Vehicles:</strong> {vehicles.length}</div>
                <div><strong>API Check:</strong> {deviceCount}</div>
            </div>

            {error && (
                <div style={{
                    color: '#ff3333',
                    marginTop: '10px',
                    padding: '5px',
                    border: '1px solid #ff3333',
                    backgroundColor: 'rgba(255,0,0,0.1)',
                    wordBreak: 'break-word',
                    userSelect: 'text'
                }}>
                    <strong>⚠️ LAST ERROR:</strong><br />
                    {error}
                </div>
            )}

            <div style={{ marginTop: '10px', borderTop: '1px solid #333', paddingTop: '5px' }}>
                <strong>Live Log:</strong>
                <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {debugLog.map((l, i) => (
                        <div key={i} style={{
                            fontSize: '10px',
                            borderBottom: '1px solid #222',
                            paddingBottom: '2px',
                            color: l.startsWith('❌') ? '#ff6666' : '#ccffcc'
                        }}>
                            {l}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
