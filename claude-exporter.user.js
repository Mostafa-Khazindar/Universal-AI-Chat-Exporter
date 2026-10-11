// ==UserScript==
// @name         Claude Chat Exporter
// @namespace    https://claude.ai/
// @version      1.0.0
// @description  Export complete Claude conversations directly to Markdown, JSON, or HTML without virtualization limits.
// @author       AI Exporter
// @match        https://claude.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function extractConversationUuid(urlOrText) {
    const target = urlOrText || window.location.href;
    const match = target.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0] : null;
  }

  function findOrganizationId() {
    if (typeof performance !== 'undefined') {
      const entries = performance.getEntriesByType('resource');
      for (let i = entries.length - 1; i >= 0; i--) {
        const match = entries[i].name.match(/\/api\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (match) return match[1];
      }
    }
    const cookieMatch = document.cookie.match(/lastActiveOrg=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (cookieMatch) return cookieMatch[1];
    return null;
  }

  function resolveConversationApiUrl(uuid) {
    const targetUuid = uuid || extractConversationUuid();
    if (typeof performance !== 'undefined') {
      const entries = performance.getEntriesByType('resource').map(e => e.name);
      if (targetUuid) {
        const matching = entries.filter(u => u.includes(targetUuid) && u.includes('/chat_conversations/'));
        if (matching.length > 0) {
          const treeMatch = matching.reverse().find(u => u.toLowerCase().includes('tree=true'));
          if (treeMatch) return treeMatch;
          return matching[0];
        }
      }
    }

    const orgId = findOrganizationId();
    if (orgId && targetUuid) {
      return `https://claude.ai/api/organizations/${orgId}/chat_conversations/${targetUuid}?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong`;
    }
    return null;
  }

  async function fetchConversationData() {
    const uuid = extractConversationUuid();
    if (!uuid) {
      throw new Error('Not currently inside a Claude conversation (no conversation ID found in URL).');
    }

    const apiUrl = resolveConversationApiUrl(uuid);
    if (!apiUrl) {
      throw new Error('Could not find conversation API URL. Try refreshing the page once or sending a message.');
    }

    const res = await fetch(apiUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    return await res.json();
  }

  function extractMessages(data) {
    if (!data) return [];
    if (Array.isArray(data.chat_messages)) return data.chat_messages;
    const candidates = ['messages', 'chatMessages', 'items'];
    for (const c of candidates) {
      if (Array.isArray(data[c])) return data[c];
    }
    return [];
  }

  function extractMessageText(message) {
    if (!message) return '';
    if (typeof message.text === 'string' && message.text.trim()) return message.text;
    if (typeof message.content === 'string' && message.content.trim()) return message.content;
    if (Array.isArray(message.content)) {
      return message.content.map(block => {
        if (!block) return '';
        if (typeof block === 'string') return block;
        if (typeof block.text === 'string') return block.text;
        if (typeof block.content === 'string') return block.content;
        if (block.type === 'tool_use' || block.name) {
          return `> 🛠 **Tool Use: ${block.name || 'unnamed'}**\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``;
        }
        if (block.type === 'tool_result') {
          const val = typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2);
          return `> 📋 **Tool Result:**\n\`\`\`\n${val}\n\`\`\``;
        }
        return '';
      }).filter(Boolean).join('\n\n');
    }
    return '';
  }

  function getSender(msg) {
    const s = String(msg.sender || msg.role || '').toLowerCase();
    if (s === 'human' || s === 'user') return 'User';
    if (s === 'assistant' || s === 'claude') return 'Claude';
    return msg.sender || 'Unknown';
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportAsMarkdown(data) {
    const msgs = extractMessages(data);
    const title = (data.name || 'claude-conversation').trim();
    let md = `# ${title}\n\n`;
    md += `**Conversation ID:** ${data.uuid || 'N/A'}\n\n`;
    if (data.model) md += `**Model:** ${data.model}\n\n`;
    md += `**Total Messages:** ${msgs.length}\n\n---\n\n`;

    let count = 0;
    for (const m of msgs) {
      const text = extractMessageText(m).trim();
      if (!text) continue;
      const sender = getSender(m);
      const time = m.created_at ? ` _(${new Date(m.created_at).toLocaleString()})_` : '';
      md += `## ${sender}${time}\n\n${text}\n\n---\n\n`;
      count++;
    }

    const safeName = title.replace(/[<>:"/\\|?*]+/g, '_') + '.md';
    downloadFile(md, safeName, 'text/markdown');
    return { count, total: msgs.length };
  }

  function exportAsJSON(data) {
    const msgs = extractMessages(data);
    const title = (data.name || 'claude-conversation').trim();
    const cleanData = {
      id: data.uuid,
      title: title,
      model: data.model,
      created_at: data.created_at,
      total_messages: msgs.length,
      messages: msgs.map((m, idx) => ({
        index: m.index !== undefined ? m.index : idx,
        sender: getSender(m),
        created_at: m.created_at,
        text: extractMessageText(m)
      }))
    };
    const safeName = title.replace(/[<>:"/\\|?*]+/g, '_') + '.json';
    downloadFile(JSON.stringify(cleanData, null, 2), safeName, 'application/json');
    return { count: cleanData.messages.length, total: msgs.length };
  }

  // --- FLOATING UI INJECTION ---
  function injectExporterUI() {
    if (document.getElementById('claude-exporter-widget')) return;

    const container = document.createElement('div');
    container.id = 'claude-exporter-widget';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      background: #18181b;
      color: #f4f4f5;
      border: 1px solid #3f3f46;
      border-radius: 12px;
      padding: 10px 14px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s ease;
    `;

    const label = document.createElement('span');
    label.innerText = '⚡ Claude Exporter:';
    label.style.fontWeight = '600';
    label.style.color = '#a1a1aa';

    const btnMd = document.createElement('button');
    btnMd.innerText = 'Markdown (.md)';
    btnMd.style.cssText = `
      background: #7c3aed;
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: opacity 0.15s;
    `;
    btnMd.onmouseover = () => btnMd.style.opacity = '0.85';
    btnMd.onmouseout = () => btnMd.style.opacity = '1';

    const btnJson = document.createElement('button');
    btnJson.innerText = 'JSON';
    btnJson.style.cssText = `
      background: #27272a;
      color: #e4e4e7;
      border: 1px solid #3f3f46;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.15s;
    `;
    btnJson.onmouseover = () => btnJson.style.background = '#3f3f46';
    btnJson.onmouseout = () => btnJson.style.background = '#27272a';

    const status = document.createElement('span');
    status.style.fontSize = '12px';
    status.style.marginLeft = '4px';

    async function handleExport(format) {
      status.innerText = 'Fetching...';
      status.style.color = '#fbbf24';
      try {
        const data = await fetchConversationData();
        const res = format === 'md' ? exportAsMarkdown(data) : exportAsJSON(data);
        status.innerText = `Exported ${res.count} msgs!`;
        status.style.color = '#4ade80';
        setTimeout(() => { status.innerText = ''; }, 4000);
      } catch (err) {
        console.error('Claude Export failed:', err);
        status.innerText = 'Error! Check Console';
        status.style.color = '#f87171';
        setTimeout(() => { status.innerText = ''; }, 5000);
      }
    }

    btnMd.onclick = () => handleExport('md');
    btnJson.onclick = () => handleExport('json');

    container.appendChild(label);
    container.appendChild(btnMd);
    container.appendChild(btnJson);
    container.appendChild(status);

    document.body.appendChild(container);
  }

  // Observe URL changes (Claude is an SPA)
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.pathname.includes('/chat/')) {
        setTimeout(injectExporterUI, 1000);
      }
    }
  }, 1000);

  if (location.pathname.includes('/chat/')) {
    setTimeout(injectExporterUI, 1000);
  }
})();
