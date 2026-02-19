import type { GeotabCredentials } from '@/types/geotab';

export function getDevShimCredentials(): GeotabCredentials | null {
    const database = import.meta.env.VITE_GEOTAB_DATABASE;
    const userName = import.meta.env.VITE_GEOTAB_USERNAME;
    const password = import.meta.env.VITE_GEOTAB_PASSWORD;

    if (!database || !userName || !password) {
        return null;
    }

    return {
        server: import.meta.env.VITE_GEOTAB_SERVER || 'my.geotab.com',
        database,
        userName,
        password
    };
}
