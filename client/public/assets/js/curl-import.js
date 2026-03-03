/**
 * IDOR Hunter - cURL Import Module
 * Optimized Version: 2026-03-02
 */

// 1. Configuration & Constants
const API_BASE = '/api';
const UI_CONFIG = {
    SCROLL_DELAY: 300,
    MESSAGE_DURATION: 5000,
    REDIRECT_DELAY: 2000
};

// 2. UI Element Caching (Performance)
const UI = {
    textarea: document.getElementById('curlCommand'),
    btnAnalyze: document.getElementById('analyzeBtn'),
    btnCreate: document.getElementById('createScanBtn'),
    preview: document.getElementById('parsedPreview'),
    jsonDisplay: document.getElementById('parsedJson'),
    copyBtn: document.getElementById('copyJsonBtn'),
    msgBox: document.getElementById('resultMessage'),
    accBHeaders: document.getElementById('accountBHeaders'),
    accBCookies: document.getElementById('accountBCookies'),
    configSection: document.querySelector('.account-config')
};

// 3. Application State
let state = {
    lastParsedCommand: null,
    isProcessing: false
};

/**
 * Initialization
 */
function init() {
    UI.btnAnalyze.addEventListener('click', handleAnalyze);
    UI.btnCreate.addEventListener('click', handleCreateScan);
    UI.copyBtn.addEventListener('click', handleCopyJson);

    // Dirty Check: If user edits the cURL, they MUST re-analyze before scanning
    UI.textarea.addEventListener('input', () => {
        if (state.lastParsedCommand) {
            UI.btnCreate.disabled = true;
            UI.btnCreate.title = "cURL changed. Please analyze again.";
            UI.btnCreate.classList.add('btn-disabled');
        }
    });
}

/**
 * Core Logic: Analyze & Parse cURL
 */
async function handleAnalyze() {
    const curl = UI.textarea.value.trim();
    if (!curl) return showMessage('Please enter a cURL command', 'error');

    updateLoadingState(UI.btnAnalyze, true, '🔄 Parsing...');
    UI.preview.style.display = 'none';

    try {
        const result = await apiRequest('/curl/parse', { curlCommand: curl });

        // Update State
        state.lastParsedCommand = curl;
        
        // Update UI
        UI.jsonDisplay.textContent = JSON.stringify(result.data, null, 2);
        UI.preview.style.display = 'block';
        
        // Enable next step
        UI.btnCreate.disabled = false;
        UI.btnCreate.classList.remove('btn-disabled');
        UI.btnCreate.title = "";

        showMessage('✅ Parsed successfully! Configure Account B to proceed.', 'success');
        
        setTimeout(() => {
            UI.configSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, UI_CONFIG.SCROLL_DELAY);

    } catch (error) {
        showMessage(`❌ Parse Error: ${error.message}`, 'error');
    } finally {
        updateLoadingState(UI.btnAnalyze, false, '⚙️ Analyze cURL');
    }
}

/**
 * Core Logic: Create IDOR Scan
 */
async function handleCreateScan() {
    // Validation
    if (UI.textarea.value.trim() !== state.lastParsedCommand) {
        return showMessage('⚠️ cURL content changed. Please click "Analyze cURL" again.', 'error');
    }

    const headersB = parseHeaders(UI.accBHeaders.value);
    if (Object.keys(headersB).length === 0) {
        UI.accBHeaders.focus();
        return showMessage('❌ Please provide at least one header for Account B.', 'error');
    }

    updateLoadingState(UI.btnCreate, true, '🚀 Initializing Scan...');

    try {
        const payload = {
            curlCommand: state.lastParsedCommand,
            apiType: detectApiType(state.lastParsedCommand),
            accountB: {
                headers: headersB,
                cookies: UI.accBCookies.value.trim() || null,
            },
        };

        const result = await apiRequest('/curl/scan', payload);
        
        showMessage(`✅ Scan created (ID: ${result.id}). Redirecting...`, 'success');
        setTimeout(() => { window.location.href = 'index.html'; }, UI_CONFIG.REDIRECT_DELAY);
        
    } catch (error) {
        showMessage(`❌ Scan Failed: ${error.message}`, 'error');
        updateLoadingState(UI.btnCreate, false, '🚀 Create IDOR Scan');
    }
}

/**
 * Optimized Header Parser using native Headers API
 */
function parseHeaders(rawText) {
    if (!rawText.trim()) return {};

    const headerMap = new Headers();
    const lines = rawText.split(/\r?\n/);

    lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim();
            try {
                headerMap.append(key, value);
            } catch { /* Ignore invalid header names */ }
        }
    });

    // Convert to plain object for API consumption
    const finalHeaders = {};
    headerMap.forEach((value, key) => {
        finalHeaders[key] = value;
    });
    return finalHeaders;
}

/**
 * Helper: Centralized Fetch Wrapper
 */
async function apiRequest(endpoint, body) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Server connection failed');
    return result;
}

/**
 * Utility Functions
 */
function detectApiType(curl) {
    return /graphql/i.test(curl) ? 'GRAPHQL' : 'REST';
}

function showMessage(text, type) {
    UI.msgBox.textContent = text;
    UI.msgBox.className = `result-message ${type}`;
    UI.msgBox.style.display = 'block';
    if (type === 'info' || type === 'success') {
        setTimeout(() => { UI.msgBox.style.display = 'none'; }, UI_CONFIG.MESSAGE_DURATION);
    }
}

function updateLoadingState(btn, isLoading, text) {
    btn.disabled = isLoading;
    btn.innerHTML = text;
    state.isProcessing = isLoading;
}

function handleCopyJson() {
    if (!UI.jsonDisplay.textContent) return;
    navigator.clipboard.writeText(UI.jsonDisplay.textContent).then(() => {
        const originalText = UI.copyBtn.innerHTML;
        UI.copyBtn.innerHTML = '✅';
        setTimeout(() => { UI.copyBtn.innerHTML = originalText; }, 2000);
    });
}

// Start
init();