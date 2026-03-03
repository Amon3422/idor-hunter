'use strict';

const API = '/api';
let currentPage = 1;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const findingsBody   = document.getElementById('findingsBody');
const tableState     = document.getElementById('tableState');
const tableWrapper   = document.getElementById('tableWrapper');
const paginationEl   = document.getElementById('pagination');
const filterSeverity = document.getElementById('filterSeverity');
const filterStatus   = document.getElementById('filterStatus');
const filterLimit    = document.getElementById('filterLimit');
const refreshBtn     = document.getElementById('refreshBtn');
const drawer         = document.getElementById('drawer');
const drawerOverlay  = document.getElementById('drawerOverlay');
const drawerClose    = document.getElementById('drawerClose');
const drawerBody     = document.getElementById('drawerBody');
const drawerTitle    = document.getElementById('drawerTitle');
const exportBtn      = document.getElementById('exportBtn');
const exportMenu     = document.getElementById('exportMenu');

// ── Init ──────────────────────────────────────────────────────────────────────
// Pre-fill scanId filter from URL query string
const urlParams = new URLSearchParams(window.location.search);
const scanIdParam = urlParams.get('scanId');

loadFindings();
loadSummary();

refreshBtn.addEventListener('click',      () => { currentPage = 1; loadFindings(); loadSummary(); });
filterSeverity.addEventListener('change', () => { currentPage = 1; loadFindings(); });
filterStatus.addEventListener('change',   () => { currentPage = 1; loadFindings(); });
filterLimit.addEventListener('change',    () => { currentPage = 1; loadFindings(); });

drawerClose.addEventListener('click',    closeDrawer);
drawerOverlay.addEventListener('click',  closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

// ── Export dropdown ───────────────────────────────────────────────────────────
exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
});

document.addEventListener('click', () => exportMenu.classList.remove('open'));

exportMenu.querySelectorAll('.export-menu-item').forEach(item => {
    item.addEventListener('click', () => {
        const format = item.dataset.format;
        exportFindings(format);
        exportMenu.classList.remove('open');
    });
});

