import { encrypt } from '../utils/crypto.js'
import prisma from '../config/index.js'
import CurlParser from '../services/parser/curlParser.js'
import { decryptCredentials } from '../services/replay/sessionManager.js'
import { replayRequest } from '../services/replay/requestReplayer.js'
import { evaluateSuspiciousDiff } from '../services/analysis/heuristicEngine.js'
import { analyzeWithLLM } from '../services/analysis/llmAnalyzer.js'
/** 
* Validate normalized scan input, returns an error string or null if valid
@param {object} input
@returns {string|null}
*/
export const validateScanInput = ({ url, method, apiType, accountA, accountB }) => {
    if(!url || !method || !apiType || !accountA || !accountB){
        return 'Missing required fields: url, method, apiType, accountA, accountB'
    }

    if(!accountA.headers || typeof accountA.headers !== 'object'){
        return 'accountA headers is required and must be object'
    }

    if(!accountB.headers || typeof accountB.headers !== 'object'){
        return 'accountB headers is required and must be object'
    }

    return null
}

/** 
 * Safely parse body - handles JSON string, plain object, or null
 * @param {string|object|null}
 * @returns {object|null}
*/
function parseBody(body){
    if(!body) return null
    if(typeof body === 'object') return body
    try{
        return JSON.parse(body)
    }catch{
        return null
    }
}

/**
 * Normalize auth credentials for one account.
 * - Works on a shallow copy of headers — never mutates the original input.
 * - If `cookies` is explicitly provided, it is used as-is and the Cookie
 *   header (if any) is removed from headers to avoid duplication.
 * - If `cookies` is absent, it is extracted from the Cookie header (if present)
 *   and that header is removed so it isn't double-sent on replay.
 *
 * @param {{ headers: Object, cookies?: string|null }} auth
 * @returns {{ headers: Object, cookies: string|null }}
 */
function normalizeAuth({ headers, cookies }) {
    const cleanHeaders = { ...headers };
    const resolvedCookies = cookies || CurlParser.extractCookies(cleanHeaders) || null;

    // If caller explicitly passed cookies, still remove Cookie from headers
    // to prevent it being sent twice during replay.
    if (cookies) CurlParser.extractCookies(cleanHeaders);

    return { headers: cleanHeaders, cookies: resolvedCookies };
}

/**
 * Build Prisma-ready scan data from normalized input.
 * Shared by both manual scan and cURL scan creation.
 * @param {object} input - Normalized scan input
 * @returns {object} Prisma create data
 */
export const buildScanData = ({ url, method, apiType, body, accountA, accountB }) => {
    return {
        target_url: url,
        http_method: method.toUpperCase(),
        api_type: apiType.toUpperCase(),
        request_payload: parseBody(body) ?? {},
        account_a_auth: encrypt(normalizeAuth(accountA)),
        account_b_auth: encrypt(normalizeAuth(accountB)),
        heuristic_status: 'CLEAN',
        diff_evidence: {},
    };
}

/**
 * POST /scans
 * Create a scan from a normalized manual input request.
 */
export const createScan = async (req, res) => {
    const validationError = validateScanInput(req.body);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const scan = await prisma.scan.create({
            data: buildScanData(req.body),
        });
        // eslint-disable-next-line no-unused-vars
        const { account_a_auth, account_b_auth, ...safeScan } = scan;
        res.status(201).json(safeScan);
    } catch (error) {
        console.error('Error creating scan:', error);
        res.status(500).json({ error: 'Failed to create scan' });
    }
};

/**
 * Core scan execution logic — shared by the HTTP handler and session runner.
 * Loads the scan, replays both accounts, runs heuristic + LLM, and persists results.
 *
 * @param {string} scanId
 * @returns {Promise<{ responseA, responseB, diff, finding: object|null, llmError: string|null }>}
 * @throws if the scan is not found or credentials cannot be decrypted
 */
export const executeScan = async (scanId) => {
    // 1. Load scan
    const scan = await prisma.scan.findUniqueOrThrow({
        where: { id: scanId },
    });

    // 2. Decrypt credentials via session manager
    const { authA, authB } = decryptCredentials(scan);

    // 3. Build shared request config
    const requestBase = {
        url:    scan.target_url,
        method: scan.http_method,
        body:   scan.request_payload ?? null,
    };

    // 4. Replay as Account A and Account B in parallel
    const [responseA, responseB] = await Promise.all([
        replayRequest({ ...requestBase, headers: authA.headers, cookies: authA.cookies }),
        replayRequest({ ...requestBase, headers: authB.headers, cookies: authB.cookies }),
    ]);

    // 5. Run heuristic diff
    const diff = evaluateSuspiciousDiff(responseA, responseB);

    // 6. Persist heuristic result + raw evidence
    await prisma.scan.update({
        where: { id: scanId },
        data: {
            heuristic_status: diff.isSuspicious ? 'SUSPICIOUS' : 'CLEAN',
            diff_evidence: {
                score:      diff.score,
                flags:      diff.flags,
                leakedData: diff.leakedData,
            },
        },
    });

    // 7. LLM analysis — only for suspicious diffs
    let finding  = null;
    let llmError = null;
    if (diff.isSuspicious) {
        try {
            const request   = { url: scan.target_url, method: scan.http_method };
            const llmResult = await analyzeWithLLM(request, diff, responseA, responseB);
            console.log('LLM result:', JSON.stringify({
                confirmed: llmResult.confirmed,
                severity:  llmResult.severity,
                meta:      llmResult._meta,
            }));

            if (llmResult.confirmed) {
                finding = await prisma.finding.create({
                    data: {
                        scan_id:           scanId,
                        severity:          llmResult.severity,
                        affected_endpoint: `${scan.http_method} ${scan.target_url}`,
                        llm_reasoning:     llmResult.reasoning,
                        repro_steps:       llmResult.reproSteps,
                        suggested_fix:     llmResult.suggestedFix,
                        llm_meta:          llmResult._meta ?? {},
                    },
                });
            }
        } catch (err) {
            console.error('LLM analysis failed (heuristic result preserved):', err.message);
            llmError = err.message;
        }
    }

    return { responseA, responseB, diff, finding, llmError };
};

/**
 * GET /scans/:id/run
 * HTTP handler — delegates to executeScan() and handles response/errors.
 */
export const runScan = async (req, res) => {
    try {
        const result = await executeScan(req.params.id);
        res.json(result);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Scan not found' });
        }
        if (error.message.includes('unable to authenticate data') ||
            error.message.includes('Unsupported state')) {
            console.error('Credential decryption failed for scan:', req.params.id);
            return res.status(422).json({
                error: 'Cannot decrypt stored credentials. This scan was created with a different encryption key and must be re-created.',
            });
        }
        console.error('Error running scan:', error.message);
        res.status(500).json({ error: 'Failed to run scan' });
    }
};

export const getHistory = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip  = (page - 1) * limit;

        const where = req.query.status
            ? { heuristic_status: req.query.status.toUpperCase() }
            : {};

        const [scans, total] = await Promise.all([
            prisma.scan.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                select: {
                    id:               true,
                    target_url:       true,
                    http_method:      true,
                    api_type:         true,
                    heuristic_status: true,
                    diff_evidence:    true,
                    created_at:       true,
                    _count: { select: { findings: true } },
                },
            }),
            prisma.scan.count({ where }),
        ]);

        res.json({
            data: scans,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Error fetching scan history:', error.message);
        res.status(500).json({ error: 'Failed to fetch scan history' });
    }
};