'use strict';

// ── Dashboard: load live stats on page load ───────────────────────────────────
loadStats();
setInterval(loadStats, 30000);

async function loadStats() {
    try {
        const [scans, findings, critical, open, sessions] = await Promise.all([
            fetch('/api/scans?limit=1').then(r => r.json()).catch(() => null),
            fetch('/api/findings?limit=1').then(r => r.json()).catch(() => null),
            fetch('/api/findings?limit=1&severity=CRITICAL').then(r => r.json()).catch(() => null),
            fetch('/api/findings?limit=1&status=OPEN').then(r => r.json()).catch(() => null),
            fetch('/api/sessions?limit=1').then(r => r.json()).catch(() => null),
        ]);
        document.getElementById('totalScans').textContent      = scans?.meta?.total    ?? '—';
        document.getElementById('totalFindings').textContent   = findings?.meta?.total ?? '—';
        document.getElementById('criticalFindings').textContent = critical?.meta?.total ?? '—';
        document.getElementById('openFindings').textContent    = open?.meta?.total     ?? '—';
        const sessionsEl = document.getElementById('totalSessions');
        if (sessionsEl) sessionsEl.textContent = sessions?.meta?.total ?? '—';
    } catch {
        // non-critical — keep placeholders
    }
}
