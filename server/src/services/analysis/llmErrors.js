'use strict';

// ---------------------------------------------------------------------------
// Structured LLM Error Types
// ---------------------------------------------------------------------------

class LLMError extends Error {
    constructor(message, { provider, model, retries, cause } = {}) {
        super(message);
        this.name     = this.constructor.name;
        this.provider = provider ?? null;
        this.model    = model ?? null;
        this.retries  = retries ?? 0;
        this.cause    = cause ?? null;
    }

    toJSON() {
        return {
            name:     this.name,
            message:  this.message,
            provider: this.provider,
            model:    this.model,
            retries:  this.retries,
        };
    }
}

/** Thrown when an LLM call exceeds the configured timeout. */
class LLMTimeoutError extends LLMError {
    constructor(opts = {}) {
        super(`LLM call timed out after ${opts.timeoutMs ?? '?'}ms`, opts);
        this.timeoutMs = opts.timeoutMs ?? null;
    }
}

/** Thrown when the LLM provider returns HTTP 429 (rate limited). */
class LLMRateLimitError extends LLMError {
    constructor(opts = {}) {
        const retryAfter = opts.retryAfterMs ? ` (retry after ${opts.retryAfterMs}ms)` : '';
        super(`LLM rate limited by ${opts.provider ?? 'provider'}${retryAfter}`, opts);
        this.retryAfterMs = opts.retryAfterMs ?? null;
    }
}

/** Thrown when the LLM returns a response that cannot be parsed as valid JSON
 *  or does not match the expected schema. */
class LLMParseError extends LLMError {
    constructor(opts = {}) {
        super(opts.reason ?? 'Failed to parse LLM response', opts);
        this.rawContent = opts.rawContent ?? null;
    }
}

/** Thrown when all providers in the fallback chain have been exhausted. */
class LLMAllProvidersFailedError extends LLMError {
    constructor(errors = [], opts = {}) {
        const names = errors.map(e => e.provider || 'unknown').join(' → ');
        super(`All LLM providers failed: ${names}`, opts);
        this.providerErrors = errors;
    }
}

export { LLMError, LLMTimeoutError, LLMRateLimitError, LLMParseError, LLMAllProvidersFailedError }