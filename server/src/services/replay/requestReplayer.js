'use strict';

import axios from 'axios'

const TIMEOUT_MS = 15_000;

/**
 * @typedef {Object} ReplayResult
 * @property {number}      statusCode
 * @property {Object}      headers
 * @property {string}      bodyText
 * @property {Object|null} body
 * @property {number}      durationMs
 */

/**
 * Replay a single HTTP request and capture the full response.
 * Never throws on 4xx/5xx — those are valid IDOR signal.
 * Only throws on network failure or timeout.
 *
 * @param {Object}      options
 * @param {string}      options.url
 * @param {string}      options.method
 * @param {Object}      options.headers
 * @param {string|null} options.cookies
 * @param {Object|null} options.body
 * @returns {Promise<ReplayResult>}
 */
export const replayRequest = async({ url, method, headers, cookies, body }) => {
    // 1. Merge cookies into headers (non-mutating)
    const finalHeaders = { ...headers };
    if (cookies) {
        const existing = finalHeaders['Cookie'] || finalHeaders['cookie'] || '';
        finalHeaders['Cookie'] = existing ? `${existing}; ${cookies}` : cookies;
    }

    // 2. Attach body only for methods that support it
    const bodylessMethods = ['GET', 'HEAD', 'DELETE'];
    const requestBody = !bodylessMethods.includes(method.toUpperCase()) 
        && body 
        && Object.keys(body).length > 0
            ? body  // axios auto-serializes objects to JSON
            : undefined;

    const startTime = Date.now();

    try {
        const response = await axios({
            url,
            method: method.toUpperCase(),
            headers: finalHeaders,
            data: requestBody,
            timeout: TIMEOUT_MS,

            // Critical: don't throw on 4xx/5xx — we WANT to capture those
            validateStatus: () => true,

            // Get raw string for exact diffing; axios won't auto-parse JSON
            responseType: 'text',

            // Don't decompress — keep raw for accurate diffing
            decompress: false,
        });

        const durationMs = Date.now() - startTime;
        const bodyText = response.data; // string because responseType: 'text'

        let parsedBody = null;
        try {
            parsedBody = JSON.parse(bodyText);
        } catch {
            // Non-JSON response is fine — bodyText has the raw content
        }

        return {
            statusCode: response.status,
            headers: response.headers,          // already a plain object in axios
            bodyText,
            body: parsedBody,
            durationMs,
        };
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error(`Request timed out after ${TIMEOUT_MS}ms: ${url}`, { cause: error });
        }
        // Network errors: DNS failure, connection refused, etc.
        throw new Error(`Network error replaying request: ${error.message}`, { cause: error });
    }
}
