'use strict';

import prisma from '../config/index.js';
import { generateReport } from '../services/report/reportGenerator.js';

/**
 * GET /findings/:id
 * Returns a single finding with its parent scan metadata.
 */
export const getFindingById = async (req, res) => {
    try {
        const finding = await prisma.finding.findUniqueOrThrow({
            where: { id: req.params.id },
            include: {
                scan: {
                    select: {
                        id:               true,
                        target_url:       true,
                        http_method:      true,
                        api_type:         true,
                        heuristic_status: true,
                        diff_evidence:    true,
                        created_at:       true,
                    },
                },
            },
        });
        res.json(finding);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Finding not found' });
        }
        console.error('Error fetching finding:', error.message);
        res.status(500).json({ error: 'Failed to fetch finding' });
    }
};

/**
 * GET /findings
 * Returns all confirmed findings ordered by severity then most recent first.
 * Query params:
 *   status   — filter by finding_status (OPEN | FALSE_POSITIVE | FIXED)
 *   severity — filter by severity        (CRITICAL | HIGH | MEDIUM | LOW | INFO)
 *   scanId   — filter by parent scan UUID
 *   page     — 1-based page number (default: 1)
 *   limit    — results per page    (default: 20, max: 100)
 */
const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

export const getFindings = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip  = (page - 1) * limit;

        const where = {};
        if (req.query.status)   where.finding_status = req.query.status.toUpperCase();
        if (req.query.severity) where.severity        = req.query.severity.toUpperCase();
        if (req.query.scanId)   where.scan_id         = req.query.scanId;

        const [findings, total] = await Promise.all([
            prisma.finding.findMany({
                where,
                skip,
                take: limit,
                orderBy: [
                    { created_at: 'desc' },
                ],
                include: {
                    scan: {
                        select: {
                            id:          true,
                            target_url:  true,
                            http_method: true,
                            api_type:    true,
                            created_at:  true,
                        },
                    },
                },
            }),
            prisma.finding.count({ where }),
        ]);

        // Sort by severity weight in-process (Prisma doesn't support enum order natively)
        findings.sort((a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
        );

        res.json({
            data: findings,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Error fetching findings:', error.message);
        res.status(500).json({ error: 'Failed to fetch findings' });
    }
};

/**
 * PATCH /findings/:id/status
 * Update finding_status — allows analysts to mark as FALSE_POSITIVE or FIXED.
 * Body: { status: 'OPEN' | 'FALSE_POSITIVE' | 'FIXED' }
 */
const VALID_STATUSES = new Set(['OPEN', 'FALSE_POSITIVE', 'FIXED']);

export const updateFindingStatus = async (req, res) => {
    const { status } = req.body;

    if (!status || !VALID_STATUSES.has(status.toUpperCase())) {
        return res.status(400).json({
            error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
        });
    }

    try {
        const finding = await prisma.finding.update({
            where: { id: req.params.id },
            data:  { finding_status: status.toUpperCase() },
        });
        res.json(finding);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Finding not found' });
        }
        console.error('Error updating finding status:', error.message);
        res.status(500).json({ error: 'Failed to update finding status' });
    }
};

/**
 * GET /findings/export?format=json|markdown&severity=...&status=...&scanId=...
 * Export all matching findings as a downloadable report.
 */
export const exportFindings = async (req, res) => {
    const format = (req.query.format || 'json').toLowerCase();

    try {
        const where = {};
        if (req.query.status)   where.finding_status = req.query.status.toUpperCase();
        if (req.query.severity) where.severity        = req.query.severity.toUpperCase();
        if (req.query.scanId)   where.scan_id         = req.query.scanId;

        const findings = await prisma.finding.findMany({
            where,
            orderBy: [{ created_at: 'desc' }],
            include: {
                scan: {
                    select: {
                        id:               true,
                        target_url:       true,
                        http_method:      true,
                        api_type:         true,
                        heuristic_status: true,
                        diff_evidence:    true,
                        created_at:       true,
                    },
                },
            },
        });

        // Sort by severity weight (same as getFindings)
        findings.sort((a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
        );

        const report   = generateReport(findings, format);
        const filename = `idor-hunter-findings-${Date.now()}.${report.fileExtension}`;

        res.setHeader('Content-Type', report.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(report.content);
    } catch (error) {
        if (error.message.startsWith('Unsupported export format')) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error exporting findings:', error.message);
        res.status(500).json({ error: 'Failed to export findings' });
    }
};

/**
 * GET /findings/:id/export?format=json|markdown
 * Export a single finding as a downloadable report.
 */
export const exportFinding = async (req, res) => {
    const format = (req.query.format || 'json').toLowerCase();

    try {
        const finding = await prisma.finding.findUniqueOrThrow({
            where: { id: req.params.id },
            include: {
                scan: {
                    select: {
                        id:               true,
                        target_url:       true,
                        http_method:      true,
                        api_type:         true,
                        heuristic_status: true,
                        diff_evidence:    true,
                        created_at:       true,
                    },
                },
            },
        });

        const report   = generateReport([finding], format);
        const filename = `idor-hunter-finding-${finding.id.slice(0, 8)}.${report.fileExtension}`;

        res.setHeader('Content-Type', report.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(report.content);
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Finding not found' });
        }
        if (error.message.startsWith('Unsupported export format')) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Error exporting finding:', error.message);
        res.status(500).json({ error: 'Failed to export finding' });
    }
};
