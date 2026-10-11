/**
 * Claude Exporter Engine
 * Core library for discovering, fetching, parsing, and exporting Claude conversations.
 * 100% Client-side and private.
 */

(function (global) {
  'use strict';

  /**
   * Helper: extract conversation UUID from current URL or text
   */
  function extractConversationUuid(urlOrText) {
    const target = urlOrText || (typeof window !== 'undefined' ? window.location.href : '');
    const match = target.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0] : null;
  }

  /**
   * Helper: extract organization ID from URL, cookies, or performance entries
   */
  function findOrganizationId() {
    if (typeof performance === 'undefined') return null;

    const entries = performance.getEntriesByType('resource');
    for (let i = entries.length - 1; i >= 0; i--) {
      const match = entries[i].name.match(/\/api\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (match) return match[1];
    }

    // Check document cookies
    if (typeof document !== 'undefined' && document.cookie) {
      const cookieMatch = document.cookie.match(/lastActiveOrg=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (cookieMatch) return cookieMatch[1];
    }

    return null;
  }

  /**
   * Locates or constructs the conversation endpoint URL.
   */
  function resolveConversationApiUrl(convUuid) {
    const uuid = convUuid || extractConversationUuid();

    // 1. Try performance entries directly (most accurate parameters)
    if (typeof performance !== 'undefined') {
      const entries = performance.getEntriesByType('resource').map(e => e.name);
      
      // If we have a UUID, search for matching requests
      if (uuid) {
        const matching = entries.filter(u => u.includes(uuid) && u.includes('/chat_conversations/'));
        if (matching.length > 0) {
          // Prefer requests with tree=True
          const treeMatch = matching.reverse().find(u => u.toLowerCase().includes('tree=true'));
          if (treeMatch) return treeMatch;
          return matching[0];
        }
      } else {
        // Find any chat_conversations request
        const matching = entries.filter(u => u.includes('/chat_conversations/'));
        if (matching.length > 0) {
          const treeMatch = matching.reverse().find(u => u.toLowerCase().includes('tree=true'));
          if (treeMatch) return treeMatch;
          return matching[0];
        }
      }
    }

    // 2. Synthesize URL if org ID and conv UUID are found
    const orgId = findOrganizationId();
    if (orgId && uuid) {
      return `https://claude.ai/api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong`;
    }

    // 3. Fallback: relative path without domain
    if (orgId && uuid) {
      return `/api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong`;
    }

    return null;
  }

  /**
   * Fetch conversation data using session credentials.
   */
  async function fetchConversation(options = {}) {
    const uuid = options.uuid || extractConversationUuid();
    const apiUrl = options.url || resolveConversationApiUrl(uuid);

    if (!apiUrl) {
      throw new Error(
        'Could not locate conversation API URL or UUID. Ensure you are on a Claude conversation page (claude.ai/chat/...).'
      );
    }

    const response = await fetch(apiUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch conversation (${response.status}: ${response.statusText})`);
    }

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error('Received response from Claude, but it was not valid JSON.');
    }

    return data;
  }

  /**
   * Universal message extractor that adapts to schema changes.
   */
  function extractMessages(data) {
    if (!data) return [];

    // Standard location
    if (Array.isArray(data.chat_messages)) {
      return data.chat_messages;
    }

    // Alternative keys that Anthropic might use
    const potentialKeys = ['messages', 'chatMessages', 'items', 'nodes', 'conversation_messages'];
    for (const key of potentialKeys) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }

    // If data itself is an array of messages
    if (Array.isArray(data)) {
      return data;
    }

    // Recursive search for message collection if schema shifts
    function findMessageArray(obj, depth = 0) {
      if (depth > 4 || !obj || typeof obj !== 'object') return null;
      for (const k in obj) {
        if (Array.isArray(obj[k]) && obj[k].length > 0) {
          const sample = obj[k][0];
          if (sample && typeof sample === 'object' && ('text' in sample || 'content' in sample || 'sender' in sample)) {
            return obj[k];
          }
        } else if (typeof obj[k] === 'object') {
          const res = findMessageArray(obj[k], depth + 1);
          if (res) return res;
        }
      }
      return null;
    }

    const discovered = findMessageArray(data);
    return discovered || [];
  }

  /**
   * Extract and normalize text content from a message node
   */
  function extractMessageText(message) {
    if (!message) return '';

    // Direct text string
    if (typeof message.text === 'string' && message.text.trim()) {
      return message.text;
    }

    // Content as string
    if (typeof message.content === 'string' && message.content.trim()) {
      return message.content;
    }

    // Array of content blocks
    if (Array.isArray(message.content)) {
      const parts = [];
      for (const block of message.content) {
        if (!block) continue;
        if (typeof block === 'string') {
          parts.push(block);
        } else if (block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text);
        } else if (typeof block.text === 'string') {
          parts.push(block.text);
        } else if (typeof block.content === 'string') {
          parts.push(block.content);
        } else if (block.type === 'tool_use' || block.name) {
          // Tool call representation
          const toolName = block.name || 'Tool Call';
          const inputStr = block.input ? JSON.stringify(block.input, null, 2) : '';
          parts.push(`> 🛠 **${toolName}**\n\`\`\`json\n${inputStr}\n\`\`\``);
        } else if (block.type === 'tool_result') {
          const resultText = typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2);
          parts.push(`> 📋 **Tool Result:**\n\`\`\`\n${resultText}\n\`\`\``);
        }
      }
      if (parts.length > 0) return parts.join('\n\n');
    }

    return '';
  }

  /**
   * Extract attachment information from a message
   */
  function extractAttachments(message) {
    const list = [];
    if (Array.isArray(message.attachments)) {
      for (const att of message.attachments) {
        list.push({
          name: att.file_name || att.name || 'Attachment',
          size: att.file_size || att.size || null,
          type: att.file_type || att.type || 'unknown'
        });
      }
    }
    if (Array.isArray(message.files)) {
      for (const f of message.files) {
        list.push({
          name: f.file_name || f.name || 'File',
          size: f.file_size || f.size || null,
          type: f.file_type || f.type || 'unknown'
        });
      }
    }
    return list;
  }

  /**
   * Normalize sender name
   */
  function normalizeSender(message) {
    const sender = String(message.sender || message.role || message.type || '').toLowerCase();
    if (sender === 'human' || sender === 'user') return 'User';
    if (sender === 'assistant' || sender === 'claude' || sender === 'bot') return 'Claude';
    if (sender === 'system') return 'System';
    return message.sender || 'Unknown';
  }

  /**
   * Format message timestamp
   */
  function formatTimestamp(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  /**
   * Export to Markdown string
   */
  function toMarkdown(data, options = {}) {
    const includeTimestamps = options.timestamps !== false;
    const includeMetadata = options.metadata !== false;
    const messages = extractMessages(data);

    let md = '';

    const title = data.name || data.title || 'Claude Conversation';
    md += `# ${title}\n\n`;

    if (includeMetadata) {
      if (data.uuid || data.id) md += `**Conversation ID:** \`${data.uuid || data.id}\`  \n`;
      if (data.model) md += `**Model:** ${data.model}  \n`;
      if (data.created_at) md += `**Created:** ${formatTimestamp(data.created_at)}  \n`;
      if (data.updated_at) md += `**Updated:** ${formatTimestamp(data.updated_at)}  \n`;
      md += `**Total Messages:** ${messages.length}\n\n`;
      md += `---\n\n`;
    }

    let exportedCount = 0;
    for (const msg of messages) {
      const text = extractMessageText(msg).trim();
      const attachments = extractAttachments(msg);

      if (!text && attachments.length === 0) continue;

      const sender = normalizeSender(msg);
      const timeStr = includeTimestamps && msg.created_at ? ` _(${formatTimestamp(msg.created_at)})_` : '';

      md += `## ${sender}${timeStr}\n\n`;

      if (attachments.length > 0) {
        md += `📎 **Attachments:**\n`;
        attachments.forEach(a => {
          md += `- ${a.name} (${a.type})\n`;
        });
        md += `\n`;
      }

      if (text) {
        md += `${text}\n\n`;
      }

      md += `---\n\n`;
      exportedCount++;
    }

    return {
      content: md,
      messageCount: messages.length,
      exportedCount: exportedCount,
      title: title
    };
  }

  /**
   * Export to Clean Formatted JSON
   */
  function toCleanJSON(data) {
    const messages = extractMessages(data);
    const cleaned = {
      id: data.uuid || data.id,
      title: data.name || data.title || 'Claude Conversation',
      model: data.model,
      created_at: data.created_at,
      updated_at: data.updated_at,
      message_count: messages.length,
      messages: messages.map((msg, idx) => ({
        index: msg.index !== undefined ? msg.index : idx,
        id: msg.uuid || msg.id,
        sender: normalizeSender(msg),
        created_at: msg.created_at,
        text: extractMessageText(msg),
        attachments: extractAttachments(msg)
      }))
    };
    return {
      content: JSON.stringify(cleaned, null, 2),
      messageCount: messages.length,
      exportedCount: cleaned.messages.length,
      title: cleaned.title
    };
  }

  /**
   * Export to HTML document (beautiful standalone styling)
   */
  function toHTML(data) {
    const mdResult = toMarkdown(data);
    const messages = extractMessages(data);
    const title = data.name || data.title || 'Claude Conversation';

    // Simple HTML renderer
    let messagesHtml = '';
    for (const msg of messages) {
      const text = extractMessageText(msg);
      const attachments = extractAttachments(msg);
      if (!text && attachments.length === 0) continue;

      const sender = normalizeSender(msg);
      const isClaude = sender === 'Claude';
      const timeStr = msg.created_at ? formatTimestamp(msg.created_at) : '';

      // Escape HTML
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br/>');

      let attHtml = '';
      if (attachments.length > 0) {
        attHtml = `<div class="attachments">📎 ${attachments.map(a => `<span class="badge">${a.name}</span>`).join(' ')}</div>`;
      }

      messagesHtml += `
        <div class="message ${isClaude ? 'claude' : 'user'}">
          <div class="header">
            <span class="sender">${sender}</span>
            <span class="time">${timeStr}</span>
          </div>
          ${attHtml}
          <div class="body">${escapedText}</div>
        </div>
      `;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #f1f5f9; border-bottom: 1px solid #334155; padding-bottom: 0.75rem; }
    .meta { font-size: 0.875rem; color: #94a3b8; margin-bottom: 2rem; }
    .message { border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.25rem; }
    .message.user { background: #1e293b; border-left: 4px solid #38bdf8; }
    .message.claude { background: #182234; border-left: 4px solid #c084fc; }
    .header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.875rem; }
    .sender { font-weight: 700; color: #e2e8f0; }
    .time { color: #64748b; }
    .body { font-size: 0.95rem; white-space: pre-wrap; word-break: break-word; }
    .attachments { margin-bottom: 0.75rem; font-size: 0.85rem; color: #38bdf8; }
    .badge { background: #334155; padding: 0.2rem 0.5rem; border-radius: 4px; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <div class="meta">
      <div>Model: ${data.model || 'Unknown'} | Total messages: ${messages.length}</div>
      <div>ID: ${data.uuid || data.id || 'N/A'}</div>
    </div>
    <div class="chat-flow">
      ${messagesHtml}
    </div>
  </div>
</body>
</html>`;

    return {
      content: html,
      messageCount: messages.length,
      exportedCount: messages.length,
      title: title
    };
  }

  /**
   * Trigger local browser download of content
   */
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

  /**
   * Sanitize filename
   */
  function sanitizeFilename(name, ext) {
    const clean = (name || 'claude-conversation')
      .replace(/[<>:"/\\|?*]+/g, '_')
      .replace(/\s+/g, '_')
      .trim();
    return `${clean}.${ext}`;
  }

  // Expose API
  const ClaudeExporter = {
    extractConversationUuid,
    findOrganizationId,
    resolveConversationApiUrl,
    fetchConversation,
    extractMessages,
    extractMessageText,
    toMarkdown,
    toCleanJSON,
    toHTML,
    downloadBlob,
    sanitizeFilename,
    async exportCurrent(format = 'markdown') {
      const data = await fetchConversation();
      let res;
      let ext = 'md';
      let mime = 'text/markdown';

      if (format === 'json') {
        res = toCleanJSON(data);
        ext = 'json';
        mime = 'application/json';
      } else if (format === 'html') {
        res = toHTML(data);
        ext = 'html';
        mime = 'text/html';
      } else {
        res = toMarkdown(data);
        ext = 'md';
        mime = 'text/markdown';
      }

      const filename = sanitizeFilename(res.title, ext);
      downloadBlob(res.content, filename, mime);
      return res;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClaudeExporter;
  } else {
    global.ClaudeExporter = ClaudeExporter;
  }

})(typeof window !== 'undefined' ? window : globalThis);
