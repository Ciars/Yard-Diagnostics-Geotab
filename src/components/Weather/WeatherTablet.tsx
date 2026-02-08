import type { WeatherFamily, WeatherIntensity } from '@/lib/weather';
import { WeatherIcon } from './WeatherIcon';
import './WeatherTablet.css';

interface WeatherTabletProps {
    family: WeatherFamily;
    intensity: WeatherIntensity;
    temperatureLabel: string;
    title: string;
    animationKey: string;
}

export function WeatherTablet({
    family,
    intensity,
    temperatureLabel,
    title,
    animationKey
}: WeatherTabletProps) {
    return (
        <span className="weather-tablet" title={title} aria-label={title}>
            <WeatherIcon key={animationKey} family={family} intensity={intensity} />
            <span className="weather-tablet__temp">{temperatureLabel}</span>
        </span>
    );
}
