import {
    IconBolt,
    IconCloud,
    IconCloudFog,
    IconCloudRain,
    IconCloudSnow,
    IconCloudStorm,
    IconSnowflake,
    IconSun,
    IconTemperature
} from '@tabler/icons-react';
import type { WeatherFamily, WeatherIntensity } from '@/lib/weather';
import './WeatherIcon.css';

interface WeatherIconProps {
    family: WeatherFamily;
    intensity: WeatherIntensity;
    className?: string;
}

const RAIN_FAMILIES: WeatherFamily[] = [
    'drizzle',
    'freezing-drizzle',
    'rain',
    'freezing-rain',
    'rain-showers'
];

const SNOW_FAMILIES: WeatherFamily[] = [
    'snow',
    'snow-grains',
    'snow-showers'
];

function getParticleCount(intensity: WeatherIntensity): number {
    if (intensity === 'heavy') return 3;
    if (intensity === 'moderate') return 2;
    return 1;
}

function renderBaseGlyph(family: WeatherFamily) {
    if (family === 'partly-cloudy') {
        return (
            <span className="weather-icon__duo">
                <IconSun size={16} stroke={1.9} className="weather-icon__sun" />
                <IconCloud size={22} stroke={1.9} className="weather-icon__cloud" />
            </span>
        );
    }

    const iconProps = {
        size: 24,
        stroke: 1.9,
        className: 'weather-icon__glyph'
    };

    if (family === 'clear') return <IconSun {...iconProps} />;
    if (family === 'overcast') return <IconCloud {...iconProps} />;
    if (family === 'fog') return <IconCloudFog {...iconProps} />;
    if (family === 'drizzle' || family === 'rain' || family === 'freezing-drizzle' || family === 'freezing-rain' || family === 'rain-showers') {
        return <IconCloudRain {...iconProps} />;
    }
    if (family === 'snow' || family === 'snow-grains' || family === 'snow-showers') {
        return <IconCloudSnow {...iconProps} />;
    }
    if (family === 'thunderstorm' || family === 'thunderstorm-hail') {
        return <IconCloudStorm {...iconProps} />;
    }

    return <IconTemperature {...iconProps} />;
}

export function WeatherIcon({ family, intensity, className }: WeatherIconProps) {
    const particleCount = getParticleCount(intensity);
    const showRain = RAIN_FAMILIES.includes(family);
    const showSnow = SNOW_FAMILIES.includes(family);
    const showFog = family === 'fog';
    const showBolt = family === 'thunderstorm' || family === 'thunderstorm-hail';
    const showHail = family === 'thunderstorm-hail';
    const showFreezingAccent = family === 'freezing-drizzle' || family === 'freezing-rain';

    return (
        <span className={['weather-icon', `weather-icon--${family}`, `weather-icon--${intensity}`, className].filter(Boolean).join(' ')} aria-hidden="true">
            <span className="weather-icon__base">
                {renderBaseGlyph(family)}
            </span>

            {showFog && (
                <span className="weather-icon__mist-layer">
                    <span className="weather-icon__mist weather-icon__mist--1" />
                    <span className="weather-icon__mist weather-icon__mist--2" />
                </span>
            )}

            {showRain && (
                <span className="weather-icon__precip weather-icon__precip--rain">
                    {Array.from({ length: particleCount }).map((_, index) => (
                        <span key={`drop-${index}`} className={`weather-icon__drop weather-icon__drop--${index + 1}`} />
                    ))}
                </span>
            )}

            {showSnow && (
                <span className="weather-icon__precip weather-icon__precip--snow">
                    {Array.from({ length: particleCount }).map((_, index) => (
                        <IconSnowflake
                            key={`flake-${index}`}
                            size={8}
                            stroke={2}
                            className={`weather-icon__flake weather-icon__flake--${index + 1}`}
                        />
                    ))}
                </span>
            )}

            {showFreezingAccent && (
                <IconSnowflake size={8} stroke={2} className="weather-icon__freeze-accent" />
            )}

            {showBolt && (
                <IconBolt size={10} stroke={2.1} className="weather-icon__bolt" />
            )}

            {showHail && (
                <span className="weather-icon__hail-layer">
                    <span className="weather-icon__hail weather-icon__hail--1" />
                    <span className="weather-icon__hail weather-icon__hail--2" />
                </span>
            )}
        </span>
    );
}
