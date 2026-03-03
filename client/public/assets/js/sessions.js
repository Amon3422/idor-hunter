'use strict';

const API = '/api';
let currentPage = 1;
let pendingDeleteId = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const sessionsBody  = document.getElementById('sessionsBody');
const tableState    = document.getElementById('tableState');
const tableWrapper  = document.getElementById('tableWrapper');
const paginationEl  = document.getElementById('pagination');
const filterStatus  = document.getElementById('filterStatus');
const filterLimit   = document.getElementById('filterLimit');
const refreshBtn    = document.getElementById('refreshBtn');

// Delete modal
const deleteOverlay    = document.getElementById('deleteOverlay');
const deleteModalClose = document.getElementById('deleteModalClose');
const deleteCancelBtn  = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
const deleteSessionName = document.getElementById('deleteSessionName');

// ── Init ──────────────────────────────────────────────────────────────────────
loadSessions();
loadSummary();

refreshBtn.addEventListener('click',      () => { currentPage = 1; loadSessions(); loadSummary(); });
filterStatus.addEventListener('change',   () => { currentPage = 1; loadSessions(); });
filterLimit.addEventListener('change',    () => { currentPage = 1; loadSessions(); });

// Delete modal events
deleteModalClose.addEventListener('click',  closeDeleteModal);
deleteCancelBtn.addEventListener('click',   closeDeleteModal);
deleteOverlay.addEventListener('click', e => { if (e.target === deleteOverlay) closeDeleteModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDeleteModal(); });

deleteConfirmBtn.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    deleteConfirmBtn.disabled = true;
    deleteConfirmBtn.textContent = 'Deleting…';
    try {
        const res = await fetch(`${API}/sessions/${pendingDeleteId}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
        closeDeleteModal();
        loadSessions();
        loadSummary();
    } catch (err) {
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = 'Delete';
        alert(`Delete failed: ${err.message}`);
    }
});

// ── Summary cards ─────────────────────────────────────────────────────────────
async function loadSummary() {
    try {
        const [all, running, completed, failed] = await Promise.all([
            fetch(`${API}/sessions?limit=1`).then(r => r.json()),
            fetch(`${API}/sessions?limit=1&status=RUNNING`).then(r => r.json()),
            fetch(`${API}/sessions?limit=1&status=COMPLETED`).then(r => r.json()),
            fetch(`${API}/sessions?limit=1&status=FAILED`).then(r => r.json()),
        ]);
        document.getElementById('sumTotal').textContent     = all.meta?.total       ?? '—';
        document.getElementById('sumRunning').textContent   = running.meta?.total   ?? '—';
        document.getElementById('sumCompleted').textContent = completed.meta?.total ?? '—';
        document.getElementById('sumFailed').textContent    = failed.meta?.total    ?? '—';
    } catch {
        // non-critical
    }
}

// ── Load table ────────────────────────────────────────────────────────────────
async function loadSessions() {
    tableState.innerHTML = '<div class="spinner"></div><p>Loading sessions…</p>';
    tableState.classList.remove('hidden');
    tableWrapper.classList.add('hidden');

    const params = new URLSearchParams({ page: currentPage, limit: filterLimit.value });
    if (filterStatus.value) params.set('status', filterStatus.value);

    try {
        const res = await fetch(`${API}/sessions?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { data, meta } = await res.json();

        renderRows(data);
        renderPagination(meta);
    } catch (err) {
        tableState.innerHTML = `<p class="text-danger">Failed to load sessions: ${esc(err.message)}</p>`;
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
    }
}

// ── Render rows ───────────────────────────────────────────────────────────────
function renderRows(sessions) {
    if (!sessions.length) {
        tableState.innerHTML = '<p>No sessions found. Create one by importing a Swagger spec.</p>';
        tableState.classList.remove('hidden');
        tableWrapper.classList.add('hidden');
        return;
    }

    sessionsBody.innerHTML = sessions.map(s => {
        const total    = s.total_endpoints   ?? 0;
        const done     = s.scanned_endpoints ?? 0;
        const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
        const childScans = s._count?.scans ?? 0;
        const date     = new Date(s.created_at).toLocaleString();
        const label    = s.name || esc(s.base_url);

        return `<tr>
            <td>
                <div class="font-medium">${esc(label)}</div>
                ${s.name ? `<div class="text-muted text-sm mono">${esc(s.base_url)}</div>` : ''}
            </td>
            <td><span class="badge badge-session-${esc(s.status).toLowerCase()}">${esc(s.status)}</span></td>
            <td style="min-width:140px">
                <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;background:var(--border);border-radius:999px;height:6px;overflow:hidden">
                        <div style="height:100%;background:var(--accent);border-radius:999px;width:${pct}%"></div>
                    </div>
                    <span class="text-muted text-sm" style="white-space:nowrap">${done}/${total}</span>
                </div>
            </td>
            <td style="text-align:center">${childScans}</td>
            <td class="text-muted text-sm">${date}</td>
            <td>
                <button class="table-action" data-action="detail" data-id="${esc(s.id)}">🔍 Detail</button>
                <button class="table-action table-action-danger" data-action="delete" data-id="${esc(s.id)}" data-name="${esc(label)}">🗑</button>
            </td>
        </tr>`;
    }).join('');

    tableWrapper.classList.remove('hidden');
    tableState.classList.add('hidden');
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination({ page, pages }) {
    if (!pages || pages <= 1) { paginationEl.innerHTML = ''; return; }

    const btns = [];
    btns.push(`<button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹ Prev</button>`);
    for (let i = 1; i <= pages; i++) {
        if (pages > 7 && Math.abs(i - page) > 2 && i !== 1 && i !== pages) {
            if (i === page - 3 || i === page + 3) btns.push('<span style="padding:0 4px">…</span>');
            continue;
        }
        btns.push(`<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`);
    }
    btns.push(`<button class="page-btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">Next ›</button>`);
    paginationEl.innerHTML = btns.join('');
}

paginationEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (!btn || btn.disabled) return;
    currentPage = parseInt(btn.dataset.page, 10);
    loadSessions();
});

// ── Action delegation ─────────────────────────────────────────────────────────
sessionsBody.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const { action, id, name } = btn.dataset;

    if (action === 'detail') {
        window.location.href = `/session-detail.html?id=${encodeURIComponent(id)}`;
    }
    if (action === 'delete') {
        pendingDeleteId = id;
        deleteSessionName.textContent = name;
        deleteConfirmBtn.disabled = false;
        deleteConfirmBtn.textContent = 'Delete';
        deleteOverlay.classList.remove('hidden');
    }
});

// ── Delete modal ──────────────────────────────────────────────────────────────
function closeDeleteModal() {
    deleteOverlay.classList.add('hidden');
    pendingDeleteId = null;
}

// ── Utility ───────────────────────────────────────────────────────────────────
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
