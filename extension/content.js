/**
 * Universal AI Exporter & Prompt Compressor - Content Script
 * Injects modern floating drawer & handles interactive compression & export.
 */

(function () {
  'use strict';

  let currentConversation = null;
  let compressedResult = null;
  let isModalOpen = false;

  // Options state
  const compressionOptions = {
    stripFiller: true,
    omitThinking: true,
    compactWhitespace: true,
    handoverFormat: 'markdown'
  };

  function showToast(message) {
    const existing = document.querySelector('.ai-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'ai-toast';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  function createFloatingTrigger() {
    if (document.getElementById('ai-exporter-trigger')) return;

    const btn = document.createElement('div');
    btn.id = 'ai-exporter-trigger';
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
      </svg>
      <span>Export & Compress</span>
    `;

    btn.onclick = toggleModal;
    document.body.appendChild(btn);
  }

  async function toggleModal() {
    isModalOpen = !isModalOpen;
    const existing = document.getElementById('ai-exporter-modal');

    if (!isModalOpen) {
      if (existing) existing.remove();
      return;
    }

    if (existing) existing.remove();
    await renderModal();
  }

  async function renderModal() {
    const modal = document.createElement('div');
    modal.id = 'ai-exporter-modal';

    // Show loading state first
    modal.innerHTML = `
      <div class="ai-modal-header">
        <div class="ai-modal-title">
          <span>⚡ Context Compressor</span>
        </div>
        <button class="ai-modal-close" id="ai-modal-close-btn">&times;</button>
      </div>
      <div class="ai-modal-body" style="align-items: center; justify-content: center; min-height: 180px;">
        <div style="color: #94a3b8; font-size: 13px;">Analyzing conversation & tokens...</div>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('ai-modal-close-btn').onclick = toggleModal;

    // Fetch conversation data
    try {
      if (!window.UniversalAIExporter) {
        throw new Error('UniversalAIExporter engine not loaded');
      }
      currentConversation = await window.UniversalAIExporter.extractCurrentConversation();
      recalculateCompression(modal);
    } catch (err) {
      console.error('[AI Exporter]', err);
      modal.querySelector('.ai-modal-body').innerHTML = `
        <div style="color: #f87171; text-align: center; font-size: 13px; padding: 10px;">
          ❌ Could not detect an active conversation on this page.<br/><br/>
          <span style="color: #94a3b8; font-size: 12px;">Make sure a conversation is currently open, then try again.</span>
        </div>
      `;
    }
  }

  function recalculateCompression(modal) {
    if (!currentConversation || !window.PromptCompressor) return;

    compressedResult = window.PromptCompressor.compressConversation(currentConversation, compressionOptions);

    const body = modal.querySelector('.ai-modal-body');
    body.innerHTML = `
      <!-- METRICS GRID -->
      <div class="ai-metrics-grid">
        <div class="ai-metric-card">
          <span class="ai-metric-label">Original Size</span>
          <span class="ai-metric-val">${compressedResult.originalTokens.toLocaleString()} <span style="font-size: 11px; font-weight: normal; color: #94a3b8;">tokens</span></span>
        </div>
        <div class="ai-metric-card">
          <span class="ai-metric-label">Compressed Size</span>
          <span class="ai-metric-val ai-savings-highlight">${compressedResult.compressedTokens.toLocaleString()} <span style="font-size: 11px; font-weight: normal; color: #4ade80;">(-${compressedResult.savingsPercent}%)</span></span>
        </div>
      </div>

      <!-- COMPRESSION CONTROLS -->
      <div class="ai-options-group">
        <div class="ai-options-title">Optimization Filters</div>
        <label class="ai-checkbox-label">
          <input type="checkbox" id="ai-opt-filler" ${compressionOptions.stripFiller ? 'checked' : ''} />
          <span>Strip conversational filler & pleasantries</span>
        </label>
        <label class="ai-checkbox-label">
          <input type="checkbox" id="ai-opt-thinking" ${compressionOptions.omitThinking ? 'checked' : ''} />
          <span>Omit scratchpad reasoning & thinking traces</span>
        </label>
        <label class="ai-checkbox-label">
          <input type="checkbox" id="ai-opt-whitespace" ${compressionOptions.compactWhitespace ? 'checked' : ''} />
          <span>Compact whitespace & structural delimiters</span>
        </label>
      </div>

      <!-- PRIMARY ACTION -->
      <button class="ai-btn-primary" id="ai-btn-copy-compressed">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Copy Compressed Context for Next AI</span>
      </button>

      <!-- SECONDARY ACTIONS -->
      <div class="ai-btn-grid">
        <button class="ai-btn-secondary" id="ai-btn-copy-raw">📋 Copy Raw</button>
        <button class="ai-btn-secondary" id="ai-btn-dl-md">💾 Save .md</button>
        <button class="ai-btn-secondary" id="ai-btn-dl-json">💾 Save .json</button>
        <button class="ai-btn-secondary" id="ai-btn-dl-html">📄 Print / HTML</button>
      </div>

      <!-- WHY COMPRESS EXPLAINER -->
      <details class="ai-explainer">
        <summary>🧠 Why Compress? (Benefits for AI Reasoning)</summary>
        <ul>
          <li><b>Avoids "Lost-in-the-Middle":</b> Research proves LLMs degrade when critical details are buried in long, noisy conversation middle contexts.</li>
          <li><b>Drastically Reduces Latency:</b> Smaller context yields substantially faster Time-to-First-Token (TTFT).</li>
          <li><b>Cuts Token Usage & Costs:</b> Saves 50%–80% of tokens on paid models (Claude Opus/Sonnet, GPT-4o, etc.).</li>
          <li><b>Prevents Hallucinations:</b> Pruning intermediate conversational noise keeps attention focused on the final requirements.</li>
        </ul>
      </details>
    `;

    // Bind checkbox changes
    modal.querySelector('#ai-opt-filler').onchange = (e) => {
      compressionOptions.stripFiller = e.target.checked;
      recalculateCompression(modal);
    };
    modal.querySelector('#ai-opt-thinking').onchange = (e) => {
      compressionOptions.omitThinking = e.target.checked;
      recalculateCompression(modal);
    };
    modal.querySelector('#ai-opt-whitespace').onchange = (e) => {
      compressionOptions.compactWhitespace = e.target.checked;
      recalculateCompression(modal);
    };

    // Bind Primary Copy
    modal.querySelector('#ai-btn-copy-compressed').onclick = () => {
      const text = compressedResult.toClipboardText();
      navigator.clipboard.writeText(text).then(() => {
        showToast(`✨ Copied ${compressedResult.compressedTokens.toLocaleString()} compressed tokens!`);
      });
    };

    // Bind Secondary Copy Raw
    modal.querySelector('#ai-btn-copy-raw').onclick = () => {
      const md = window.UniversalAIExporter.Exporters.toMarkdown(currentConversation).content;
      navigator.clipboard.writeText(md).then(() => {
        showToast('📋 Copied full raw markdown to clipboard!');
      });
    };

    // Bind File Downloads
    modal.querySelector('#ai-btn-dl-md').onclick = () => {
      window.UniversalAIExporter.exportCurrent('markdown');
      showToast('💾 Downloading Markdown file...');
    };
    modal.querySelector('#ai-btn-dl-json').onclick = () => {
      window.UniversalAIExporter.exportCurrent('json');
      showToast('💾 Downloading JSON file...');
    };
    modal.querySelector('#ai-btn-dl-html').onclick = () => {
      window.UniversalAIExporter.exportCurrent('html');
      showToast('📄 Downloading HTML file...');
    };
  }

  // Auto-mount trigger on page load
  window.addEventListener('DOMContentLoaded', createFloatingTrigger);
  setTimeout(createFloatingTrigger, 1200);

  // Monitor SPA route changes
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(createFloatingTrigger, 1000);
    }
  }, 1000);
})();
