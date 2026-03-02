export class ConcurrencyGate {
    private inFlightByKey = new Map<string, number>();

    constructor(
        private readonly maxGlobal: number,
        private readonly maxPerKey: number,
    ) { }

    private get globalInFlight(): number {
        let total = 0;
        for (const count of this.inFlightByKey.values()) {
            total += count;
        }
        return total;
    }

    tryAcquire(key: string): boolean {
        const byKey = this.inFlightByKey.get(key) ?? 0;
        if (byKey >= this.maxPerKey) return false;
        if (this.globalInFlight >= this.maxGlobal) return false;

        this.inFlightByKey.set(key, byKey + 1);
        return true;
    }

    release(key: string): void {
        const byKey = this.inFlightByKey.get(key) ?? 0;
        if (byKey <= 1) {
            this.inFlightByKey.delete(key);
            return;
        }

        this.inFlightByKey.set(key, byKey - 1);
    }
}
