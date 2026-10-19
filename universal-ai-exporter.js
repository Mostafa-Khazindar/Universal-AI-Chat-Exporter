/**
 * Universal AI Chat Exporter Engine (v2.5)
 * 100% Client-Side, Zero-Telemetry, Privacy-First Conversation Exporter
 *
 * Implements the 4-Tier Network & State Architecture:
 * - Tier 1: Real-Time In-Memory Network Interceptor Cache (hooked fetch/XHR)
 * - Tier 2: Performance Resource Entry Sniffer + Authenticated Session Fetch
 * - Tier 3: Synthetic Platform Endpoint Construction (using session tokens/cookies)
 * - Tier 4: High-Fidelity DOM & Custom Component Walker (DOM fallback)
 *
 * Supported Platforms:
 * - Claude (claude.ai)
 * - ChatGPT (chatgpt.com / chat.openai.com)
 * - DeepSeek (chat.deepseek.com)
 * - Google Gemini (gemini.google.com)
 * - Perplexity (perplexity.ai)
 * - Mistral Le Chat (chat.mistral.ai)
 * - Microsoft Copilot (copilot.microsoft.com)
 * - Poe (poe.com)
 * - Grok (grok.com / x.com/i/grok)
 * - Generic Local WebUIs (Open WebUI, Ollama, LM Studio, etc.)
 */

