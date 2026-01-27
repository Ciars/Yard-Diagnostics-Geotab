
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach((line: string) => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const credentials = {
    server: env.VITE_GEOTAB_SERVER,
    database: env.VITE_GEOTAB_DATABASE,
    userName: env.VITE_GEOTAB_USERNAME,
    password: env.VITE_GEOTAB_PASSWORD,
};

async function testGlobalSearch() {
    const baseUrl = `https://${credentials.server}/apiv1`;
    const authRes = await fetch(baseUrl, {
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

    const authData = await authRes.json();
    const session = {
        database: authData.result.credentials.database,
        userName: authData.result.credentials.userName,
        sessionId: authData.result.credentials.sessionId,
    };
    const apiUrl = authData.result.path.includes('.') ? `https://${authData.result.path}/apiv1` : baseUrl;

    const call = async (method: string, params: any) => {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method,
                params: { ...params, credentials: session },
                id: Date.now()
            }),
        });
        const data = await res.json();
        return data.result;
    };

    const cameraDiagIds = [
        'abVlGQsHdkkypYl_qqR648Q', // Road-facing camera status
        'agOuG7rbW8E6XflBF30wmyQ', // Insights - Camera online
        'aVxmItJBs5EWZHWFBo3GNBg', // Driver camera status
        'aOzdYMcJkw06ft9g4uXvpIA'  // Video device health
    ];

    console.log('Testing GLOBAL diagnostic search...');
    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const multicall = cameraDiagIds.map(diagId => ({
        method: 'Get',
        params: {
            typeName: 'StatusData',
            search: {
                diagnosticSearch: { id: diagId },
                fromDate
            },
            resultsLimit: 1000
        }
    }));

    const results = await call('ExecuteMultiCall', { calls: multicall });

    results.forEach((r: any[], idx: number) => {
        console.log(`Diagnostic ${cameraDiagIds[idx]}: Found ${r ? r.length : 0} records.`);
        if (r && r.length > 0) {
            const sampleDevices = [...new Set(r.map(item => item.device.id))];
            console.log(` - Devices reported: ${sampleDevices.join(', ')}`);
        }
    });

    // Also check if HK25FZR and KP25VBV are in the results
    const allDevices = await call('Get', { typeName: 'Device' });
    const targetVehicles = allDevices.filter((v: any) => v.name === 'HK25FZR' || v.name === 'KP25VBV');

    console.log('\nTarget Vehicle Summary:');
    targetVehicles.forEach((v: any) => {
        const found = results.some((r: any[]) => r && r.some(item => item.device.id === v.id));
        console.log(`Vehicle ${v.name} (${v.id}): ${found ? 'FOUND' : 'NOT FOUND'} in global diagnostic scan.`);
    });
}

testGlobalSearch().catch(console.error);
