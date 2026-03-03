'use strict';

const API = '/api';

// ── Read session ID from URL ───────────────────────────────────────────────────
const sessionId = new URLSearchParams(window.location.search).get('id');

if (!sessionId) {
    document.getElementById('loadingState').innerHTML =
        '<p class="text-danger">No session ID provided. <a href="/sessions.html">← Back to sessions</a></p>';
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingState    = document.getElementById('loadingState');
const mainArea        = document.getElementById('mainContentArea');
const headerTitle     = document.getElementById('headerTitle');
const headerSubtitle  = document.getElementById('headerSubtitle');
const headerBadges    = document.getElementById('headerBadges');
const progressSection = document.getElementById('progressSection');
const progressBar     = document.getElementById('progressBar');
const progressLabel   = document.getElementById('progressLabel');
const runSection      = document.getElementById('runSection');
const runBtn          = document.getElementById('runBtn');
const runMessage      = document.getElementById('runMessage');
const mappingSection  = document.getElementById('mappingSection');
const mappingTable    = document.getElementById('mappingTable');
const scansWrapper    = document.getElementById('scansWrapper');
const scansState      = document.getElementById('scansState');
const scansBody       = document.getElementById('scansBody');
const scansSubtitle   = document.getElementById('scansSubtitle');

let pollingTimer = null;
let sessionData  = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
if (sessionId) loadSession();

async function loadSession() {
    try {
        const res = await fetch(`${API}/sessions/${sessionId}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        sessionData = await res.json();
        render(sessionData);
    } catch (err) {
        loadingState.innerHTML = `
            <p class="text-danger font-bold">Failed to load session</p>
            <p class="text-muted">${esc(err.message)}</p>
            <a href="/sessions.html" class="btn btn-ghost btn-sm mt-4">← Back to sessions</a>`;
    }
}

// ── Render ────────────────────────────────────────────────────────────────────
function render(s) {
    document.title = `${s.name || s.base_url} | IDOR Hunter`;
    headerTitle.textContent   = s.name || s.base_url;
    headerSubtitle.textContent = `Created ${new Date(s.created_at).toLocaleString()} · ${s.total_endpoints} endpoint(s)`;
    headerBadges.innerHTML    = `<span class="badge badge-session-${esc(s.status).toLowerCase()}">${esc(s.status)}</span>`;

    // Progress bar — show if RUNNING or COMPLETED
    if (s.status === 'RUNNING' || s.status === 'COMPLETED') {
        const pct = s.total_endpoints > 0
            ? Math.round((s.scanned_endpoints / s.total_endpoints) * 100)
            : 0;
        progressBar.style.width  = `${pct}%`;
        progressLabel.textContent = `${s.scanned_endpoints} / ${s.total_endpoints}`;
        progressSection.classList.remove('hidden');
    }

    // Run form — only for DRAFT
    if (s.status === 'DRAFT') {
        buildMappingTable(s.parsed_endpoints, s.global_mapping);
        runSection.classList.remove('hidden');
    }

    // Child scans
    renderScans(s.scans ?? []);

    loadingState.classList.add('hidden');
    mainArea.classList.remove('hidden');

    // Auto-poll while RUNNING
    if (s.status === 'RUNNING') startPolling();
}

// ── Mapping table ─────────────────────────────────────────────────────────────
function buildMappingTable(endpoints, existingMapping = {}) {
    // Extract all unique {variable} occurrences from paths
    const vars = new Set();
    for (const ep of (endpoints || [])) {
        const matches = (ep.path || '').matchAll(/\{([^}]+)\}/g);
        for (const m of matches) vars.add(m[1]);
    }

    if (vars.size === 0) return; // no variables, hide mapping section

    mappingSection.classList.remove('hidden');

    mappingTable.innerHTML = [...vars].map(v => `
        <div class="flex items-center gap-3 mb-3">
            <code class="form-textarea-mono text-sm" style="padding:6px 10px;background:var(--surface-2);border-radius:6px;min-width:140px">{${esc(v)}}</code>
            <span class="text-muted">→</span>
            <input
                type="text"
                class="form-input"
                data-var="${esc(v)}"
                placeholder="Enter value…"
                value="${esc(existingMapping?.[v] ?? '')}"
                style="max-width:240px"
            />
        </div>
    `).join('');
}

function collectMapping() {
    const inputs = mappingTable.querySelectorAll('[data-var]');
    const map = {};
    for (const input of inputs) {
        if (input.value.trim()) map[input.dataset.var] = input.value.trim();
    }
    return map;
}

// ── Parse header text block ───────────────────────────────────────────────────
function parseHeaders(text) {
    const headers = {};
    for (const line of text.split('\n')) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim();
        const val = line.slice(colon + 1).trim();
        if (key) headers[key] = val;
    }
    return headers;
}

// ── Run button ────────────────────────────────────────────────────────────────
runBtn.addEventListener('click', async () => {
    const headersA = parseHeaders(document.getElementById('accountAHeaders').value);
    const headersB = parseHeaders(document.getElementById('accountBHeaders').value);

    if (Object.keys(headersA).length === 0) {
        showMessage('Account A headers are required.', 'error');
        return;
    }
    if (Object.keys(headersB).length === 0) {
        showMessage('Account B headers are required.', 'error');
        return;
    }

    const cookiesA = document.getElementById('accountACookies').value.trim() || undefined;
    const cookiesB = document.getElementById('accountBCookies').value.trim() || undefined;

    const global_mapping = collectMapping();

    runBtn.disabled = true;
    runBtn.textContent = '⏳ Starting…';

    try {
        const res = await fetch(`${API}/sessions/${sessionId}/run`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountA: { headers: headersA, cookies: cookiesA },
                accountB: { headers: headersB, cookies: cookiesB },
                global_mapping: Object.keys(global_mapping).length ? global_mapping : undefined,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        showMessage(`✅ Session is now RUNNING — scanning ${data.total_scans} endpoint(s). Polling for progress…`, 'success');
        runSection.classList.add('hidden');
        progressSection.classList.remove('hidden');
        headerBadges.innerHTML = '<span class="badge badge-session-running">RUNNING</span>';
        startPolling();
    } catch (err) {
        showMessage(`❌ ${err.message}`, 'error');
        runBtn.disabled = false;
        runBtn.textContent = '▶ Run Session';
    }
});

// ── Child scans ───────────────────────────────────────────────────────────────
function renderScans(scans) {
    scansSubtitle.textContent = `${scans.length} scan(s)`;

    if (!scans.length) {
        scansState.classList.remove('hidden');
        scansWrapper.classList.add('hidden');
        return;
    }

    scansBody.innerHTML = scans.map(scan => {
        const score   = scan.diff_evidence?.score ?? '—';
        const findings = scan._count?.findings ?? 0;
        const date    = new Date(scan.created_at).toLocaleString();

        return `<tr>
            <td><span class="url-cell" title="${esc(scan.target_url)}">${esc(scan.target_url)}</span></td>
            <td><span class="badge badge-${esc(scan.http_method).toLowerCase()}">${esc(scan.http_method)}</span></td>
            <td><span class="badge badge-${esc(scan.heuristic_status).toLowerCase()}">${esc(scan.heuristic_status)}</span></td>
            <td style="text-align:center">${score !== '—' ? `<b>${score}</b>/100` : '—'}</td>
            <td style="text-align:center">${findings > 0 ? `<strong class="text-danger">${findings}</strong>` : '0'}</td>
            <td class="text-muted text-sm">${date}</td>
            <td>
                ${findings > 0
                    ? `<button class="table-action" data-action="findings" data-scan-id="${esc(scan.id)}">🔎 Findings</button>`
                    : '—'}
            </td>
        </tr>`;
    }).join('');

    scansWrapper.classList.remove('hidden');
    scansState.classList.add('hidden');
}

scansBody.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'findings') {
        window.location.href = `/findings.html?scanId=${encodeURIComponent(btn.dataset.scanId)}`;
    }
});

// ── Polling (for RUNNING sessions) ───────────────────────────────────────────
function startPolling() {
    if (pollingTimer) return;
    pollingTimer = setInterval(async () => {
        try {
            const res = await fetch(`${API}/sessions/${sessionId}`);
            if (!res.ok) return;
            const s = await res.json();

            // Update progress bar
            const pct = s.total_endpoints > 0
                ? Math.round((s.scanned_endpoints / s.total_endpoints) * 100)
                : 0;
            progressBar.style.width   = `${pct}%`;
            progressLabel.textContent  = `${s.scanned_endpoints} / ${s.total_endpoints}`;

            // Refresh scans table
            renderScans(s.scans ?? []);

            // Stop polling when done
            if (s.status === 'COMPLETED' || s.status === 'FAILED') {
                stopPolling();
                headerBadges.innerHTML = `<span class="badge badge-session-${esc(s.status).toLowerCase()}">${esc(s.status)}</span>`;
                if (s.status === 'COMPLETED') {
                    showMessage('✅ Session completed.', 'success');
                } else {
                    showMessage('❌ Session encountered an error.', 'error');
                }
            }
        } catch {
            // Silently fail — next tick will retry
        }
    }, 3000);
}

function stopPolling() {
    clearInterval(pollingTimer);
    pollingTimer = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showMessage(text, type) {
    runMessage.textContent = text;
    runMessage.className   = `result-message ${type}`;
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
