import CurlParser from '../services/parser/curlParser.js'
import prisma from '../config/index.js'
import { validateScanInput, buildScanData } from '../controllers/scanController.js'

/**
 * POST /curl/parse
 * Parse a cURL command into a normalized ParsedRequest object.
 * Does NOT create a scan — just returns the parsed data for preview.
 */
export const parseCurl = (req, res) => {
    const { curlCommand } = req.body;

    if (!curlCommand || typeof curlCommand !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid curlCommand' });
    }

    if (!CurlParser.isCurlCommand(curlCommand)) {
        return res.status(400).json({ error: 'Invalid cURL command format' });
    }

    try {
        const parsed = CurlParser.parse(curlCommand);
        res.json({ success: true, data: parsed });
    } catch (error) {
        console.error('cURL parse error:', error);
        res.status(400).json({ error: error.message || 'Failed to parse cURL command' });
    }
};


/**
 * POST /curl/scan
 * Parse a cURL command (becomes Account A) + accept Account B credentials,
 * then create a scan using the same normalized format as POST /scans.
 *
 * Body: { curlCommand, apiType, accountB: { headers, cookies? } }
 */
export const createScanFromCurl = async (req, res) => {
    const { curlCommand, apiType, accountB } = req.body;
    // Validate curl input
    if (!curlCommand || typeof curlCommand !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid curlCommand' });
    }
    if (!CurlParser.isCurlCommand(curlCommand)) {
        return res.status(400).json({ error: 'Invalid cURL command format' });
    }
    if (!apiType) {
        return res.status(400).json({ error: 'Missing required field: apiType' });
    }
    if (!accountB || !accountB.headers || typeof accountB.headers !== 'object') {
        return res.status(400).json({ error: 'accountB.headers is required and must be an object' });
    }

    // Parse cURL → becomes Account A
    let parsedCurl;
    try {
        parsedCurl = CurlParser.parse(curlCommand);
    } catch (error) {
        return res.status(400).json({ error: error.message || 'Failed to parse cURL command' });
    }

    // Build normalized input — same shape as POST /scans
    const normalizedInput = {
        url: parsedCurl.url,
        method: parsedCurl.method,
        apiType,
        body: parsedCurl.body ?? null,
        accountA: {
            headers: parsedCurl.headers,
            cookies: parsedCurl.cookies ?? null,
        },
        accountB: {
            headers: accountB.headers,
            cookies: accountB.cookies ?? null,
        },
    };
    // Reuse the same validation used by POST /scans
    const validationError = validateScanInput(normalizedInput);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        const scan = await prisma.scan.create({
            data: buildScanData(normalizedInput),
        });
        // eslint-disable-next-line no-unused-vars
        const { account_a_auth, account_b_auth, ...safeScan } = scan;
        res.status(201).json(safeScan);
    } catch (error) {
        console.error('Error creating scan from cURL:', error);
        res.status(500).json({ error: 'Failed to create scan' });
    }
};