'use strict';

const API = '/api';

// ── Read finding ID from URL ───────────────────────────────────────────────────
const findingId = new URLSearchParams(window.location.search).get('id');
if (!findingId) {
    document.getElementById('loadingState').innerHTML =
        '<p class="text-danger">No finding ID provided. <a href="/findings.html">&larr; Back to findings</a></p>';
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingState   = document.getElementById('loadingState');
const mainContent    = document.getElementById('mainContentArea');
const headerTitle    = document.getElementById('headerTitle');
const headerSubtitle = document.getElementById('headerSubtitle');
const headerBadges   = document.getElementById('headerBadges');
const metaStrip      = document.getElementById('metaStrip');
const saveStatusBtn  = document.getElementById('saveStatusBtn');
const statusSelect   = document.getElementById('statusSelect');
const statusMessage  = document.getElementById('statusMessage');

// ── Load ──────────────────────────────────────────────────────────────────────
if (findingId) {
    loadFinding();
}

async function loadFinding() {
    try {
        const res = await fetch(`${API}/findings/${findingId}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        const finding = await res.json();
        render(finding);
    } catch (err) {
        loadingState.innerHTML = `
            <p class="text-danger font-bold">Failed to load finding</p>
            <p class="text-muted">${esc(err.message)}</p>
            <a href="/findings.html" class="btn btn-ghost btn-sm mt-4">← Back to findings</a>
        `;
    }
}

// ── Render ────────────────────────────────────────────────────────────────────
function render(f) {
    const endpoint = f.affected_endpoint || `${f.scan?.http_method ?? ''} ${f.scan?.target_url ?? ''}`;

    // Page title + subtitle
    document.title = `${f.severity} — ${endpoint} | IDOR Hunter`;
    headerTitle.textContent    = endpoint;
    headerSubtitle.textContent = `Finding detected on ${new Date(f.created_at).toLocaleString()}`;

    // Header badges
    headerBadges.innerHTML = `
        <span class="badge badge-${esc(f.severity).toLowerCase()}">${esc(f.severity)}</span>
        <span class="badge badge-${esc(f.finding_status).toLowerCase().replace('_', '-')}">${esc(f.finding_status.replace('_', ' '))}</span>
    `;

    // Meta strip
    metaStrip.innerHTML = [
        metaItem('Scan ID',   f.scan?.id  ?? '—', true),
        metaItem('Method',    f.scan?.http_method ?? '—'),
        metaItem('API Type',  f.scan?.api_type ?? '—'),
        metaItem('Heuristic', f.scan?.heuristic_status ?? '—'),
        metaItem('Score',     f.scan?.diff_evidence?.score != null ? `${f.scan.diff_evidence.score}/100` : '—'),
        metaItem('Updated',   new Date(f.updated_at).toLocaleString()),
    ].join('');

    // AI Reasoning
    document.getElementById('llmReasoning').textContent = f.llm_reasoning;

    // Reproduction steps — detect numbered lines and render as visual steps
    document.getElementById('reproSteps').innerHTML = renderSteps(f.repro_steps);
    document.getElementById('reproSteps').dataset.plain = f.repro_steps;

    // Suggested fix
    document.getElementById('suggestedFix').innerHTML =
        `<div class="fix-block">${esc(f.suggested_fix)}</div>`;
    document.getElementById('suggestedFix').dataset.plain = f.suggested_fix;

    // Heuristic evidence
    renderEvidence(f.scan?.diff_evidence);

    // Status select
    statusSelect.value = f.finding_status;

    // Show content
    loadingState.classList.add('hidden');
    mainContent.classList.remove('hidden');

    // Save status
    saveStatusBtn.addEventListener('click', () => updateStatus(f.id));
}

function metaItem(label, value, mono = false) {
    return `<div class="meta-item">
        <span class="meta-item-label">${esc(label)}</span>
        <span class="meta-item-value ${mono ? 'mono' : ''}" title="${esc(String(value))}">${esc(truncate(String(value), 36))}</span>
    </div>`;
}

// Parse "1. Step text" or "Step 1:" patterns into visual numbered list
function renderSteps(text) {
    if (!text) return '<p class="text-muted">No reproduction steps provided.</p>';

    // Try to detect numbered lines: "1.", "1)", "Step 1:", "Step 1."
    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    const stepPattern = /^(\d+[.):]|step\s*\d+[:.]?)\s*/i;
    const hasSteps = lines.some(l => stepPattern.test(l));

    if (!hasSteps) {
        // Plain paragraph — wrap in block
        return `<p class="prose">${esc(text)}</p>`;
    }

    let stepNum = 0;
    const items = lines.map(line => {
        if (stepPattern.test(line)) {
            stepNum++;
            const text = line.replace(stepPattern, '').trim();
            return `<li class="step-item">
                <span class="step-num">${stepNum}</span>
                <span class="step-text">${esc(text)}</span>
            </li>`;
        }
        // continuation line — attach to last step
        return `<li class="step-item" style="padding-left:42px">
            <span class="step-text text-muted">${esc(line)}</span>
        </li>`;
    });

    return `<ol class="steps-list">${items.join('')}</ol>`;
}

function renderEvidence(evidence) {
    const card = document.getElementById('diffEvidenceCard');
    const el   = document.getElementById('diffEvidence');

    if (!evidence || !evidence.score) {
        card.classList.add('hidden');
        return;
    }

    const flags      = evidence.flags      || [];
    const leakedData = evidence.leakedData || {};
    const leakedKeys = Object.keys(leakedData);

    const flagChips = flags.length
        ? `<div class="flags-list">${flags.map(f => `<span class="flag-chip">${esc(f)}</span>`).join('')}</div>`
        : '';

    const leakedTable = leakedKeys.length ? `
        <p class="text-xs font-bold text-muted" style="text-transform:uppercase;letter-spacing:.05em;margin:16px 0 8px">
            Leaked Fields
        </p>
        <table class="leaked-table">
            <thead><tr><th>Field (dot notation)</th><th>Value</th></tr></thead>
            <tbody>
                ${leakedKeys.map(k => `<tr>
                    <td>${esc(k)}</td>
                    <td>${esc(String(leakedData[k]))}</td>
                </tr>`).join('')}
            </tbody>
        </table>` : '';

    el.innerHTML = `
        <div class="evidence-grid">
            <div class="evidence-stat">
                <span class="evidence-stat-label">Heuristic Score</span>
                <span class="evidence-stat-value">${esc(String(evidence.score))}<span class="text-sm" style="font-weight:400">/100</span></span>
            </div>
            <div class="evidence-stat">
                <span class="evidence-stat-label">Leaked Fields</span>
                <span class="evidence-stat-value">${leakedKeys.length}</span>
            </div>
        </div>
        ${flagChips}
        ${leakedTable}
    `;
}

// ── Status update ─────────────────────────────────────────────────────────────
async function updateStatus(findingId) {
    const status = statusSelect.value;
    saveStatusBtn.disabled = true;
    saveStatusBtn.textContent = 'Saving…';

    try {
        const res = await fetch(`${API}/findings/${findingId}/status`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ status }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        // Update header badge
        const oldBadge = headerBadges.querySelector('[class*="badge-open"], [class*="badge-false"], [class*="badge-fixed"]');
        if (oldBadge) oldBadge.remove();
        headerBadges.insertAdjacentHTML('beforeend',
            `<span class="badge badge-${esc(status).toLowerCase().replace('_', '-')}">${esc(status.replace('_', ' '))}</span>`);

        showStatusMessage('Status updated successfully.', 'success');
    } catch (err) {
        showStatusMessage(`Failed: ${err.message}`, 'error');
    } finally {
        saveStatusBtn.disabled = false;
        saveStatusBtn.textContent = 'Save Status';
    }
}

function showStatusMessage(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => statusMessage.classList.add('hidden'), 4000);
}

// ── Copy to clipboard (event delegation) ───────────────────────────────────
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy-target]');
    if (!btn) return;
    copyText(btn.dataset.copyTarget, btn);
});

function copyText(sectionId, btn) {
    const section = document.getElementById(sectionId);
    const text    = section.dataset.plain || section.innerText;
    if (!btn) btn = section.closest('.detail-card').querySelector('.copy-btn');

    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
}

// ── Export ─────────────────────────────────────────────────────────────────────
document.getElementById('exportJsonBtn').addEventListener('click', () => exportFinding('json'));
document.getElementById('exportMdBtn').addEventListener('click',   () => exportFinding('markdown'));

function exportFinding(format) {
    if (!findingId) return;
    const url = `${API}/findings/${findingId}/export?format=${format}`;
    // Trigger download via hidden link
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function truncate(str, max) {
    return str.length > max ? str.slice(0, max) + '…' : str;
}
