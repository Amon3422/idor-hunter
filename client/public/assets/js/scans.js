'use strict';

const API = '/api';
let currentPage = 1;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const scansBody      = document.getElementById('scansBody');
const tableState     = document.getElementById('tableState');
const tableWrapper   = document.getElementById('tableWrapper');
const paginationEl   = document.getElementById('pagination');
const filterStatus   = document.getElementById('filterStatus');
const filterLimit    = document.getElementById('filterLimit');
const refreshBtn     = document.getElementById('refreshBtn');

// ── Init ──────────────────────────────────────────────────────────────────────
loadScans();
loadSummary();

refreshBtn.addEventListener('click', () => { currentPage = 1; loadScans(); loadSummary(); });
filterStatus.addEventListener('change', () => { currentPage = 1; loadScans(); });
filterLimit.addEventListener('change',  () => { currentPage = 1; loadScans(); });

// ── Summary cards ─────────────────────────────────────────────────────────────
async function loadSummary() {
    try {
        const [all, suspicious, clean, findings] = await Promise.all([
            fetch(`${API}/scans?limit=1`).then(r => r.json()),
            fetch(`${API}/scans?limit=1&status=SUSPICIOUS`).then(r => r.json()),
            fetch(`${API}/scans?limit=1&status=CLEAN`).then(r => r.json()),
            fetch(`${API}/findings?limit=1`).then(r => r.json()),
        ]);
        document.getElementById('sumTotal').textContent     = all.meta?.total       ?? '—';
        document.getElementById('sumSuspicious').textContent = suspicious.meta?.total ?? '—';
        document.getElementById('sumClean').textContent      = clean.meta?.total      ?? '—';
        document.getElementById('sumFindings').textContent   = findings.meta?.total   ?? '—';
    } catch {
        // non-critical — leave as —
    }
}

// ── Load table ────────────────────────────────────────────────────────────────
async function loadScans() {
    setLoading(true);

    const params = new URLSearchParams({
        page:  currentPage,
        limit: filterLimit.value,
    });
    if (filterStatus.value) params.set('status', filterStatus.value);

    try {
        const res  = await fetch(`${API}/scans?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { data, meta } = await res.json();

        renderRows(data);
        renderPagination(meta);
        setLoading(false);
    } catch (err) {
        tableState.innerHTML = `<p class="text-danger">Failed to load scans: ${err.message}</p>`;
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
    }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderRows(scans) {
    if (!scans.length) {
        tableState.innerHTML = '<p>No scans found. <a href="/manual-test.html">Run your first scan →</a></p>';
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
        return;
    }

    scansBody.innerHTML = scans.map(scan => {
        const score     = scan.diff_evidence?.score ?? '—';
        const findingsCount = scan._count?.findings ?? 0;
        const date      = new Date(scan.created_at).toLocaleString();

        return `<tr>
            <td><span class="url-cell" title="${esc(scan.target_url)}">${esc(scan.target_url)}</span></td>
            <td><span class="badge badge-${esc(scan.http_method).toLowerCase()}">${esc(scan.http_method)}</span></td>
            <td>${esc(scan.api_type)}</td>
            <td><span class="badge badge-${esc(scan.heuristic_status).toLowerCase()}">${esc(scan.heuristic_status)}</span></td>
            <td style="text-align:center">${findingsCount > 0 ? `<strong class="text-danger">${findingsCount}</strong>` : '0'}</td>
            <td style="text-align:center">${score !== '—' ? `<b>${score}</b>/100` : '—'}</td>
            <td class="text-muted text-sm">${date}</td>
            <td>
                <button class="table-action" data-action="findings" data-scan-id="${esc(scan.id)}">🔎 Findings</button>
                <button class="table-action" data-action="run" data-scan-id="${esc(scan.id)}">▶ Run</button>
            </td>
        </tr>`;
    }).join('');

    tableWrapper.classList.remove('hidden');
    tableState.classList.add('hidden');
}

function renderPagination({ page, totalPages }) {
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

    const pages = [];
    pages.push(`<button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹ Prev</button>`);

    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== totalPages) {
            if (i === page - 3 || i === page + 3) pages.push('<span style="padding:0 4px">…</span>');
            continue;
        }
        pages.push(`<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`);
    }

    pages.push(`<button class="page-btn" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">Next ›</button>`);
    paginationEl.innerHTML = pages.join('');
}

// ── Actions (event delegation) ────────────────────────────────────────────────
scansBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const scanId = btn.dataset.scanId;
    if (btn.dataset.action === 'findings') viewFindings(scanId);
    if (btn.dataset.action === 'run')      runScan(scanId, btn);
});

paginationEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn && !btn.disabled) goPage(Number(btn.dataset.page));
});

function viewFindings(scanId) {
    window.location.href = `/findings.html?scanId=${scanId}`;
}

async function runScan(scanId, btn) {
    btn.disabled = true;
    btn.textContent = '…';
    try {
        const res  = await fetch(`${API}/scans/${scanId}/run`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        let msg = `Scan complete!\nStatus: ${data.diff?.isSuspicious ? '⚠️ SUSPICIOUS' : '✅ CLEAN'}\nScore: ${data.diff?.score ?? '—'}/100`;
        if (data.finding) msg += `\n\n🔴 Finding created: ${data.finding.severity}`;
        else if (data.diff?.isSuspicious && !data.llmError) msg += `\n\nℹ️ LLM did not confirm a vulnerability (no finding created)`;
        if (data.llmError) msg += `\n\n⚠️ LLM analysis failed: ${data.llmError}`;
        alert(msg);
        loadScans();
        loadSummary();
    } catch (err) {
        alert(`Run failed: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '▶ Run';
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function goPage(page) { currentPage = page; loadScans(); window.scrollTo(0, 0); }

function setLoading(loading) {
    if (loading) {
        tableState.innerHTML = '<div class="spinner"></div><p>Loading scans...</p>';
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
    }
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