function exportFindings(format) {
    const params = new URLSearchParams({ format });
    if (filterSeverity.value) params.set('severity', filterSeverity.value);
    if (filterStatus.value)   params.set('status',   filterStatus.value);
    if (scanIdParam)          params.set('scanId',   scanIdParam);

    const a = document.createElement('a');
    a.href = `${API}/findings/export?${params}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// ── Summary cards ─────────────────────────────────────────────────────────────
async function loadSummary() {
    try {
        const [critical, high, medium, open] = await Promise.all([
            fetch(`${API}/findings?limit=1&severity=CRITICAL`).then(r => r.json()),
            fetch(`${API}/findings?limit=1&severity=HIGH`).then(r => r.json()),
            fetch(`${API}/findings?limit=1&severity=MEDIUM`).then(r => r.json()),
            fetch(`${API}/findings?limit=1&status=OPEN`).then(r => r.json()),
        ]);
        document.getElementById('sumCritical').textContent = critical.meta?.total ?? '—';
        document.getElementById('sumHigh').textContent     = high.meta?.total     ?? '—';
        document.getElementById('sumMedium').textContent   = medium.meta?.total   ?? '—';
        document.getElementById('sumOpen').textContent     = open.meta?.total     ?? '—';
    } catch {
        // non-critical
    }
}

// ── Load table ────────────────────────────────────────────────────────────────
async function loadFindings() {
    setLoading(true);

    const params = new URLSearchParams({
        page:  currentPage,
        limit: filterLimit.value,
    });
    if (filterSeverity.value) params.set('severity', filterSeverity.value);
    if (filterStatus.value)   params.set('status',   filterStatus.value);
    if (scanIdParam)          params.set('scanId',   scanIdParam);

    try {
        const res = await fetch(`${API}/findings?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { data, meta } = await res.json();

        renderRows(data);
        renderPagination(meta);
        setLoading(false);
    } catch (err) {
        tableState.innerHTML = `<p class="text-danger">Failed to load findings: ${err.message}</p>`;
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
    }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderRows(findings) {
    if (!findings.length) {
        const msg = scanIdParam
            ? 'No findings for this scan. The scan may be clean.'
            : 'No findings yet. Run a scan to detect IDOR vulnerabilities.';
        tableState.innerHTML = `<p>${msg} <a href="/scans.html">View scans →</a></p>`;
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
        return;
    }

    findingsBody.innerHTML = findings.map(f => {
        const endpoint = f.affected_endpoint || `${f.scan?.http_method ?? ''} ${f.scan?.target_url ?? ''}`;
        const date     = new Date(f.created_at).toLocaleString();

        return `<tr>
            <td><span class="badge badge-${esc(f.severity).toLowerCase()}">${esc(f.severity)}</span></td>
            <td><span class="url-cell" title="${esc(endpoint)}">${esc(endpoint)}</span></td>
            <td><span class="reasoning-cell" title="${esc(f.llm_reasoning)}">${esc(f.llm_reasoning)}</span></td>
            <td><span class="badge badge-${esc(f.finding_status).toLowerCase().replace('_', '-')}">${esc(f.finding_status.replace('_', ' '))}</span></td>
            <td class="text-muted text-sm" style="white-space:nowrap">${date}</td>
            <td>
                <a href="/finding-detail.html?id=${esc(f.id)}" class="table-action">Details →</a>
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

// ── Detail Drawer ─────────────────────────────────────────────────────────────
window.openDrawer = openDrawer; // called from HTML
function openDrawer(finding) {
    const endpoint = finding.affected_endpoint || `${finding.scan?.http_method ?? ''} ${finding.scan?.target_url ?? ''}`;

    drawerTitle.textContent = `${finding.severity} — ${endpoint}`;
    drawerBody.innerHTML = `
        <div class="drawer-section">
            <h3>Endpoint</h3>
            <p style="font-family:var(--font-mono);font-size:.85rem">${esc(endpoint)}</p>
        </div>
        <div class="drawer-section">
            <h3>Severity</h3>
            <span class="badge badge-${esc(finding.severity).toLowerCase()}">${esc(finding.severity)}</span>
        </div>
        <div class="drawer-section">
            <h3>AI Reasoning</h3>
            <p>${esc(finding.llm_reasoning)}</p>
        </div>
        <div class="drawer-section">
            <h3>Reproduction Steps</h3>
            <p>${esc(finding.repro_steps)}</p>
        </div>
        <div class="drawer-section">
            <h3>Suggested Fix</h3>
            <p>${esc(finding.suggested_fix)}</p>
        </div>
        <div class="drawer-section">
            <h3>Analyst Status</h3>
            <div class="status-select-row">
                <select id="statusSelect">
                    <option value="OPEN"           ${finding.finding_status === 'OPEN'           ? 'selected' : ''}>Open</option>
                    <option value="FALSE_POSITIVE" ${finding.finding_status === 'FALSE_POSITIVE' ? 'selected' : ''}>False Positive</option>
                    <option value="FIXED"          ${finding.finding_status === 'FIXED'          ? 'selected' : ''}>Fixed</option>
                </select>
                <button class="btn btn-sm" data-action="save-status" data-finding-id="${esc(finding.id)}">Save</button>
            </div>
        </div>
    `;

    drawer.classList.add('open');
    drawerOverlay.classList.add('open');
}

function closeDrawer() {
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
}

// ── Event delegation for drawer save button ─────────────────────────────────
drawerBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="save-status"]');
    if (btn) updateStatus(btn.dataset.findingId);
});

// ── Event delegation for pagination ─────────────────────────────────────────
paginationEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn && !btn.disabled) goPage(Number(btn.dataset.page));
});

window.updateStatus = updateStatus;
async function updateStatus(findingId) {
    const select = document.getElementById('statusSelect');
    const status = select.value;
    try {
        const res = await fetch(`${API}/findings/${findingId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        closeDrawer();
        loadFindings();
        loadSummary();
    } catch (err) {
        alert(`Failed to update status: ${err.message}`);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function goPage(page) { currentPage = page; loadFindings(); window.scrollTo(0, 0); }

function setLoading(loading) {
    if (loading) {
        tableState.innerHTML = '<div class="spinner"></div><p>Loading findings...</p>';
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
    }
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
