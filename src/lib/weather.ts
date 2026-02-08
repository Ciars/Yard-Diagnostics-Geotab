export type WeatherIntensity = 'light' | 'moderate' | 'heavy';

export type WeatherFamily =
    | 'clear'
    | 'partly-cloudy'
    | 'overcast'
    | 'fog'
    | 'drizzle'
    | 'freezing-drizzle'
    | 'rain'
    | 'freezing-rain'
    | 'snow'
    | 'snow-grains'
    | 'rain-showers'
    | 'snow-showers'
    | 'thunderstorm'
    | 'thunderstorm-hail'
    | 'unknown';

export interface WeatherDescriptor {
    family: WeatherFamily;
    intensity: WeatherIntensity;
    summary: string;
}

const UNKNOWN_WEATHER: WeatherDescriptor = {
    family: 'unknown',
    intensity: 'light',
    summary: 'Unknown conditions'
};

const WEATHER_CODE_MAP: Record<number, WeatherDescriptor> = {
    0: { family: 'clear', intensity: 'light', summary: 'Clear sky' },
    1: { family: 'partly-cloudy', intensity: 'light', summary: 'Mainly clear' },
    2: { family: 'partly-cloudy', intensity: 'moderate', summary: 'Partly cloudy' },
    3: { family: 'overcast', intensity: 'moderate', summary: 'Overcast' },
    45: { family: 'fog', intensity: 'moderate', summary: 'Fog' },
    48: { family: 'fog', intensity: 'heavy', summary: 'Depositing rime fog' },
    51: { family: 'drizzle', intensity: 'light', summary: 'Light drizzle' },
    53: { family: 'drizzle', intensity: 'moderate', summary: 'Moderate drizzle' },
    55: { family: 'drizzle', intensity: 'heavy', summary: 'Dense drizzle' },
    56: { family: 'freezing-drizzle', intensity: 'light', summary: 'Light freezing drizzle' },
    57: { family: 'freezing-drizzle', intensity: 'heavy', summary: 'Dense freezing drizzle' },
    61: { family: 'rain', intensity: 'light', summary: 'Slight rain' },
    63: { family: 'rain', intensity: 'moderate', summary: 'Moderate rain' },
    65: { family: 'rain', intensity: 'heavy', summary: 'Heavy rain' },
    66: { family: 'freezing-rain', intensity: 'light', summary: 'Light freezing rain' },
    67: { family: 'freezing-rain', intensity: 'heavy', summary: 'Heavy freezing rain' },
    71: { family: 'snow', intensity: 'light', summary: 'Slight snowfall' },
    73: { family: 'snow', intensity: 'moderate', summary: 'Moderate snowfall' },
    75: { family: 'snow', intensity: 'heavy', summary: 'Heavy snowfall' },
    77: { family: 'snow-grains', intensity: 'moderate', summary: 'Snow grains' },
    80: { family: 'rain-showers', intensity: 'light', summary: 'Slight rain showers' },
    81: { family: 'rain-showers', intensity: 'moderate', summary: 'Moderate rain showers' },
    82: { family: 'rain-showers', intensity: 'heavy', summary: 'Violent rain showers' },
    85: { family: 'snow-showers', intensity: 'light', summary: 'Slight snow showers' },
    86: { family: 'snow-showers', intensity: 'heavy', summary: 'Heavy snow showers' },
    95: { family: 'thunderstorm', intensity: 'moderate', summary: 'Thunderstorm' },
    96: { family: 'thunderstorm-hail', intensity: 'moderate', summary: 'Thunderstorm with slight hail' },
    99: { family: 'thunderstorm-hail', intensity: 'heavy', summary: 'Thunderstorm with heavy hail' }
};

export function describeWeatherCode(code: number | null): WeatherDescriptor {
    if (code === null) return UNKNOWN_WEATHER;
    return WEATHER_CODE_MAP[code] ?? UNKNOWN_WEATHER;
}
