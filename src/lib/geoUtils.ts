/**
 * Geographic Utilities
 * 
 * Helper functions for spatial calculations and coordinate geometry.
 */

import type { Coordinate } from '@/types/geotab';

export interface BoundingBox {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
}

/**
 * Calculate bounding box (rectangle) for a polygon
 * Used for fast pre-filtering before expensive point-in-polygon checks
 */
export function getPolygonBoundingBox(points: Coordinate[]): BoundingBox {
    if (!points || points.length === 0) {
        return { minLat: -90, maxLat: 90, minLng: -180, maxLng: 180 };
    }

    let minLat = points[0].y;
    let maxLat = points[0].y;
    let minLng = points[0].x;
    let maxLng = points[0].x;

    for (const point of points) {
        if (point.y < minLat) minLat = point.y;
        if (point.y > maxLat) maxLat = point.y;
        if (point.x < minLng) minLng = point.x;
        if (point.x > maxLng) maxLng = point.x;
    }

    return { minLat, maxLat, minLng, maxLng };
}

/**
 * Check if a point is inside a polygon using ray casting algorithm.
 * 
 * @param point The point to check {x: lon, y: lat}
 * @param polygon The polygon vertices array of {x:lon, y: lat}
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