(function (global) {
  'use strict';

  // Global In-Memory Conversation Cache
  if (!global.__UNIVERSAL_AI_CACHE__) {
    global.__UNIVERSAL_AI_CACHE__ = {
      claude: {},
      chatgpt: {},
      deepseek: {},
      gemini: {},
      perplexity: {},
      generic: {}
    };
  }

  // ==========================================
  // TIER 1: PASSIVE NETWORK INTERCEPTOR (HOOK)
  // Transparent, non-destructive sniffing of chat responses
  // ==========================================
  function initNetworkInterceptor() {
    if (global.__UNIVERSAL_AI_HOOK_INSTALLED__) return;
    global.__UNIVERSAL_AI_HOOK_INSTALLED__ = true;

    // 1. Hook fetch
    if (typeof global.fetch === 'function') {
      const originalFetch = global.fetch;
      global.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
          if (isChatEndpoint(url)) {
            const clone = response.clone();
            clone.json().then(data => {
              storeInterceptedData(url, data);
            }).catch(() => {});
          }
        } catch (_) {}
        return response;
      };
    }

    // 2. Hook XMLHttpRequest
    if (typeof global.XMLHttpRequest === 'function') {
      const originalOpen = global.XMLHttpRequest.prototype.open;
      const originalSend = global.XMLHttpRequest.prototype.send;

      global.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__interceptUrl = url;
        return originalOpen.apply(this, [method, url, ...rest]);
      };

      global.XMLHttpRequest.prototype.send = function (...rest) {
        this.addEventListener('load', function () {
          try {
            const url = this.__interceptUrl || '';
            if (isChatEndpoint(url)) {
              const data = JSON.parse(this.responseText);
              storeInterceptedData(url, data);
            }
          } catch (_) {}
        });
        return originalSend.apply(this, rest);
      };
    }
  }

  function isChatEndpoint(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    return u.includes('/chat_conversations/') ||
           u.includes('/backend-api/conversation/') ||
           u.includes('/history_messages') ||
           u.includes('/rest/thread/') ||
           u.includes('/streamgenerate') ||
           u.includes('/api/chat/conversations');
  }

  function storeInterceptedData(url, data) {
    if (!data) return;
    const cache = global.__UNIVERSAL_AI_CACHE__;
    if (url.includes('/chat_conversations/')) {
      const idMatch = url.match(/chat_conversations\/([0-9a-f-]+)/i);
      const id = idMatch ? idMatch[1] : 'latest';
      cache.claude[id] = data;
      cache.claude.latest = data;
    } else if (url.includes('/backend-api/conversation/')) {
      const idMatch = url.match(/conversation\/([0-9a-f-]+)/i);
      const id = idMatch ? idMatch[1] : 'latest';
      cache.chatgpt[id] = data;
      cache.chatgpt.latest = data;
    } else if (url.includes('/history_messages')) {
      cache.deepseek.latest = data;
    } else if (url.includes('/rest/thread/')) {
      cache.perplexity.latest = data;
    }
  }

  // Initialize hook
  initNetworkInterceptor();

  // ==========================================
  // UTILITIES & NORMALIZERS
  // ==========================================
  function cleanText(text) {
    if (!text) return '';
    return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    try {
      const d = typeof ts === 'number' && ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
      return isNaN(d.getTime()) ? '' : d.toLocaleString();
    } catch { return ''; }
  }

  function sanitizeFilename(name, ext) {
    const clean = (name || 'ai_chat')
      .replace(/[<>:"/\\|?*]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80)
      .trim();
    return `${clean}.${ext}`;
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ==========================================
  // PLATFORM ADAPTERS (4-TIER RESOLVER)
  // ==========================================
  const Adapters = {
    // ------------------------------------------
    // CLAUDE (claude.ai)
    // ------------------------------------------
    claude: {
      name: 'Claude',
      matches: () => location.hostname.includes('claude.ai'),
      async extract() {
        const uuidMatch = location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const uuid = uuidMatch ? uuidMatch[0] : null;

        // Tier 1: Check In-Memory Cache
        let data = (uuid && global.__UNIVERSAL_AI_CACHE__.claude[uuid]) || global.__UNIVERSAL_AI_CACHE__.claude.latest;

        // Tier 2: Check Performance Resource Sniffer
        if (!data && typeof performance !== 'undefined') {
          const entries = performance.getEntriesByType('resource').map(e => e.name);
          const matchUrl = entries.reverse().find(u => u.includes('/chat_conversations/') && (uuid ? u.includes(uuid) : true));
          if (matchUrl) {
            try {
              const res = await fetch(matchUrl, { credentials: 'include' });
              if (res.ok) data = await res.json();
            } catch (_) {}
          }
        }

        // Tier 3: Synthetic Endpoint
        if (!data && uuid) {
          let orgId = null;
          const cookieMatch = document.cookie.match(/lastActiveOrg=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (cookieMatch) orgId = cookieMatch[1];
          if (!orgId && typeof performance !== 'undefined') {
            for (const entry of performance.getEntriesByType('resource')) {
              const m = entry.name.match(/\/api\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
              if (m) { orgId = m[1]; break; }
            }
          }
          if (orgId) {
            const synthUrl = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong`;
            try {
              const res = await fetch(synthUrl, { credentials: 'include' });
              if (res.ok) data = await res.json();
            } catch (_) {}
          }
        }

        // Normalize Claude JSON
        if (data && (data.chat_messages || data.messages)) {
          const rawMsgs = data.chat_messages || data.messages;
          const messages = rawMsgs.map((m, idx) => {
            const isUser = m.sender === 'human' || m.sender === 'user';
            let text = '';
            let thoughts = '';

            if (typeof m.text === 'string' && m.text.trim()) text = m.text;
            else if (typeof m.content === 'string') text = m.content;
            else if (Array.isArray(m.content)) {
              const parts = [];
              for (const b of m.content) {
                if (typeof b === 'string') parts.push(b);
                else if (b.type === 'thinking') thoughts += (b.thinking || '') + '\n';
                else if (b.type === 'text') parts.push(b.text || '');
                else if (b.type === 'tool_use' || b.name) parts.push(`> 🛠 **Tool Call (${b.name}):**\n\`\`\`json\n${JSON.stringify(b.input, null, 2)}\n\`\`\``);
                else if (b.type === 'tool_result') parts.push(`> 📋 **Tool Result:**\n\`\`\`\n${typeof b.content === 'string' ? b.content : JSON.stringify(b.content, null, 2)}\n\`\`\``);
              }
              text = parts.join('\n\n');
            }

            return {
              index: idx,
              role: isUser ? 'user' : 'assistant',
              sender: isUser ? 'User' : 'Claude',
              text: cleanText(text),
              thoughts: cleanText(thoughts),
              timestamp: m.created_at || null
            };
          }).filter(m => m.text || m.thoughts);

          return {
            platform: 'Claude',
            title: data.name || cleanText(document.title.replace(' - Claude', '')) || 'Claude Conversation',
            id: data.uuid || uuid,
            model: data.model || 'Claude',
            created_at: data.created_at || null,
            messages
          };
        }

        // Tier 4: DOM Fallback
        return Adapters.generic.extractFromDOM({
          platform: 'Claude',
          userSelector: '[data-testid="user-message"], div.font-user-message',
          assistantSelector: '[data-testid="assistant-message"], div.font-claude-message'
        });
      }
    },

    // ------------------------------------------
    // CHATGPT (chatgpt.com / chat.openai.com)
    // ------------------------------------------
    chatgpt: {
      name: 'ChatGPT',
      matches: () => location.hostname.includes('chatgpt.com') || location.hostname.includes('chat.openai.com'),
      async extract() {
        const convMatch = location.href.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        const convId = convMatch ? convMatch[1] : null;

        // Tier 1: Check In-Memory Cache
        let data = (convId && global.__UNIVERSAL_AI_CACHE__.chatgpt[convId]) || global.__UNIVERSAL_AI_CACHE__.chatgpt.latest;

        // Tier 2: Check Performance Resource Sniffer
        if (!data && typeof performance !== 'undefined') {
          const entries = performance.getEntriesByType('resource').map(e => e.name);
          const matchUrl = entries.reverse().find(u => u.includes('/backend-api/conversation/') && (convId ? u.includes(convId) : true));
          if (matchUrl) {
            try {
              const res = await fetch(matchUrl, { credentials: 'include' });
              if (res.ok) data = await res.json();
            } catch (_) {}
          }
        }

        // Tier 3: Synthetic Endpoint
        if (!data && convId) {
          try {
            const res = await fetch(`${location.origin}/backend-api/conversation/${convId}`, { credentials: 'include' });
            if (res.ok) data = await res.json();
          } catch (_) {}
        }

        // Normalize ChatGPT mapping tree
        if (data && data.mapping) {
          const mapping = data.mapping;
          let curr = data.current_node;
          const linearNodes = [];
          while (curr && mapping[curr]) {
            linearNodes.unshift(mapping[curr]);
            curr = mapping[curr].parent;
          }

          const messages = [];
          for (const node of linearNodes) {
            const msg = node.message;
            if (!msg || !msg.author || msg.author.role === 'system') continue;
            const isUser = msg.author.role === 'user';
            let text = '';
            if (msg.content && Array.isArray(msg.content.parts)) {
              text = msg.content.parts.filter(p => typeof p === 'string').join('\n\n');
            } else if (msg.content && typeof msg.content.text === 'string') {
              text = msg.content.text;
            }

            const thoughts = msg.metadata?.thought || '';
            if (text || thoughts) {
              messages.push({
                index: messages.length,
                role: isUser ? 'user' : 'assistant',
                sender: isUser ? 'User' : 'ChatGPT',
                text: cleanText(text),
                thoughts: cleanText(thoughts),
                timestamp: msg.create_time ? msg.create_time * 1000 : null
              });
            }
          }

          return {
            platform: 'ChatGPT',
            title: data.title || cleanText(document.title.replace(' - ChatGPT', '')) || 'ChatGPT Conversation',
            id: data.conversation_id || convId,
            model: data.model_slug || 'GPT',
            created_at: data.create_time ? new Date(data.create_time * 1000).toISOString() : null,
            messages
          };
        }

        // Tier 4: DOM Fallback
        return Adapters.generic.extractFromDOM({
          platform: 'ChatGPT',
          userSelector: '[data-message-author-role="user"]',
          assistantSelector: '[data-message-author-role="assistant"]'
        });
      }
    },

    // ------------------------------------------
    // DEEPSEEK (chat.deepseek.com)
    // ------------------------------------------
    deepseek: {
      name: 'DeepSeek',
      matches: () => location.hostname.includes('deepseek.com'),
      async extract() {
        // Tier 1: Check In-Memory Cache
        let data = global.__UNIVERSAL_AI_CACHE__.deepseek.latest;

        // Tier 2: Check Performance Sniffer
        if (!data && typeof performance !== 'undefined') {
          const matchUrl = performance.getEntriesByType('resource').map(e => e.name).reverse().find(u => u.includes('/history_messages'));
          if (matchUrl) {
            try {
              const res = await fetch(matchUrl, { credentials: 'include' });
              if (res.ok) data = await res.json();
            } catch (_) {}
          }
        }

        // Parse DeepSeek API if available
        if (data && data.data && Array.isArray(data.data.chat_messages)) {
          const messages = data.data.chat_messages.map((m, idx) => ({
            index: idx,
            role: m.role === 'user' ? 'user' : 'assistant',
            sender: m.role === 'user' ? 'User' : 'DeepSeek',
            text: cleanText(m.content),
            thoughts: cleanText(m.thinking_content || ''),
            timestamp: m.inserted_at ? m.inserted_at * 1000 : null
          })).filter(m => m.text || m.thoughts);

          return {
            platform: 'DeepSeek',
            title: cleanText(document.title.replace(' - DeepSeek', '')) || 'DeepSeek Conversation',
            id: location.pathname.split('/').pop(),
            messages
          };
        }

        // Tier 4: DOM DeepSeek R1 Walk
        const messageEls = Array.from(document.querySelectorAll('.chat-message, [class*="chat-message"]'));
        const messages = [];
        if (messageEls.length > 0) {
          messageEls.forEach((el, idx) => {
            const isUser = el.className.includes('user') || el.getAttribute('data-role') === 'user' || !!el.querySelector('[class*="user-avatar"]');
            const thinkEl = el.querySelector('.ds-think, [class*="think"]');
            const thoughts = thinkEl ? cleanText(thinkEl.innerText) : '';

            const clone = el.cloneNode(true);
            const cloneThink = clone.querySelector('.ds-think, [class*="think"]');
            if (cloneThink) cloneThink.remove();

            const textEl = clone.querySelector('.ds-markdown, [class*="markdown"]') || clone;
            const text = cleanText(textEl.innerText);

            if (text || thoughts) {
              messages.push({
                index: idx,
                role: isUser ? 'user' : 'assistant',
                sender: isUser ? 'User' : 'DeepSeek',
                text,
                thoughts,
                timestamp: null
              });
            }
          });
        }

        return {
          platform: 'DeepSeek',
          title: cleanText(document.title.replace(' - DeepSeek', '')) || 'DeepSeek Conversation',
          id: location.pathname.split('/').pop(),
          messages: messages.length ? messages : (await Adapters.generic.extractFromDOM({ platform: 'DeepSeek' })).messages
        };
      }
    },

    // ------------------------------------------
    // GOOGLE GEMINI (gemini.google.com)
    // ------------------------------------------
    gemini: {
      name: 'Google Gemini',
      matches: () => location.hostname.includes('gemini.google.com'),
      async extract() {
        const turns = Array.from(document.querySelectorAll('conversation-turn, .conversation-container > *, .chat-history > *'));
        const messages = [];
        if (turns.length > 0) {
          turns.forEach((turn, idx) => {
            const isUser = !!turn.querySelector('user-query, .query-text, [class*="user"]');
            const textEl = turn.querySelector('.query-content, .markdown, message-content, [class*="text-content"]') || turn;
            const text = cleanText(textEl.innerText);
            if (text) {
              messages.push({
                index: idx,
                role: isUser ? 'user' : 'assistant',
                sender: isUser ? 'User' : 'Gemini',
                text,
                timestamp: null
              });
            }
          });
        }

        return {
          platform: 'Google Gemini',
          title: cleanText(document.title.replace(' - Gemini', '')) || 'Gemini Conversation',
          id: location.pathname.split('/').pop(),
          messages: messages.length ? messages : (await Adapters.generic.extractFromDOM({ platform: 'Google Gemini' })).messages
        };
      }
    },

    // ------------------------------------------
    // PERPLEXITY (perplexity.ai)
    // ------------------------------------------
    perplexity: {
      name: 'Perplexity AI',
      matches: () => location.hostname.includes('perplexity.ai'),
      async extract() {
        const queryBlocks = Array.from(document.querySelectorAll('h1, [class*="font-display"], .query-text'));
        const answerBlocks = Array.from(document.querySelectorAll('.prose, [class*="prose"]'));
        const messages = [];
        const maxLen = Math.max(queryBlocks.length, answerBlocks.length);

        for (let i = 0; i < maxLen; i++) {
          if (queryBlocks[i]) {
            const q = cleanText(queryBlocks[i].innerText);
            if (q) messages.push({ index: messages.length, role: 'user', sender: 'User', text: q, timestamp: null });
          }
          if (answerBlocks[i]) {
            const ans = cleanText(answerBlocks[i].innerText);
            if (ans) messages.push({ index: messages.length, role: 'assistant', sender: 'Perplexity', text: ans, timestamp: null });
          }
        }

        return {
          platform: 'Perplexity',
          title: cleanText(queryBlocks[0]?.innerText || document.title.replace(' - Perplexity', '')) || 'Perplexity Search',
          id: location.pathname.split('/').pop(),
          messages: messages.length ? messages : (await Adapters.generic.extractFromDOM({ platform: 'Perplexity' })).messages
        };
      }
    },

    // ------------------------------------------
    // GLM / CHATGLM / Z.AI (chatglm.cn, z.ai, bigmodel.cn, glm.ai)
    // ------------------------------------------
    glm: {
      name: 'GLM / ChatGLM',
      matches: (h) => {
        const host = h || (typeof location !== 'undefined' ? location.hostname : '');
        return host.includes('chatglm.cn') || host.includes('z.ai') || host.includes('bigmodel.cn') || host.includes('glm.ai') || host.includes('zhipu');
      },
      async extract() {
        const qSel = ".question-content-wrap, [class*='question-content'], [class*='question-wrap'], [class*='user-content'], [class*='user-msg'], [class*='my-message']";
        const aSel = ".answer-content-wrap, [class*='answer-content'], [class*='answer-wrap'], [class*='bot-content'], [class*='assistant-content'], [class*='bot-message']";

        const nodes = Array.from(document.querySelectorAll(`${qSel}, ${aSel}`));
        if (nodes.length > 0) {
          const messages = nodes.map(el => {
            const isUser = el.matches(qSel) || el.className.toLowerCase().includes("question") || el.className.toLowerCase().includes("user");
            const thinkEl = el.querySelector("[class*='think'], [class*='reason']");
            const thoughts = thinkEl ? cleanText(thinkEl.innerText) : "";
            const clone = el.cloneNode(true);
            const cThink = clone.querySelector("[class*='think'], [class*='reason']");
            if (cThink) cThink.remove();
            const text = cleanText(clone.innerText);
            return (text || thoughts) ? {
              role: isUser ? 'user' : 'assistant',
              sender: isUser ? 'User' : 'GLM',
              text: text,
              thoughts: thoughts,
              timestamp: null
            } : null;
          }).filter(Boolean);

          if (messages.length > 0) {
            return {
              platform: 'GLM',
              title: cleanText(document.title.replace(' - 智谱清言', '').replace(' - ChatGLM', '')) || 'GLM Conversation',
              id: location.pathname.split('/').pop() || 'unknown',
              messages
            };
          }
        }
        return Adapters.generic.extractFromDOM({ platform: 'GLM' });
      }
    },

    // ------------------------------------------
    // GENERIC FALLBACK
    // ------------------------------------------
    generic: {
      name: 'Generic AI WebUI',
      matches: () => true,
      async extractFromDOM(options = {}) {
        const platformName = options.platform || 'AI Chat';
        let messages = [];

        // Stage A: High-confidence conversational turn containers
        const turnSelectors = [
          "conversation-turn",
          "article",
          "[data-role]",
          "[data-message-author-role]",
          "[data-testid*='message']",
          "[data-testid*='chat']",
          "[class*='message-row']",
          "[class*='chat-item']",
          "[class*='message-item']",
          "[class*='chat-message']",
          "[class*='message-bubble']",
          "[class*='question-content']",
          "[class*='answer-content']",
          "[class*='dialogue']",
          "[class*='chat-content']",
          "[class*='talk-bubble']",
          ".chat-item",
          ".message-item",
          ".question-content-wrap",
          ".answer-content-wrap"
        ].join(", ");

        let turns = Array.from(document.querySelectorAll(turnSelectors));
        turns = turns.filter(el => !turns.some(other => other !== el && el.contains(other)));

        if (turns.length > 0) {
          messages = turns.map(turn => {
            const roleAttr = (turn.getAttribute("data-role") || turn.getAttribute("data-message-author-role") || turn.getAttribute("data-author") || "").toLowerCase();
            const classStr = turn.className.toLowerCase();
            const isUser = roleAttr.includes("user") || roleAttr.includes("human") ||
                           classStr.includes("user") || classStr.includes("human") || classStr.includes("question") || classStr.includes("prompt") ||
                           !!turn.querySelector("[class*='user'], [class*='human'], [class*='question']");

            const thinkEl = turn.querySelector(".ds-think, [class*='think'], [class*='reason']");
            const thoughts = thinkEl ? cleanText(thinkEl.innerText) : "";

            const clone = turn.cloneNode(true);
            const cThink = clone.querySelector(".ds-think, [class*='think'], [class*='reason']");
            if (cThink) cThink.remove();

            const text = cleanText(clone.innerText);
            return (text || thoughts) ? {
              role: isUser ? 'user' : 'assistant',
              sender: isUser ? 'User' : platformName,
              text: text,
              thoughts: thoughts,
              timestamp: null
            } : null;
          }).filter(Boolean);
        }

        // Stage B: Markdown & Prose Block Harvesting
        if (messages.length === 0) {
          const markdownBlocks = Array.from(document.querySelectorAll(".markdown-body, .prose, [class*='markdown'], [class*='answer'], [class*='bubble'], .text-message"));
          if (markdownBlocks.length > 0) {
            messages = markdownBlocks.map(block => {
              const text = cleanText(block.innerText);
              const isUser = block.className.toLowerCase().includes("user") || block.className.toLowerCase().includes("question");
              return text ? {
                role: isUser ? 'user' : 'assistant',
                sender: isUser ? 'User' : platformName,
                text: text,
                timestamp: null
              } : null;
            }).filter(Boolean);
          }
        }

        // Stage C: Main Chat Scroll Container Child Walker
        if (messages.length === 0) {
          const candidates = Array.from(document.querySelectorAll("main, [role='main'], [class*='chat'], [class*='conversation'], [class*='history'], [class*='message']"));
          let bestContainer = null;
          let maxValidChildren = 0;

          for (const c of candidates) {
            const directChildren = Array.from(c.children);
            const textChildren = directChildren.filter(child => cleanText(child.innerText).length > 5);
            if (textChildren.length >= 2 && textChildren.length > maxValidChildren) {
              maxValidChildren = textChildren.length;
              bestContainer = c;
            }
          }

          if (bestContainer) {
            const items = Array.from(bestContainer.children).filter(child => cleanText(child.innerText).length > 5);
            messages = items.map(item => {
              const text = cleanText(item.innerText);
              const isUser = item.className.toLowerCase().includes("user") || item.className.toLowerCase().includes("right") ||
                             !!item.querySelector("[class*='user'], [class*='avatar-user'], img[alt*='user' i]");
              return text ? {
                role: isUser ? 'user' : 'assistant',
                sender: isUser ? 'User' : platformName,
                text: text,
                timestamp: null
              } : null;
            }).filter(Boolean);
          }
        }

        return {
          platform: platformName,
          title: cleanText(document.title) || `${platformName} Conversation`,
          id: 'export-' + Date.now(),
          messages
        };
      }
    }
  };

  // ==========================================
  // EXPORT FORMATTERS
  // ==========================================
  const Exporters = {
    toMarkdown(conv) {
      let md = `# ${conv.title}\n\n**Platform:** ${conv.platform}  \n`;
      if (conv.model) md += `**Model:** ${conv.model}  \n`;
      if (conv.id && conv.id !== 'unknown') md += `**Conversation ID:** \`${conv.id}\`  \n`;
      if (conv.created_at) md += `**Date:** ${formatTimestamp(conv.created_at)}  \n`;
      md += `**Total Messages:** ${conv.messages.length}\n\n---\n\n`;

      let count = 0;
      for (const m of conv.messages) {
        if (!m.text && !m.thoughts) continue;
        const time = m.timestamp ? ` _(${formatTimestamp(m.timestamp)})_` : '';
        md += `## ${m.sender}${time}\n\n`;
        if (m.thoughts) {
          md += `<details>\n<summary>💭 <i>Thinking Process / Reasoning</i></summary>\n\n> ${m.thoughts.replace(/\n/g, '\n> ')}\n\n</details>\n\n`;
        }
        if (m.text) md += `${m.text}\n\n`;
        md += `---\n\n`;
        count++;
      }
      return { content: md, count, total: conv.messages.length, ext: 'md', mime: 'text/markdown' };
    },

    toJSON(conv) {
      const clean = {
        platform: conv.platform,
        title: conv.title,
        id: conv.id || null,
        model: conv.model || null,
        created_at: conv.created_at || null,
        exported_at: new Date().toISOString(),
        total_messages: conv.messages.length,
        messages: conv.messages
      };
      return { content: JSON.stringify(clean, null, 2), count: conv.messages.length, total: conv.messages.length, ext: 'json', mime: 'application/json' };
    },

    toHTML(conv) {
      let itemsHtml = '';
      for (const m of conv.messages) {
        if (!m.text && !m.thoughts) continue;
        const isUser = m.role === 'user';
        const timeStr = m.timestamp ? formatTimestamp(m.timestamp) : '';
        const escapedText = (m.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br/>');

        let thoughtHtml = '';
        if (m.thoughts) {
          const escapedThought = m.thoughts.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br/>');
          thoughtHtml = `<details class="thoughts"><summary>💭 Thinking / Reasoning</summary><div class="thought-body">${escapedThought}</div></details>`;
        }

        itemsHtml += `
          <article class="msg ${isUser ? 'user' : 'assistant'}">
            <header class="msg-header">
              <span class="sender">${m.sender}</span>
              <span class="time">${timeStr}</span>
            </header>
            ${thoughtHtml}
            <div class="msg-body">${escapedText}</div>
          </article>
        `;
      }

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${conv.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem 1rem; line-height: 1.6; }
    .container { max-width: 860px; margin: 0 auto; }
    h1 { font-size: 1.85rem; margin-bottom: 0.5rem; }
    .meta { font-size: 0.875rem; color: #94a3b8; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }
    .msg { margin-bottom: 1.5rem; padding: 1.25rem; border-radius: 12px; }
    .msg.user { background: #1e293b; border-left: 4px solid #38bdf8; }
    .msg.assistant { background: #162033; border-left: 4px solid #a855f7; }
    .msg-header { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.6rem; }
    .sender { font-weight: 700; }
    .time { color: #94a3b8; }
    .msg-body { font-size: 0.95rem; word-break: break-word; }
    .thoughts { margin-bottom: 0.8rem; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.85rem; }
    .thoughts summary { cursor: pointer; color: #94a3b8; font-weight: 600; }
    .thought-body { margin-top: 0.5rem; color: #cbd5e1; font-style: italic; }
    @media print { body { background: white; color: black; padding: 0; } .msg { page-break-inside: avoid; border: 1px solid #ccc; margin-bottom: 1rem; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>${conv.title}</h1>
    <div class="meta">
      <div>Platform: <b>${conv.platform}</b> | Total Messages: <b>${conv.messages.length}</b></div>
      ${conv.model ? `<div>Model: ${conv.model}</div>` : ''}
      <div>Exported: ${new Date().toLocaleString()}</div>
    </div>
    <main>${itemsHtml}</main>
  </div>
</body>
</html>`;
      return { content: html, count: conv.messages.length, total: conv.messages.length, ext: 'html', mime: 'text/html' };
    }
  };

  // Controller
  const UniversalAIExporter = {
    Adapters,
    Exporters,
    async exportCurrent(format = 'markdown') {
      const order = ['claude', 'chatgpt', 'deepseek', 'glm', 'gemini', 'perplexity'];
      let activeAdapter = Adapters.generic;
      for (const k of order) {
        if (Adapters[k].matches()) { activeAdapter = Adapters[k]; break; }
      }

      console.log(`[Universal AI Exporter] Resolving via ${activeAdapter.name} 4-tier engine...`);
      const conv = await activeAdapter.extract();
      if (!conv.messages || conv.messages.length === 0) {
        throw new Error(`No messages could be extracted from this ${conv.platform} page.`);
      }

      let res;
      if (format === 'json') res = Exporters.toJSON(conv);
      else if (format === 'html') res = Exporters.toHTML(conv);
      else res = Exporters.toMarkdown(conv);

      const filename = sanitizeFilename(conv.title, res.ext);
      downloadBlob(res.content, filename, res.mime);
      return { platform: conv.platform, title: conv.title, count: res.count, filename };
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = UniversalAIExporter;
  else global.UniversalAIExporter = UniversalAIExporter;

})(typeof window !== 'undefined' ? window : globalThis);
