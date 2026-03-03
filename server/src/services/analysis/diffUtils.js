'use strict';

export const IGNORED_KEYS = new Set([
    'timestamp', 'created_at', 'updated_at', 'trace_id', 
    'csrf_token', 'session_id', 'nonce', 'request_id', 'last_login', 'date'
]);

/**
 * Flatten a nested JSON object into dot-notation keys.
 * Skips keys in IGNORED_KEYS (timestamp-like noise).
 *
 * @param {Object} obj
 * @param {string} prefix
 * @param {Object} result
 * @returns {Object} flat key/value map
 */
export const flattenJSON = (obj, prefix = '', result = {}) => {
    if (!obj || typeof obj !== 'object') return result;

    for (const [key, value] of Object.entries(obj)) {
        if (IGNORED_KEYS.has(key.toLowerCase())) continue;

        const newKey = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            flattenJSON(value, newKey, result);
        } else if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (item && typeof item === 'object') {
                    flattenJSON(item, `${newKey}[${index}]`, result);
                } else {
                    result[`${newKey}[${index}]`] = item;
                }
            });
        } else {
            result[newKey] = value;
        }
    }
    return result;
}

/**
 * Deep diff two JSON response bodies.
 * Returns key similarity, value similarity, and leaked (identical) data.
 *
 * @param {Object} bodyA
 * @param {Object} bodyB
 * @returns {{ keySimilarity: number, valueSimilarity: number, leakedData: Object }}
 */
export const diffJsonObjects = (bodyA, bodyB) => {
    const flatA = flattenJSON(bodyA);
    const flatB = flattenJSON(bodyB);

    const keysA = Object.keys(flatA);
    const keysB = Object.keys(flatB);

    if (keysA.length === 0 && keysB.length === 0) {
        return { keySimilarity: 1, valueSimilarity: 1 };
    }

    const commonKeys = keysA.filter(key => Object.prototype.hasOwnProperty.call(flatB, key));
    const unionKeysLength = new Set([...keysA, ...keysB]).size;

    const keySimilarity = unionKeysLength === 0 ? 0 : commonKeys.length / unionKeysLength;

    let matchingValuesCount = 0;
    const leakedData = {};

    for (const key of commonKeys) {
        if (flatA[key] === flatB[key]) {
            matchingValuesCount++;
            leakedData[key] = flatA[key];
        }
    }

    const valueSimilarity = commonKeys.length === 0 ? 0 : matchingValuesCount / commonKeys.length;

    return {
        keySimilarity,
        valueSimilarity,
        leakedData
    };
}

