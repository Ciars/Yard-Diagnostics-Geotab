/**
 * Geographic Utilities
 * 
 * Helper functions for spatial calculations and coordinate geometry.
 */

import type { Coordinate } from '@/types/geotab';

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 * 
 * @param point The point to check {x: lon, y: lat}
 * @param polygon The polygon vertices array of {x: lon, y: lat}
 * @returns true if point contains polygon
 */
export function isPointInPolygon(point: Coordinate, polygon: Coordinate[] | undefined): boolean {
    if (!polygon || polygon.length < 3) return false;

    let inside = false;
    const { x, y } = point;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
}
