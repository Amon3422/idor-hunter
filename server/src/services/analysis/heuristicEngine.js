'use strict';

import { diffJsonObjects } from './diffUtils.js';

const AI_THRESHOLD = 70;

function isFakeSuccess(body) {
    if (!body) return false;
    const bodyStr = typeof body === 'string' ? body.toLowerCase() : JSON.stringify(body).toLowerCase();
    const fakeSuccessIndicators = ['"success":false', '"success": false', '"error":', 'unauthorized', 'forbidden', 'access denied'];
    return fakeSuccessIndicators.some(indicator => bodyStr.includes(indicator));
}

function calculateSizeRatio(bodyA, bodyB) {
    const sizeA = JSON.stringify(bodyA || {}).length;
    const sizeB = JSON.stringify(bodyB || {}).length;
    if (sizeA === 0 && sizeB === 0) return 1;
    if (sizeA === 0 || sizeB === 0) return 0;
    return Math.min(sizeA, sizeB) / Math.max(sizeA, sizeB);
}

/**
 * Evaluate whether two HTTP responses indicate a suspicious IDOR condition.
 *
 * Scoring signals:
 *   +30  Both returned 2xx
 *   +20  Similar response body size (ratio > 0.8)
 *   +20  High structural match (key similarity > 0.9)
 *   +30  Data leakage (value similarity > 0.5)
 *
 * Early exits (score = 0):
 *   - Account B received 401 / 403 / 404
 *   - Account B body contains fake-success indicators
 *
 * @param {import('../replay/requestReplayer').ReplayResult} resA
 * @param {import('../replay/requestReplayer').ReplayResult} resB
 * @returns {{ isSuspicious: boolean, score: number, flags: string[], leakedData?: Object }}
 */
export const evaluateSuspiciousDiff = (resA, resB) => {
    let score = 0;
    const flags = [];

    // 1. Status Code Check
    if (resB.statusCode === 401 || resB.statusCode === 403 || resB.statusCode === 404) {
        return { isSuspicious: false, score: 0, flags: ['Properly Authorized'] };
    }

    if (resA.statusCode >= 200 && resA.statusCode < 300 && resB.statusCode >= 200 && resB.statusCode < 300) {
        score += 30; 
        flags.push('Both returned 2xx Success');
    }

    // 2. Fake 200 OK Check
    if (isFakeSuccess(resB.body)) {
        return { isSuspicious: false, score: 0, flags: ['Fake 200 OK Detected'] };
    }

    // 3. Size Comparison
    const sizeDiffRatio = calculateSizeRatio(resA.body, resB.body);
    if (sizeDiffRatio > 0.8) { 
        score += 20;
        flags.push('Similar response size');
    }

    // 4. JSON Deep Diffing
    const { keySimilarity, valueSimilarity, leakedData } = diffJsonObjects(resA.body, resB.body);
    
    if (keySimilarity > 0.9) { 
        score += 20;
        flags.push('High structural match');
    }

    if (valueSimilarity > 0.5) { 
        score += 30;
        flags.push('Data leakage detected (Value match)');
    } else if (valueSimilarity === 0 && keySimilarity > 0.9) {
        // Same structure but fully different values — this is correct access control behaviour.
        // Do NOT add score here: it would cause false positives on every properly secured endpoint.
        flags.push('Same structure, different data (expected)');
    }

    return {
        isSuspicious: score >= AI_THRESHOLD,
        score,
        flags,
        leakedData 
    };
}


