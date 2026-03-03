document.getElementById('idorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    const resultContainer = document.getElementById('resultContainer');
    const resultContent = document.getElementById('resultContent');
    
    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Running Test<span class="spinner"></span>';
    resultContainer.classList.remove('show');
    
    try {
        // Parse headers from textarea (one per line: "Header: value")
        const parseHeaders = (headersText) => {
            const headers = {};
            headersText.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split(':');
                if (key && valueParts.length) {
                    headers[key.trim()] = valueParts.join(':').trim();
                }
            });
            return headers;
        };
        
        // Get form data
        const formData = {
            url: document.getElementById('url').value.trim(),
            method: document.getElementById('method').value,
            apiType: document.getElementById('apiType').value,
            body: document.getElementById('body').value.trim() || null,
            accountA: {
                headers: parseHeaders(document.getElementById('headersA').value),
                cookies: document.getElementById('cookiesA').value.trim() || null
            },
            accountB: {
                headers: parseHeaders(document.getElementById('headersB').value),
                cookies: document.getElementById('cookiesB').value.trim() || null
            }
        };
        
        // Validate JSON body if provided
        if (formData.body) {
            try {
                JSON.parse(formData.body);
            } catch (_err) {
                throw new Error('Invalid JSON in request body', { cause: _err });
            }
        }
        
        // Send to backend API
        const response = await fetch('/api/scans', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to run IDOR test');
        }
        
        // Display results
        const isVuln   = data.heuristic_status === 'SUSPICIOUS';
        const hasFinding = data.findings && data.findings.length > 0;
        const firstFinding = hasFinding ? data.findings[0] : null;

        const findingBlock = hasFinding ? data.findings.map(f => `
  <div class="result-finding">
    <strong>[${f.severity}]</strong> ${f.title || 'Potential IDOR'}
    <div class="result-finding-reason">${f.llm_reasoning || ''}</div>
    <a href="/finding-detail.html?id=${f.id}" class="result-link">→ View Full Finding</a>
  </div>`).join('') : '';

        resultContent.innerHTML = `
<div class="${isVuln ? 'error' : 'success'}">${isVuln ? '⚠ POTENTIAL IDOR VULNERABILITY DETECTED' : '✓ No IDOR vulnerability detected'}</div>

<strong>Scan ID:</strong> ${data.id}
<strong>Status:</strong> ${data.heuristic_status}
<strong>Target:</strong> ${data.target_url}
<strong>Method:</strong> ${data.http_method}

<strong>Diff Score:</strong> ${data.diff_evidence?.score ?? '—'}

${hasFinding ? `<div class="result-findings-header">Findings:</div>${findingBlock}` : ''}

<div class="result-actions">
  <a href="/scans.html" class="btn btn-sm btn-outline">📊 View Scan History</a>
  ${hasFinding ? `<a href="/findings.html" class="btn btn-sm">🔎 View All Findings</a>` : ''}
  ${firstFinding ? `<a href="/finding-detail.html?id=${firstFinding.id}" class="btn btn-sm">🔍 Open Finding</a>` : ''}
</div>
        `;
        
        resultContainer.classList.add('show');
        
    } catch (error) {
        console.error('Error:', error);
        resultContent.innerHTML = `<div class="error">✗ ${error.message}</div>`;
        resultContainer.classList.add('show');
    } finally {
        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Run IDOR Test';
    }
});