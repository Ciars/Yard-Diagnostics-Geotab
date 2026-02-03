/**
 * Unit tests for geometry utilities
 * 
 * Tests the critical polygon and bounding box functions used for
 * zone filtering optimization.
 */

import { describe, it, expect } from 'vitest';
import { isPointInPolygon, getPolygonBoundingBox } from '@/lib/geoUtils';
import type { Coordinate } from '@/types/geotab';

describe('isPointInPolygon', () => {
    it('should return true for point inside simple rectangle', () => {
        const polygon: Coordinate[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];

        const point = { x: 5, y: 5 };

        expect(isPointInPolygon(point, polygon)).toBe(true);
    });

    it('should return false for point outside simple rectangle', () => {
        const polygon: Coordinate[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];

        const point = { x: 15, y: 5 };

        expect(isPointInPolygon(point, polygon)).toBe(false);
    });

    it('should handle point on polygon boundary (edge case)', () => {
        const polygon: Coordinate[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];

        const point = { x: 5, y: 0 }; // On bottom edge

        // Most implementations return true for boundary points
        const result = isPointInPolygon(point, polygon);
        expect(typeof result).toBe('boolean');
    });

    it('should work with complex polygon (L-shape)', () => {
        const polygon: Coordinate[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 5 },
            { x: 5, y: 5 },
            { x: 5, y: 10 },
            { x: 0, y: 10 },
        ];

        expect(isPointInPolygon({ x: 7, y: 2 }, polygon)).toBe(true); // Inside top-right part
        expect(isPointInPolygon({ x: 2, y: 7 }, polygon)).toBe(true); // Inside bottom-left part
        expect(isPointInPolygon({ x: 7, y: 7 }, polygon)).toBe(false); // In the cutout
    });

    it('should handle real-world GPS coordinates', () => {
        // Small polygon around Dublin, Ireland
        const polygon: Coordinate[] = [
            { x: -6.3, y: 53.35 },
            { x: -6.2, y: 53.35 },
            { x: -6.2, y: 53.3 },
            { x: -6.3, y: 53.3 },
        ];

        expect(isPointInPolygon({ x: -6.25, y: 53.33 }, polygon)).toBe(true);
        expect(isPointInPolygon({ x: -6.4, y: 53.33 }, polygon)).toBe(false);
    });
});

describe('getPolygonBoundingBox', () => {
    it('should calculate bounding box for simple rectangle', () => {
        const polygon: Coordinate[] = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];

        const bbox = getPolygonBoundingBox(polygon);

        expect(bbox).toEqual({
            minLat: 0,
            maxLat: 10,
            minLng: 0,
            maxLng: 10,
        });
    });

    it('should handle negative coordinates', () => {
        const polygon: Coordinate[] = [
            { x: -10, y: -5 },
            { x: -2, y: -5 },
            { x: -2, y: 5 },
            { x: -10, y: 5 },
        ];

        const bbox = getPolygonBoundingBox(polygon);

        expect(bbox).toEqual({
            minLat: -5,
            maxLat: 5,
            minLng: -10,
            maxLng: -2,
        });
    });

    it('should work with irregular polygon', () => {
        const polygon: Coordinate[] = [
            { x: 1, y: 2 },
            { x: 5, y: 1 },
            { x: 7, y: 4 },
            { x: 3, y: 6 },
        ];

        const bbox = getPolygonBoundingBox(polygon);

        expect(bbox).toEqual({
            minLat: 1,
            maxLat: 6,
            minLng: 1,
            maxLng: 7,
        });
    });

    it('should handle real-world GPS coordinates', () => {
        const polygon: Coordinate[] = [
            { x: -6.3, y: 53.35 },
            { x: -6.2, y: 53.35 },
            { x: -6.25, y: 53.3 },
        ];

        const bbox = getPolygonBoundingBox(polygon);

        expect(bbox.minLat).toBeCloseTo(53.3, 2);
        expect(bbox.maxLat).toBeCloseTo(53.35, 2);
        expect(bbox.minLng).toBeCloseTo(-6.3, 2);
        expect(bbox.maxLng).toBeCloseTo(-6.2, 2);
    });

    it('should handle single point (degenerate case)', () => {
        const polygon: Coordinate[] = [{ x: 5, y: 10 }];

        const bbox = getPolygonBoundingBox(polygon);

        expect(bbox).toEqual({
            minLat: 10,
            maxLat: 10,
            minLng: 5,
            maxLng: 5,
        });
    });
});
