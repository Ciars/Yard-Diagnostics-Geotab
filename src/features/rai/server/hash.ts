export function fnv1aHash(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function stableObjectHash(value: unknown): string {
    return fnv1aHash(stableStringify(value));
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }

    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`);
    return `{${pairs.join(',')}}`;
}
