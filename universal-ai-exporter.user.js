// ==UserScript==
// @name         Universal AI Chat Exporter & Prompt Compressor (v3.0)
// @namespace    https://github.com/universal-ai-exporter
// @version      3.0.0
// @description  Export and token-compress conversations from Claude, ChatGPT, Gemini, DeepSeek, and more. 1-Click Copy for Next AI Handover.
// @author       AI Exporter
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gemini.google.com/*
// @match        https://chat.deepseek.com/*
// @match        https://www.perplexity.ai/*
// @match        https://perplexity.ai/*
// @match        https://chat.mistral.ai/*
// @match        https://copilot.microsoft.com/*
// @match        https://poe.com/*
// @match        https://grok.com/*
// @match        https://x.com/i/grok*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // --- PASSIVE IN-MEMORY NETWORK INTERCEPTOR ---
  window.__UNIVERSAL_AI_CACHE__ = window.__UNIVERSAL_AI_CACHE__ || {
    claude: {}, chatgpt: {}, deepseek: {}, gemini: {}, perplexity: {}
  };

  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      try {
        const url = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';
        if (url.includes('/chat_conversations/') || url.includes('/backend-api/conversation/') || url.includes('/history_messages')) {
          response.clone().json().then(data => {
            if (url.includes('/chat_conversations/')) window.__UNIVERSAL_AI_CACHE__.claude.latest = data;
            if (url.includes('/backend-api/conversation/')) window.__UNIVERSAL_AI_CACHE__.chatgpt.latest = data;
            if (url.includes('/history_messages')) window.__UNIVERSAL_AI_CACHE__.deepseek.latest = data;
          }).catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  }

  // --- PROMPT COMPRESSION HELPERS ---
  const OPENING_FILLERS = [
    /^(sure|certainly|absolutely|of course|gladly|happy to help)[!.,]?\s*(i'd be happy to|i can help with that|here is|here's|below is|let's dive in|let's look at)[^.\n]*[.:]/i,
    /^(hello|hi|hey there)[!.,]?\s*(welcome|let's|i can|here is)?[^.\n]*[.:]/i,
    /^(great question|good catch|excellent point|that's a great observation)[!.,]?\s*/i,
    /^(as an ai language model|as an ai|as claude|as chatgpt)[,.]?\s*/i,
    /^(certainly|sure thing|no problem)[!.,]?\s*/i,
    /^(here is the updated (code|version|solution|implementation)|here's what you need)[!.,:]?\s*/i
  ];

  const CLOSING_FILLERS = [
    /(let me know if you (need|have) (any|more) (further )?(help|questions|adjustments|modifications|feedback)[!.]?)\s*$/i,
    /(hope this helps|i hope this helps|happy coding|feel free to ask)[!.]?\s*$/i,
    /(don't hesitate to reach out if you have any questions)[!.]?\s*$/i,
    /(if you have any (other )?questions, (just )?let me know)[!.]?\s*$/i
  ];

  function estimateTokens(text) {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.round((text.length / 3.8 + words * 1.25) / 2));
  }

  function stripFiller(text) {
    if (!text) return '';
    let c = text.trim();
    for (const p of OPENING_FILLERS) c = c.replace(p, '').trim();
    for (const p of CLOSING_FILLERS) c = c.replace(p, '').trim();
    return c;
  }

  function cleanText(t) {
    return t ? String(t).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() : '';
  }

  function sanitize(name, ext) {
    return (name || 'ai_chat').replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').slice(0, 80).trim() + '.' + ext;
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  // --- MULTI-PLATFORM EXTRACTION ---
  async function extractChat() {
    const host = location.hostname;

    // 1. CLAUDE
    if (host.includes('claude.ai')) {
      const uuid = location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
      let data = window.__UNIVERSAL_AI_CACHE__.claude.latest;
      if (!data && typeof performance !== 'undefined' && uuid) {
        const match = performance.getEntriesByType('resource').map(e => e.name).reverse().find(u => u.includes(uuid) && u.includes('/chat_conversations/'));
        if (match) {
          try { const r = await fetch(match, { credentials: 'include' }); if (r.ok) data = await r.json(); } catch (_) {}
        }
      }
      if (!data && uuid) {
        let org = document.cookie.match(/lastActiveOrg=([0-9a-f-]+)/i)?.[1];
        if (org) {
          try {
            const r = await fetch(`https://claude.ai/api/organizations/${org}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong`, { credentials: 'include' });
            if (r.ok) data = await r.json();
          } catch (_) {}
        }
      }
      if (data && (data.chat_messages || data.messages)) {
        const msgs = (data.chat_messages || data.messages).map(m => {
          let text = m.text || '';
          let thoughts = '';
          if (Array.isArray(m.content)) {
            text = m.content.map(b => {
              if (typeof b === 'string') return b;
              if (b.type === 'thinking') { thoughts += (b.thinking || '') + '\n'; return ''; }
              if (b.type === 'text') return b.text || '';
              if (b.type === 'tool_use') return `> 🛠 **Tool (${b.name}):** \`${JSON.stringify(b.input)}\``;
              return '';
            }).filter(Boolean).join('\n\n');
          }
          return {
            role: (m.sender === 'human' || m.sender === 'user') ? 'user' : 'assistant',
            sender: (m.sender === 'human' || m.sender === 'user') ? 'User' : 'Claude',
            text: cleanText(text),
            thoughts: cleanText(thoughts)
          };
        }).filter(m => m.text || m.thoughts);

        return { platform: 'Claude', title: data.name || cleanText(document.title.replace(' - Claude', '')) || 'Claude Chat', messages: msgs };
      }
    }

    // 2. CHATGPT
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
      let data = window.__UNIVERSAL_AI_CACHE__.chatgpt.latest;
      if (!data && typeof performance !== 'undefined') {
        const match = performance.getEntriesByType('resource').map(e => e.name).reverse().find(u => u.includes('/backend-api/conversation/'));
        if (match) {
          try { const r = await fetch(match, { credentials: 'include' }); if (r.ok) data = await r.json(); } catch (_) {}
        }
      }
      if (data && data.mapping) {
        let curr = data.current_node;
        const nodes = [];
        while (curr && data.mapping[curr]) {
          nodes.unshift(data.mapping[curr]);
          curr = data.mapping[curr].parent;
        }
        const msgs = nodes.map(n => {
          const m = n.message;
          if (!m || !m.author || m.author.role === 'system') return null;
          const text = m.content?.parts ? m.content.parts.filter(p => typeof p === 'string').join('\n\n') : (m.content?.text || '');
          return {
            role: m.author.role === 'user' ? 'user' : 'assistant',
            sender: m.author.role === 'user' ? 'User' : 'ChatGPT',
            text: cleanText(text),
            thoughts: cleanText(m.metadata?.thought || '')
          };
        }).filter(Boolean).filter(m => m.text || m.thoughts);

        return { platform: 'ChatGPT', title: data.title || cleanText(document.title.replace(' - ChatGPT', '')) || 'ChatGPT Chat', messages: msgs };
      }
    }

    // 3. DEEPSEEK
    if (host.includes('deepseek.com')) {
      let data = window.__UNIVERSAL_AI_CACHE__.deepseek.latest;
      if (data && data.data && Array.isArray(data.data.chat_messages)) {
        const msgs = data.data.chat_messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          sender: m.role === 'user' ? 'User' : 'DeepSeek',
          text: cleanText(m.content),
          thoughts: cleanText(m.thinking_content || '')
        })).filter(m => m.text || m.thoughts);
        return { platform: 'DeepSeek', title: cleanText(document.title.replace(' - DeepSeek', '')) || 'DeepSeek Chat', messages: msgs };
      }
    }

    // 4. DOM FALLBACK (Gemini, Perplexity, Copilot, Generic)
    const turns = Array.from(document.querySelectorAll('conversation-turn, article, .chat-message, [data-role], [data-message-author-role], [class*="message-row"]'));
    const messages = [];
    if (turns.length > 0) {
      turns.forEach(turn => {
        const role = (turn.getAttribute('data-role') || turn.getAttribute('data-message-author-role') || '').toLowerCase();
        const isUser = role.includes('user') || role.includes('human') || turn.className.toLowerCase().includes('user') || !!turn.querySelector('[class*="user"]');
        const text = cleanText(turn.innerText);
        if (text) {
          messages.push({
            role: isUser ? 'user' : 'assistant',
            sender: isUser ? 'User' : 'Assistant',
            text
          });
        }
      });
    }

    return {
      platform: 'AI Chat',
      title: cleanText(document.title) || 'AI Conversation',
      messages
    };
  }

  // --- FLOATING UI INJECTION ---
  function injectWidget() {
    if (document.getElementById('ai-userscript-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'ai-userscript-widget';
    widget.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
      background: #0f172a; color: #f8fafc; border: 1px solid #334155;
      border-radius: 12px; padding: 8px 12px; display: flex; align-items: center;
      gap: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px;
    `;

    widget.innerHTML = `
      <span style="font-weight: 700; color: #38bdf8;">⚡ AI Context Hub:</span>
      <button id="ai-btn-copy-comp" style="background: #6366f1; color: #fff; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">📋 Copy Compressed</button>
      <button id="ai-btn-dl-md" style="background: #1e293b; color: #cbd5e1; border: 1px solid #475569; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">💾 Save .md</button>
      <span id="ai-status-txt" style="font-size: 12px; margin-left: 4px;"></span>
    `;

    document.body.appendChild(widget);

    const status = document.getElementById('ai-status-txt');

    document.getElementById('ai-btn-copy-comp').onclick = async () => {
      status.innerText = 'Compressing...';
      status.style.color = '#facc15';
      try {
        const chat = await extractChat();
        if (!chat.messages || chat.messages.length === 0) throw new Error('No messages detected');

        let origText = '';
        let compText = '';

        let md = `> **[Prior Context: ${chat.title}]**\n> _Cleaned & Token-Compressed for AI Handover_\n\n`;

        for (const m of chat.messages) {
          origText += (m.thoughts || '') + '\n' + (m.text || '') + '\n';
          let cleaned = m.role === 'assistant' ? stripFiller(m.text) : m.text;
          compText += cleaned + '\n';
          md += `### ${m.role === 'user' ? '👤 User' : '🤖 ' + m.sender}\n\n${cleaned}\n\n---\n\n`;
        }

        md += `**[Task Continuation Prompt]**: Please review the above conversation history and continue assisting based on the technical decisions established above.`;

        const origTokens = estimateTokens(origText);
        const compTokens = estimateTokens(compText);
        const savedPercent = origTokens > 0 ? Math.round(((origTokens - compTokens) / origTokens) * 100) : 0;

        await navigator.clipboard.writeText(md);
        status.innerText = `Copied! -${savedPercent}% tokens`;
        status.style.color = '#4ade80';
        setTimeout(() => { status.innerText = ''; }, 4000);
      } catch (e) {
        status.innerText = 'Failed';
        status.style.color = '#f87171';
        setTimeout(() => { status.innerText = ''; }, 3000);
      }
    };

    document.getElementById('ai-btn-dl-md').onclick = async () => {
      status.innerText = 'Saving...';
      try {
        const chat = await extractChat();
        let md = `# ${chat.title}\n\n**Platform:** ${chat.platform}  \n**Messages:** ${chat.messages.length}\n\n---\n\n`;
        for (const m of chat.messages) {
          md += `## ${m.sender}\n\n`;
          if (m.thoughts) md += `<details>\n<summary>💭 <i>Thinking Process</i></summary>\n\n> ${m.thoughts.replace(/\n/g, '\n> ')}\n\n</details>\n\n`;
          if (m.text) md += `${m.text}\n\n`;
          md += `---\n\n`;
        }
        download(md, sanitize(chat.title, 'md'), 'text/markdown');
        status.innerText = 'Downloaded!';
        status.style.color = '#4ade80';
        setTimeout(() => { status.innerText = ''; }, 3000);
      } catch (e) {
        status.innerText = 'Failed';
        status.style.color = '#f87171';
      }
    };
  }

  window.addEventListener('DOMContentLoaded', injectWidget);
  setTimeout(injectWidget, 1500);
})();
