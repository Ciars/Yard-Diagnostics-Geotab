import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Zone } from '@/types/geotab';
import { describeWeatherCode, type WeatherFamily, type WeatherIntensity } from '@/lib/weather';

interface ZoneWeather {
    temperatureC: number | null;
    weatherCode: number | null;
    summary: string;
    family: WeatherFamily;
    intensity: WeatherIntensity;
}

function getZoneCentroid(zone: Zone | null): { latitude: number; longitude: number } | null {
    if (!zone?.points || zone.points.length === 0) return null;

    const validPoints = zone.points.filter((point) =>
        Number.isFinite(point.y) && Number.isFinite(point.x)
    );
    if (validPoints.length === 0) return null;

    const totals = validPoints.reduce((acc, point) => {
        acc.lat += point.y;
        acc.lng += point.x;
        return acc;
    }, { lat: 0, lng: 0 });

    return {
        latitude: totals.lat / validPoints.length,
        longitude: totals.lng / validPoints.length
    };
}

export function useZoneWeather(zone: Zone | null, refreshToken: number | undefined) {
    const centroid = useMemo(() => getZoneCentroid(zone), [zone]);

    return useQuery({
        queryKey: ['zone-weather', zone?.id ?? 'none', refreshToken ?? 0],
        enabled: !!zone?.id && !!centroid,
        staleTime: 30_000,
        retry: 1,
        queryFn: async (): Promise<ZoneWeather | null> => {
            if (!centroid) return null;

            const params = new URLSearchParams({
                latitude: centroid.latitude.toString(),
                longitude: centroid.longitude.toString(),
                current: 'temperature_2m,weather_code',
                temperature_unit: 'celsius',
                timezone: 'auto',
                forecast_days: '1'
            });

            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`Weather HTTP ${response.status}`);
            }

            const payload = await response.json() as {
                current?: {
                    temperature_2m?: number;
                    weather_code?: number;
                };
            };

            const temperatureRaw = payload.current?.temperature_2m;
            const weatherCodeRaw = payload.current?.weather_code;
            const temperatureC = typeof temperatureRaw === 'number' ? temperatureRaw : null;
            const weatherCode = typeof weatherCodeRaw === 'number' ? weatherCodeRaw : null;
            const mapped = describeWeatherCode(weatherCode);

            return {
                temperatureC,
                weatherCode,
                summary: mapped.summary,
                family: mapped.family,
                intensity: mapped.intensity
            };
        }
    });
}
