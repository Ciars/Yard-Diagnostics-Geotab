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

    /**
     * Load cached VIN data from localStorage
     */
    private loadCache(): VinCache {
        try {
            const stored = localStorage.getItem(CACHE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.version === CACHE_VERSION) {
                    return parsed.data || {};
                }
            }
        } catch (e) {
            console.warn('[VinDecoder] Cache load failed:', e);
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
        } catch (e) {
            console.warn('[VinDecoder] Cache save failed:', e);
        }
    }

    /**
     * Get cached VIN decode result
     */
    getCached(vin: string): DecodedVin | undefined {
        return this.cache[vin];
    }

    /**
     * Decode a batch of VINs using the Geotab DecodeVins API
     * Only decodes VINs not already in cache
     */
    async decodeVins(vins: string[]): Promise<Map<string, DecodedVin>> {
        const result = new Map<string, DecodedVin>();
        const vinsToFetch: string[] = [];

        // Check cache first
        for (const vin of vins) {
            if (!vin || vin.length < 11) continue; // VINs must be at least 11 chars

            const cached = this.cache[vin];
            if (cached) {
                result.set(vin, cached);
            } else {
                vinsToFetch.push(vin);
            }
        }

        // Fetch uncached VINs
        if (vinsToFetch.length > 0) {
            try {
                console.log(`[VinDecoder] Decoding ${vinsToFetch.length} VINs...`);

                const decoded = await this.api.call<DecodedVin[]>('DecodeVins', {
                    vins: vinsToFetch
                });

                if (decoded && Array.isArray(decoded)) {
                    for (const item of decoded) {
                        if (item.vin) {
                            this.cache[item.vin] = item;
                            result.set(item.vin, item);
                        }
                    }
                    this.saveCache();
                    console.log(`[VinDecoder] Successfully decoded ${decoded.length} VINs`);
                }
            } catch (error) {
                console.error('[VinDecoder] DecodeVins API failed:', error);
                // Don't throw - gracefully degrade to showing "--" for make/model
            }
        }

        return result;
    }

    /**
     * Format decoded VIN as "Make Model" string
     */
    static formatMakeModel(decoded: DecodedVin | undefined): string | undefined {
        if (!decoded || !decoded.make) return undefined;

        const make = decoded.make.trim();
        const model = decoded.model?.trim() || '';

        if (model) {
            return `${make} ${model}`;
        }
        return make;
    }

    /**
     * Clear the VIN cache (for debugging)
     */
    clearCache(): void {
        this.cache = {};
        localStorage.removeItem(CACHE_KEY);
    }
}
