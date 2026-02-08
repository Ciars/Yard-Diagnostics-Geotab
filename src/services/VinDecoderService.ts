/**
 * VIN Decoder Service
 * 
 * Uses Geotab DecodeVins API to get Make/Model from Vehicle Identification Numbers.
 * Results are cached in localStorage since VIN data is static.
 */

import type { IGeotabApi } from '@/services/GeotabApiFactory';

export interface DecodedVin {
    vin: string;
    make: string;
    model: string;
    year?: number;
    vehicleType?: string;
    manufacturer?: string;
}

interface VinCache {
    [vin: string]: DecodedVin;
}

const CACHE_KEY = 'geoyard_vin_cache';
const CACHE_VERSION = 1;

/**
 * VIN Decoder Service - decodes VINs to get Make/Model information
 */
export class VinDecoderService {
    private api: IGeotabApi;
    private cache: VinCache;

    constructor(api: IGeotabApi) {
        this.api = api;
        this.cache = this.loadCache();
    }

    private normalizeVin(vin: string): string {
        return vin.trim().toUpperCase();
    }

    /**
     * Load cached VIN data from localStorage
     */
    private loadCache(): VinCache {
        try {
            const stored = localStorage.getItem(CACHE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.version === CACHE_VERSION) {
                    const raw = parsed.data || {};
                    const normalized: VinCache = {};
                    Object.entries(raw).forEach(([key, value]) => {
                        const normalizedVin = this.normalizeVin(key);
                        normalized[normalizedVin] = value as DecodedVin;
                    });
                    return normalized;
                }
            }
        } catch (_error) {
            // console.warn('[VinDecoder] Cache load failed:', e);
        }
        return {};
    }

    /**
     * Save VIN cache to localStorage
     */
    private saveCache(): void {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                version: CACHE_VERSION,
                data: this.cache
            }));
        } catch (_error) {
            // console.warn('[VinDecoder] Cache save failed:', e);
        }
    }

    /**
     * Get cached VIN decode result
     */
    getCached(vin: string): DecodedVin | undefined {
        const normalizedVin = this.normalizeVin(vin);
        return this.cache[normalizedVin] || this.cache[vin];
    }

    /**
     * Decode a batch of VINs using the Geotab DecodeVins API
     * Only decodes VINs not already in cache
     */
    async decodeVins(vins: string[]): Promise<Map<string, DecodedVin>> {
        const result = new Map<string, DecodedVin>();
        const vinsToFetch: string[] = [];
        const queued = new Set<string>();

        // Check cache first
        for (const rawVin of vins) {
            if (!rawVin) continue;
            const vin = this.normalizeVin(rawVin);
            if (vin.length < 11) continue; // VINs must be at least 11 chars

            const cached = this.cache[vin];
            if (cached) {
                result.set(vin, cached);
            } else if (!queued.has(vin)) {
                vinsToFetch.push(vin);
                queued.add(vin);
            }
        }

        // Fetch uncached VINs
        if (vinsToFetch.length > 0) {
            try {
                // console.log(`[VinDecoder] Decoding ${vinsToFetch.length} VINs...`);

                const decoded = await this.api.call<DecodedVin[]>('DecodeVins', {
                    vins: vinsToFetch
                });

                if (decoded && Array.isArray(decoded)) {
                    for (const item of decoded) {
                        if (item.vin) {
                            const normalizedVin = this.normalizeVin(item.vin);
                            const normalizedItem = {
                                ...item,
                                vin: normalizedVin
                            };
                            this.cache[normalizedVin] = normalizedItem;
                            result.set(normalizedVin, normalizedItem);
                        }
                    }
                    this.saveCache();
                    // console.log(`[VinDecoder] Successfully decoded ${decoded.length} VINs`);
                }
            } catch (_error) {
                // console.error('[VinDecoder] DecodeVins API failed:', error);
                // Don't throw - gracefully degrade to showing "--" for make/model
            }
        }

        return result;
    }

    /**
     * Format decoded VIN as "Make Model" string
     */
    static formatMakeModel(decoded: DecodedVin | undefined): string | undefined {
        if (!decoded) return undefined;

        const make = decoded.make?.trim() || '';
        const model = decoded.model?.trim() || '';

        if (make && model) {
            return `${make} ${model}`;
        }
        if (make) return make;
        if (model) return model;
        return undefined;
    }

    /**
     * Clear the VIN cache (for debugging)
     */
    clearCache(): void {
        this.cache = {};
        localStorage.removeItem(CACHE_KEY);
    }
}
