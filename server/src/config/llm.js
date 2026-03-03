'use strict';

import OpenAI from 'openai'
import 'dotenv/config'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LLM_PROVIDER          = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
const LLM_FALLBACK_PROVIDER = (process.env.LLM_FALLBACK_PROVIDER || '').toLowerCase() || null;
const LLM_TIMEOUT_MS        = parseInt(process.env.LLM_TIMEOUT_MS, 10) || 30_000;
const LLM_MAX_RETRIES       = parseInt(process.env.LLM_MAX_RETRIES, 10) || 3;

const PROVIDER_CONFIG = {
    groq: {
        model:   process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        apiKey:  () => process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
    },
    openai: {
        model:   process.env.OPENAI_MODEL || 'gpt-4o',
        apiKey:  () => process.env.OPENAI_API_KEY,
        baseURL: undefined, // default OpenAI endpoint
    },
};

/**
 * Build an OpenAI-compatible client for the given provider name.
 * @param {string} providerName - 'groq' or 'openai'
 * @returns {{ client: OpenAI, model: string, provider: string }}
 */
function buildClient(providerName) {
    const name = (providerName || LLM_PROVIDER).toLowerCase();
    const cfg  = PROVIDER_CONFIG[name];
    if (!cfg) throw new Error(`Unknown LLM provider: ${name}`);

    const client = new OpenAI({
        apiKey:  cfg.apiKey(),
        baseURL: cfg.baseURL,
        timeout: LLM_TIMEOUT_MS,
    });

    return { client, model: cfg.model, provider: name };
}

/**
 * Returns the ordered provider chain: [primary, fallback?]
 * Skips providers without a configured API key.
 * @returns {string[]}
 */
function getProviderChain() {
    const chain = [LLM_PROVIDER];
    if (LLM_FALLBACK_PROVIDER && LLM_FALLBACK_PROVIDER !== LLM_PROVIDER) {
        chain.push(LLM_FALLBACK_PROVIDER);
    }
    // Filter out providers missing API keys
    return chain.filter(name => {
        const cfg = PROVIDER_CONFIG[name];
        return cfg && cfg.apiKey();
    });
}

/**
 * Validate that at least the primary provider has a usable API key.
 * Call at startup for fail-fast behaviour.
 * @returns {{ valid: boolean, warnings: string[] }}
 */
function validateLLMConfig() {
    const warnings = [];
    const primary = PROVIDER_CONFIG[LLM_PROVIDER];

    if (!primary) {
        return { valid: false, warnings: [`Unknown LLM_PROVIDER: ${LLM_PROVIDER}`] };
    }
    if (!primary.apiKey()) {
        return { valid: false, warnings: [`Missing API key for primary LLM provider "${LLM_PROVIDER}"`] };
    }
    if (LLM_FALLBACK_PROVIDER) {
        const fb = PROVIDER_CONFIG[LLM_FALLBACK_PROVIDER];
        if (!fb) {
            warnings.push(`Unknown LLM_FALLBACK_PROVIDER: ${LLM_FALLBACK_PROVIDER}`);
        } else if (!fb.apiKey()) {
            warnings.push(`Missing API key for fallback provider "${LLM_FALLBACK_PROVIDER}" — fallback disabled`);
        }
    }
    return { valid: true, warnings };
}

const SYSTEM_PROMPT = `You are an expert application security analyst specialising in IDOR (Insecure Direct Object Reference) and BOLA (Broken Object Level Authorisation) vulnerabilities.

You will be given evidence from a dual-account HTTP replay test and must determine whether it confirms a real vulnerability.

Respond ONLY with a valid JSON object matching this exact schema — no markdown, no code fences, no extra text:
{
  "confirmed": boolean,
  "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
  "reasoning": "string — clear explanation of your conclusion",
  "reproSteps": "string — numbered steps to reproduce the vulnerability",
  "suggestedFix": "string — actionable remediation advice for the developer"
}

Severity guide:
- CRITICAL: PII / financial / auth data fully exposed, no restrictions
- HIGH: Sensitive user-owned data leaked
- MEDIUM: Non-critical user data accessible but limited impact
- LOW: Minor information disclosure, requires chaining with other issues
- INFO: Not a vulnerability — flag as false positive with explanation`;

export { buildClient, getProviderChain, validateLLMConfig, SYSTEM_PROMPT, LLM_PROVIDER, LLM_FALLBACK_PROVIDER, LLM_TIMEOUT_MS, LLM_MAX_RETRIES }