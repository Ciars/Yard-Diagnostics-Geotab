
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

async function deepDive() {
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

    console.log('Finding target vehicle HK25FZR...');
    const allDevices = await call('Get', { typeName: 'Device' });
    const v = allDevices.find((d: any) => d.name === 'HK25FZR');

    if (!v) {
        console.log('Vehicle not found.');
        return;
    }

    console.log(`Vehicle HK25FZR ID: ${v.id}`);
    console.log('Fetching ALL StatusData for the last 7 days...');

    // We can't fetch ALL status data easily if there's too much, but we can try to get a sample
    // or fetch unique diagnostics.
    // Geotab doesn't have a "Get Unique Diagnostics for Device" call easily, so we fetch StatusData and filter.
    const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const statusData = await call('Get', {
        typeName: 'StatusData',
        search: {
            deviceSearch: { id: v.id },
            fromDate
        },
        resultsLimit: 10000
    });

    console.log(`Found ${statusData.length} status data records.`);

    const uniqueDiags = new Map();
    statusData.forEach((s: any) => {
        const diagId = s.diagnostic.id;
        if (!uniqueDiags.has(diagId)) {
            uniqueDiags.set(diagId, { count: 1, lastValue: s.data, lastTime: s.dateTime });
        } else {
            const entry = uniqueDiags.get(diagId);
            entry.count++;
            entry.lastValue = s.data;
            entry.lastTime = s.dateTime;
        }
    });

    console.log('\nUnique Diagnostics Reported:');
    const diagEntries = Array.from(uniqueDiags.entries());

    // Fetch diagnostic names for these IDs
    const diagMulticall = diagEntries.map(([id]) => ({
        method: 'Get',
        params: {
            typeName: 'Diagnostic',
            search: { id }
        }
    }));

    const diagDetails = await call('ExecuteMultiCall', { calls: diagMulticall });

    diagEntries.forEach(([id, stats], idx) => {
        const name = diagDetails[idx] && diagDetails[idx][0] ? diagDetails[idx][0].name : 'Unknown';
        console.log(` - [${id}] ${name}: ${stats.count} records, last value: ${stats.lastValue} at ${stats.lastTime}`);
    });
}

deepDive().catch(console.error);
