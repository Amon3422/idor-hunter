'use strict';

import { encrypt } from '../utils/crypto.js';
import prisma from '../config/index.js';
import CurlParser from '../services/parser/curlParser.js';
import { executeScan } from './scanController.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Substitute {variable} placeholders in a URL path using a mapping object.
 * e.g. substituteVars('/users/{userId}', { userId: '36' }) → '/users/36'
 * @param {string} path
 * @param {Object} mapping
 * @returns {string}
 */
function substituteVars(path, mapping = {}) {
    let result = path;
    for (const [key, value] of Object.entries(mapping)) {
        result = result.replaceAll(`{${key}}`, String(value));
    }
    return result;
}

/**
 * Normalize auth input (same logic as scanController normalizeAuth).
 * @param {{ headers: Object, cookies?: string|null }} auth
 * @returns {{ headers: Object, cookies: string|null }}
 */
function normalizeAuth({ headers, cookies }) {
    const cleanHeaders = { ...headers };
    const resolvedCookies = cookies || CurlParser.extractCookies(cleanHeaders) || null;
    if (cookies) CurlParser.extractCookies(cleanHeaders);
    return { headers: cleanHeaders, cookies: resolvedCookies };
}

/**
 * Safely parse a body value (JSON string | object | null → object | null).
 * @param {string|object|null} body
 * @returns {object|null}
 */
function parseBody(body) {
    if (!body) return null;
    if (typeof body === 'object') return body;
    try { return JSON.parse(body); } catch { return null; }
}

/**
 * Fire-and-forget runner: executes all child scans for a session sequentially,
 * updating progress counters and final status on the session.
 * @param {string} sessionId
 * @param {string[]} scanIds
 */
async function runAllScans(sessionId, scanIds) {
    for (const scanId of scanIds) {
        try {
            await executeScan(scanId);
        } catch (err) {
            // Individual scan failure is non-fatal for the session — log and continue
            console.error(`[Session ${sessionId}] Scan ${scanId} failed:`, err.message);
        }

        // Increment counter after each scan regardless of outcome
        await prisma.scanSession.update({
            where: { id: sessionId },
            data: { scanned_endpoints: { increment: 1 } },
        });
    }

    // Determine final status: FAILED if every scan produced no findings at all is fine —
    // FAILED is reserved for hard system errors. We only set FAILED if the session
    // itself throws (caught at call site). Here we always land on COMPLETED.
    await prisma.scanSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED' },
    });
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

/**
 * POST /sessions
 * Create a new ScanSession from parsed endpoint data (e.g. from Swagger parser).
 *
 * Body:
 *   name?              — Human-readable session label
 *   base_url           — API base (e.g. https://api.example.com)
 *   parsed_endpoints   — [{ method, path, parameters?, requestBody? }]
 *   global_mapping?    — { variableName: value, ... }
 */
export const createSession = async (req, res) => {
    const { name, base_url, parsed_endpoints, global_mapping } = req.body;

    if (!base_url || typeof base_url !== 'string') {
        return res.status(400).json({ error: 'base_url is required and must be a string' });
    }

    if (!Array.isArray(parsed_endpoints) || parsed_endpoints.length === 0) {
        return res.status(400).json({ error: 'parsed_endpoints must be a non-empty array' });
    }

    // Validate each endpoint has at minimum method + path
    for (const ep of parsed_endpoints) {
        if (!ep.method || !ep.path) {
            return res.status(400).json({
                error: 'Each parsed endpoint must have method and path fields',
            });
        }
    }

    try {
        const session = await prisma.scanSession.create({
            data: {
                name:             name ?? null,
                base_url:         base_url.replace(/\/$/, ''), // strip trailing slash
                parsed_endpoints,
                global_mapping:   global_mapping ?? null,
                total_endpoints:  parsed_endpoints.length,
                status:           'DRAFT',
            },
        });

        res.status(201).json(session);
    } catch (err) {
        console.error('Error creating session:', err);
        res.status(500).json({ error: 'Failed to create session' });
    }
};

/**
 * GET /sessions
 * List all sessions with progress summary, ordered by most recent.
 * Query params:
 *   status — filter by SessionStatus
 *   page   — 1-based (default: 1)
 *   limit  — results per page (default: 20, max: 100)
 */
export const getSessions = async (req, res) => {
    const page  = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const skip  = (page - 1) * limit;

    const where = {};
    if (req.query.status) where.status = req.query.status;

    try {
        const [sessions, total] = await Promise.all([
            prisma.scanSession.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
                select: {
                    id:                true,
                    name:              true,
                    base_url:          true,
                    status:            true,
                    total_endpoints:   true,
                    scanned_endpoints: true,
                    global_mapping:    true,
                    created_at:        true,
                    updated_at:        true,
                    // Aggregate finding count from child scans
                    _count: { select: { scans: true } },
                },
            }),
            prisma.scanSession.count({ where }),
        ]);

        res.json({
            meta: { total, page, limit, pages: Math.ceil(total / limit) },
            data: sessions,
        });
    } catch (err) {
        console.error('Error listing sessions:', err);
        res.status(500).json({ error: 'Failed to list sessions' });
    }
};

/**
 * GET /sessions/:id
 * Get a single session with its child scans summary.
 */
