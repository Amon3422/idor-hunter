'use strict';

import { buildClient, getProviderChain, SYSTEM_PROMPT, LLM_TIMEOUT_MS, LLM_MAX_RETRIES } from '../../config/llm.js';

import { LLMTimeoutError, LLMRateLimitError, LLMParseError, LLMAllProvidersFailedError } from './llmErrors.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sleep with exponential backoff: 1s → 2s → 4s → … */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt) {
    // attempt 0 → 1000, 1 → 2000, 2 → 4000
    return 1000 * Math.pow(2, attempt);
}

/** Returns true for errors considered transient and worth retrying. */
function isRetryable(err) {
    // OpenAI SDK wraps HTTP errors with a `status` property
    if (err.status === 429) return true;           // rate limit
    if (err.status >= 500 && err.status < 600) return true; // server errors
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') return true;
    if (err.name === 'AbortError') return true;    // timeout signal
    return false;
}

/** Classify a provider SDK error into a structured LLM error. */
function classifyError(err, provider, model, retries) {
    const meta = { provider, model, retries, cause: err };

    if (err.status === 429) {
        const retryAfterMs = err.headers?.['retry-after']
            ? parseInt(err.headers['retry-after'], 10) * 1000
            : null;
        return new LLMRateLimitError({ ...meta, retryAfterMs });
    }
    if (err.name === 'AbortError' || err.code === 'ETIMEDOUT') {
        return new LLMTimeoutError({ ...meta, timeoutMs: LLM_TIMEOUT_MS });
    }
    // Generic — preserve original
    return err;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the user message sent to the LLM.
 */
function buildPrompt(request, heuristic, leakedData, responseA, responseB) {
    const truncate = (obj, maxLen = 1500) => {
        const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
        return str.length > maxLen ? str.slice(0, maxLen) + '\n... (truncated)' : str;
    };

    return `## IDOR/BOLA Test Evidence

**Target:** ${request.method} ${request.url}

**Heuristic Score:** ${heuristic.score}/100
**Heuristic Flags:** ${heuristic.flags.join(', ')}

**Leaked Data** (fields with identical values across both accounts):
\`\`\`json
${JSON.stringify(leakedData, null, 2)}
\`\`\`

**Account A Response (legitimate owner):**
- Status: ${responseA.statusCode}
- Body:
\`\`\`json
${truncate(responseA.body)}
\`\`\`

**Account B Response (cross-account attacker):**
- Status: ${responseB.statusCode}
- Body:
\`\`\`json
${truncate(responseB.body)}
\`\`\`

Analyse this evidence and determine whether Account B successfully accessed data that belongs exclusively to Account A.`;
}

// ---------------------------------------------------------------------------
// Single-provider call with retry + exponential backoff
// ---------------------------------------------------------------------------

/**
 * Call a single LLM provider, retrying on transient failures.
 *
 * @param {string} providerName - 'groq' or 'openai'
 * @param {string} userMessage  - The user prompt
 * @returns {Promise<{ parsed: object, meta: { provider: string, model: string, latencyMs: number, retries: number }}>}
 */
async function callWithRetry(providerName, userMessage) {
    const { client, model, provider } = buildClient(providerName);

    let lastError = null;

    for (let attempt = 0; attempt < LLM_MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            const delay = backoffMs(attempt - 1);
            console.log(`LLM retry ${attempt}/${LLM_MAX_RETRIES - 1} for ${provider} after ${delay}ms`);
            await sleep(delay);
        }

        const start = Date.now();
        try {
            const response = await client.chat.completions.create({
                model,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user',   content: userMessage },
                ],
                temperature: 0.2,
            });

            const latencyMs = Date.now() - start;
            const raw = response.choices[0]?.message?.content;

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (parseErr) {
                throw new LLMParseError({
                    reason:     'LLM returned invalid JSON',
                    rawContent: raw,
                    provider,
                    model,
                    retries:    attempt,
                    cause:      parseErr,
                });
            }

            return {
                parsed,
                meta: { provider, model, latencyMs, retries: attempt },
            };
        } catch (err) {
            lastError = err;

            // Non-retryable errors bail out immediately
            if (err instanceof LLMParseError) throw err;
            if (!isRetryable(err)) {
                throw classifyError(err, provider, model, attempt);
            }

            console.warn(`LLM transient error (${provider}, attempt ${attempt + 1}/${LLM_MAX_RETRIES}):`,
                err.status || err.code || err.message);
        }
    }

    // All retries exhausted for this provider
    throw classifyError(lastError, provider, buildClient(providerName).model, LLM_MAX_RETRIES);
}

// ---------------------------------------------------------------------------
// Provider-chain caller (primary → fallback)
// ---------------------------------------------------------------------------

/**
 * Attempt LLM call across all configured providers in order.
 * Returns on first success; throws LLMAllProvidersFailedError if all fail.
 */
async function callLLMWithFallback(userMessage) {
    const chain = getProviderChain();
    if (chain.length === 0) {
        throw new LLMAllProvidersFailedError([], { provider: 'none', model: 'none' });
    }

    const errors = [];

    for (const providerName of chain) {
        try {
            return await callWithRetry(providerName, userMessage);
        } catch (err) {
            console.error(`LLM provider "${providerName}" failed:`, err.message);
            errors.push(err);
        }
    }

    throw new LLMAllProvidersFailedError(errors);
}

// ---------------------------------------------------------------------------
// Validate LLM response shape
// ---------------------------------------------------------------------------

const VALID_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

function validateLLMResponse(parsed, meta) {
    const ctx = { provider: meta.provider, model: meta.model, retries: meta.retries };

    if (typeof parsed.confirmed !== 'boolean')   throw new LLMParseError({ reason: 'LLM response missing "confirmed" boolean', ...ctx });
    if (!VALID_SEVERITIES.has(parsed.severity))   throw new LLMParseError({ reason: `LLM returned invalid severity: ${parsed.severity}`, ...ctx });
    if (typeof parsed.reasoning   !== 'string')   throw new LLMParseError({ reason: 'LLM response missing "reasoning" string', ...ctx });
    if (typeof parsed.reproSteps  !== 'string')   throw new LLMParseError({ reason: 'LLM response missing "reproSteps" string', ...ctx });
    if (typeof parsed.suggestedFix !== 'string')   throw new LLMParseError({ reason: 'LLM response missing "suggestedFix" string', ...ctx });
    return parsed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends suspicious diff evidence to the configured LLM for IDOR analysis.
 * Includes retry with exponential backoff and provider fallback.
 *
 * @param {{ url: string, method: string }} request
 * @param {{ score: number, flags: string[], leakedData: object }} diffResult
 * @param {{ statusCode: number, body: unknown }} responseA
 * @param {{ statusCode: number, body: unknown }} responseB
 * @returns {Promise<{
 *   confirmed: boolean,
 *   severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO',
 *   reasoning: string,
 *   reproSteps: string,
 *   suggestedFix: string,
 *   _meta: { provider: string, model: string, latencyMs: number, retries: number },
 * }>}
 */
async function analyzeWithLLM(request, diffResult, responseA, responseB) {
    const userMessage = buildPrompt(
        request,
        { score: diffResult.score, flags: diffResult.flags },
        diffResult.leakedData,
        responseA,
        responseB,
    );

    const { parsed, meta } = await callLLMWithFallback(userMessage);
    const validated = validateLLMResponse(parsed, meta);

    // Attach metadata for caller to persist
    validated._meta = meta;
    return validated;
}

export { analyzeWithLLM }