'use strict';

(function () {
    const NAV_LINKS = [
        { href: '/',                  label: 'Dashboard',   section: 'overview',
          icon: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
          match: ['/'] },
        { href: '/manual-test.html',  label: 'Manual Test', section: 'testing',
          icon: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
          match: ['/manual-test.html'] },
        { href: '/curl-import.html',  label: 'cURL Import', section: 'testing',
          icon: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
          match: ['/curl-import.html'] },
        { href: '/sessions.html',      label: 'Sessions',    section: 'results',
          icon: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/></svg>',
          match: ['/sessions.html', '/session-detail.html'] },
        { href: '/scans.html',        label: 'Scans',       section: 'results',
          icon: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
          match: ['/scans.html'] },
        { href: '/findings.html',     label: 'Findings',    section: 'results',
          icon: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
          match: ['/findings.html', '/finding-detail.html'] },
    ];

    const currentPath = window.location.pathname;

    function isActive(link) {
        return link.match.some(m => currentPath === m || currentPath.endsWith(m));
    }

    // Group links by section
    const sections = { overview: 'Overview', testing: 'Testing', results: 'Results' };
    let linksHtml = '';
    let lastSection = '';

    for (const link of NAV_LINKS) {
        if (link.section !== lastSection) {
            linksHtml += `<div class="sidebar-section">${sections[link.section]}</div>`;
            lastSection = link.section;
        }
        linksHtml += `
            <a href="${link.href}" class="nav-item ${isActive(link) ? 'active' : ''}">
                ${link.icon}
                <span>${link.label}</span>
            </a>`;
    }

    const sidebarHtml = `
        <aside class="sidebar" id="sidebar">
            <a href="/" class="sidebar-brand">
                <div class="sidebar-brand-icon">🛡️</div>
                <div>
                    <div class="sidebar-brand-name">IDOR Hunter</div>
                    <span class="sidebar-brand-tag">Security Scanner</span>
                </div>
            </a>
            <nav class="sidebar-nav">${linksHtml}</nav>
            <div class="sidebar-footer">
                <div class="api-status">
                    <span class="status-dot" id="navStatusDot"></span>
                    <span id="navStatusLabel">Checking API…</span>
                </div>
            </div>
        </aside>

        <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle navigation">☰</button>
        <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
    `;

    // Insert sidebar at start of .app-layout
    const layout = document.querySelector('.app-layout');
    if (layout) {
        layout.insertAdjacentHTML('afterbegin', sidebarHtml);
    }

    // Mobile toggle
    const sidebar  = document.getElementById('sidebar');
    const toggle   = document.getElementById('sidebarToggle');
    const backdrop = document.getElementById('sidebarBackdrop');

    function openSidebar()  { sidebar.classList.add('open'); backdrop.classList.add('open'); }
    function closeSidebar() { sidebar.classList.remove('open'); backdrop.classList.remove('open'); }

    if (toggle)   toggle.addEventListener('click', openSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // Ping health for status
    fetch('/api/health')
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
            if (data.status === 'ok') {
                document.getElementById('navStatusDot').className = 'status-dot online';
                document.getElementById('navStatusLabel').textContent = 'API Online';
            } else { throw new Error(); }
        })
        .catch(() => {
            document.getElementById('navStatusDot').className = 'status-dot offline';
            document.getElementById('navStatusLabel').textContent = 'API Offline';
        });
})();