export const getSession = async (req, res) => {
    try {
        const session = await prisma.scanSession.findUniqueOrThrow({
            where: { id: req.params.id },
            include: {
                scans: {
                    orderBy: { created_at: 'asc' },
                    select: {
                        id:               true,
                        target_url:       true,
                        http_method:      true,
                        heuristic_status: true,
                        diff_evidence:    true,
                        created_at:       true,
                        _count: { select: { findings: true } },
                    },
                },
            },
        });

        // Strip auth fields
        // eslint-disable-next-line no-unused-vars
        const { account_a_auth, account_b_auth, ...safeSession } = session;
        res.json(safeSession);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Session not found' });
        console.error('Error fetching session:', err);
        res.status(500).json({ error: 'Failed to fetch session' });
    }
};

/**
 * PATCH /sessions/:id
 * Update session metadata before it runs (DRAFT only).
 *
 * Body (all optional):
 *   name           — new session label
 *   global_mapping — updated variable map
 */
export const updateSession = async (req, res) => {
    try {
        const session = await prisma.scanSession.findUniqueOrThrow({
            where: { id: req.params.id },
        });

        if (session.status !== 'DRAFT') {
            return res.status(409).json({
                error: `Session is ${session.status}. Only DRAFT sessions can be edited.`,
            });
        }

        const { name, global_mapping } = req.body;
        const data = {};
        if (name !== undefined)          data.name           = name;
        if (global_mapping !== undefined) data.global_mapping = global_mapping;

        if (Object.keys(data).length === 0) {
            return res.status(400).json({ error: 'Nothing to update. Provide name or global_mapping.' });
        }

        const updated = await prisma.scanSession.update({
            where: { id: req.params.id },
            data,
        });

        // eslint-disable-next-line no-unused-vars
        const { account_a_auth, account_b_auth, ...safeSession } = updated;
        res.json(safeSession);
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Session not found' });
        console.error('Error updating session:', err);
        res.status(500).json({ error: 'Failed to update session' });
    }
};

/**
 * POST /sessions/:id/run
 * Resolve variables, create child Scan records, then execute them asynchronously.
 *
 * Body:
 *   accountA       — { headers, cookies? }
 *   accountB       — { headers, cookies? }
 *   global_mapping? — override/set mapping at run time
 *   apiType?       — 'REST' | 'GRAPHQL' (default: REST)
 */
export const runSession = async (req, res) => {
    const { accountA, accountB, global_mapping, apiType = 'REST' } = req.body;

    if (!accountA?.headers || typeof accountA.headers !== 'object') {
        return res.status(400).json({ error: 'accountA.headers is required and must be an object' });
    }
    if (!accountB?.headers || typeof accountB.headers !== 'object') {
        return res.status(400).json({ error: 'accountB.headers is required and must be an object' });
    }

    try {
        const session = await prisma.scanSession.findUniqueOrThrow({
            where: { id: req.params.id },
        });

        if (session.status !== 'DRAFT') {
            return res.status(409).json({
                error: `Session is already ${session.status}. Only DRAFT sessions can be started.`,
            });
        }

        // Merge run-time mapping with any mapping stored on the session
        const effectiveMapping = {
            ...(session.global_mapping ?? {}),
            ...(global_mapping ?? {}),
        };

        const parsedEndpoints = session.parsed_endpoints; // already an array from Prisma

        const authA = normalizeAuth(accountA);
        const authB = normalizeAuth(accountB);

        const encryptedAuthA = encrypt(authA);
        const encryptedAuthB = encrypt(authB);

        // Create all child Scan records in one transaction
        const childScans = await prisma.$transaction(
            parsedEndpoints.map((ep) => {
                const substitutedPath = substituteVars(ep.path, effectiveMapping);
                const fullUrl         = session.base_url + substitutedPath;

                return prisma.scan.create({
                    data: {
                        target_url:       fullUrl,
                        http_method:      ep.method.toUpperCase(),
                        api_type:         apiType.toUpperCase(),
                        request_payload:  parseBody(ep.requestBody) ?? {},
                        account_a_auth:   encryptedAuthA,
                        account_b_auth:   encryptedAuthB,
                        heuristic_status: 'CLEAN',
                        diff_evidence:    {},
                        session_id:       session.id,
                    },
                });
            })
        );

        // Persist auth + mapping on the session, flip status to RUNNING
        await prisma.scanSession.update({
            where: { id: session.id },
            data: {
                account_a_auth:    encryptedAuthA,
                account_b_auth:    encryptedAuthB,
                global_mapping:    effectiveMapping,
                status:            'RUNNING',
                scanned_endpoints: 0,
            },
        });

        // Fire-and-forget — client polls GET /sessions/:id for progress
        const scanIds = childScans.map((s) => s.id);
        runAllScans(session.id, scanIds).catch(async (err) => {
            console.error(`[Session ${session.id}] Fatal error during execution:`, err.message);
            await prisma.scanSession.update({
                where: { id: session.id },
                data:  { status: 'FAILED' },
            }).catch(() => {});
        });

        res.status(202).json({
            message:     'Session is now RUNNING. Poll GET /sessions/:id for progress.',
            session_id:  session.id,
            total_scans: scanIds.length,
        });
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Session not found' });
        console.error('Error starting session:', err);
        res.status(500).json({ error: 'Failed to start session' });
    }
};

/**
 * DELETE /sessions/:id
 * Delete a session and cascade-delete its child scans (via DB cascade).
 */
export const deleteSession = async (req, res) => {
    try {
        await prisma.scanSession.delete({ where: { id: req.params.id } });
        res.status(204).end();
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Session not found' });
        console.error('Error deleting session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
};
