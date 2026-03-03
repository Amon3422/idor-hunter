'use strict';

/**
 * Build structured finding reports from scan results.
 * Supports JSON and Markdown export formats.
 */

const SEVERITY_EMOJI = {
    CRITICAL: '🔴',
    HIGH:     '🟠',
    MEDIUM:   '🟡',
    LOW:      '🔵',
    INFO:     '⚪',
};

/**
 * Generate a report for the given findings in the specified format.
 * @param {Array}  findings — Finding objects (with included scan relation)
 * @param {'json'|'markdown'|'md'} format
 * @returns {{ content: string, contentType: string, fileExtension: string }}
 */
export const generateReport = (findings, format = 'json') => {
    const normalized = format.toLowerCase().trim();

    switch (normalized) {
        case 'json':
            return generateJSON(findings);
        case 'markdown':
        case 'md':
            return generateMarkdown(findings);
        default:
            throw new Error(`Unsupported export format: "${format}". Use "json" or "markdown".`);
    }
}

/* ── JSON format ──────────────────────────────────────────────────────────── */

function generateJSON(findings) {
    const report = {
        meta: {
            generatedAt:    new Date().toISOString(),
            totalFindings:  findings.length,
            severityCounts: countBy(findings, 'severity'),
            statusCounts:   countBy(findings, 'finding_status'),
        },
        findings: findings.map(f => ({
            id:               f.id,
            severity:         f.severity,
            status:           f.finding_status,
            affectedEndpoint: f.affected_endpoint,
            llmReasoning:     f.llm_reasoning,
            reproSteps:       f.repro_steps,
            suggestedFix:     f.suggested_fix,
            createdAt:        f.created_at,
            updatedAt:        f.updated_at,
            scan: f.scan ? {
                id:              f.scan.id,
                targetUrl:       f.scan.target_url,
                httpMethod:      f.scan.http_method,
                apiType:         f.scan.api_type,
                heuristicStatus: f.scan.heuristic_status,
                diffEvidence:    f.scan.diff_evidence,
                createdAt:       f.scan.created_at,
            } : null,
        })),
    };

    return {
        content:       JSON.stringify(report, null, 2),
        contentType:   'application/json',
        fileExtension: 'json',
    };
}

/* ── Markdown format ──────────────────────────────────────────────────────── */

function generateMarkdown(findings) {
    const now          = new Date().toISOString();
    const sevCounts    = countBy(findings, 'severity');
    const statusCounts = countBy(findings, 'finding_status');

    const lines = [];

    // Title
    lines.push('# IDOR Hunter — Findings Report');
    lines.push('');
    lines.push(`**Generated:** ${now}  `);
    lines.push(`**Total Findings:** ${findings.length}`);
    lines.push('');

    // Summary tables
    lines.push('## Summary');
    lines.push('');
    lines.push('### By Severity');
    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');
    for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']) {
        if (sevCounts[sev]) {
            lines.push(`| ${SEVERITY_EMOJI[sev]} ${sev} | ${sevCounts[sev]} |`);
        }
    }
    lines.push('');

    lines.push('### By Status');
    lines.push('');
    lines.push('| Status | Count |');
    lines.push('|--------|-------|');
    for (const [status, count] of Object.entries(statusCounts)) {
        lines.push(`| ${status} | ${count} |`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Individual findings
    lines.push('## Findings');
    lines.push('');

    findings.forEach((f, idx) => {
        const endpoint = f.affected_endpoint
            || `${f.scan?.http_method ?? ''} ${f.scan?.target_url ?? ''}`.trim();
        const emoji = SEVERITY_EMOJI[f.severity] || '';

        lines.push(`### ${idx + 1}. ${emoji} [${f.severity}] ${endpoint}`);
        lines.push('');
        lines.push(`- **ID:** \`${f.id}\``);
        lines.push(`- **Status:** ${f.finding_status}`);
        lines.push(`- **Detected:** ${f.created_at ? new Date(f.created_at).toLocaleString() : '—'}`);

        if (f.scan) {
            lines.push(`- **Scan ID:** \`${f.scan.id}\``);
            lines.push(`- **Method:** ${f.scan.http_method}`);
            lines.push(`- **API Type:** ${f.scan.api_type}`);
            if (f.scan.heuristic_status) {
                lines.push(`- **Heuristic:** ${f.scan.heuristic_status}`);
            }
            if (f.scan.diff_evidence?.score != null) {
                lines.push(`- **Heuristic Score:** ${f.scan.diff_evidence.score}/100`);
            }
        }
        lines.push('');

        // AI Reasoning
        lines.push('#### AI Reasoning');
        lines.push('');
        lines.push(f.llm_reasoning || '_No reasoning provided._');
        lines.push('');

        // Reproduction Steps
        lines.push('#### Reproduction Steps');
        lines.push('');
        lines.push(f.repro_steps || '_No reproduction steps provided._');
        lines.push('');

        // Suggested Fix
        lines.push('#### Suggested Fix');
        lines.push('');
        lines.push(f.suggested_fix || '_No fix suggested._');
        lines.push('');

        // Heuristic evidence
        if (f.scan?.diff_evidence) {
            const ev = f.scan.diff_evidence;
            lines.push('#### Heuristic Evidence');
            lines.push('');
            if (ev.flags?.length) {
                lines.push('**Flags:** ' + ev.flags.join(', '));
            }
            if (ev.leakedData && Object.keys(ev.leakedData).length) {
                lines.push('');
                lines.push('| Leaked Field | Value |');
                lines.push('|-------------|-------|');
                for (const [key, val] of Object.entries(ev.leakedData)) {
                    lines.push(`| ${key} | ${String(val)} |`);
                }
            }
            lines.push('');
        }

        lines.push('---');
        lines.push('');
    });

    lines.push('_Report generated by IDOR Hunter_');

    return {
        content:       lines.join('\n'),
        contentType:   'text/markdown',
        fileExtension: 'md',
    };
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function countBy(findings, field) {
    const counts = {};
    for (const f of findings) {
        const key = f[field];
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

