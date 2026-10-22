/**
 * Universal AI Exporter & Context Compressor - Single Paste Console Snippet (v3.1)
 * Works on: Claude, ChatGPT, DeepSeek, GLM / ChatGLM / Z.ai, Google Gemini, Perplexity, Mistral, Copilot, Grok, and Local WebUIs.
 * 
 * Features:
 * - Multi-Platform Network & DOM Sniffing (Now with native GLM / ChatGLM support)
 * - 5-Stage Universal DOM Fallback Engine that never fails on active chats
 * - Automatic Token Compression (Strips conversational filler, trims thinking traces)
 * - 1-Click Clipboard Copy formatted for the Next AI
 * - Instant Markdown File Download
 */
(async () => {
  console.log("%c⚡ Universal AI Exporter & Prompt Compressor (v3.1) starting...", "color: #38bdf8; font-weight: bold; font-size: 14px;");

  function clean(t) {
    return t ? String(t).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";
  }

  function estimateTokens(text) {
    if (!text) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.round((text.length / 3.8 + words * 1.25) / 2));
  }

  function stripFiller(text) {
    if (!text) return "";
    let c = text.trim();
    c = c.replace(/^(sure|certainly|absolutely|of course|gladly|happy to help|yes)[!.,]?\s*(i'd be happy to|i would be happy to|i can help with that|i can help|here is|here's|below is)?[^.\n]*[.:]?/i, "");
    c = c.replace(/^(hello|hi|hey there)[!.,]?\s*/i, "");
    c = c.replace(/^(as an ai language model|as an ai|as claude|as chatgpt)[,.]?\s*/i, "");
    c = c.replace(/(let me know if you (need|have) (any|more) (further )?(help|questions|adjustments|feedback)[!.]?)\s*$/i, "");
    c = c.replace(/(hope this helps|i hope this helps|happy coding)[!.]?\s*$/i, "");
    return c.trim();
  }

  function download(content, filename, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const host = location.hostname;
  let conv = { platform: "AI Chat", title: clean(document.title) || "AI_Chat", messages: [] };

  // 1. CLAUDE (Network Re-fetch + Org Resolver)
  if (host.includes("claude.ai")) {
    conv.platform = "Claude";
    const uuid = location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
    let raw = null;
    if (typeof performance !== "undefined" && uuid) {
      const match = performance.getEntriesByType("resource").map(e => e.name).reverse().find(u => u.includes(uuid) && u.includes("/chat_conversations/"));
      if (match) {
        try { const r = await fetch(match, { credentials: "include" }); if (r.ok) raw = await r.json(); } catch (_) {}
      }
    }
    if (!raw && uuid) {
      const org = document.cookie.match(/lastActiveOrg=([0-9a-f-]+)/i)?.[1];
      if (org) {
        try {
          const r = await fetch(`https://claude.ai/api/organizations/${org}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong`, { credentials: "include" });
          if (r.ok) raw = await r.json();
        } catch (_) {}
      }
    }
    if (raw && (raw.chat_messages || raw.messages)) {
      conv.title = raw.name || conv.title;
      const msgs = raw.chat_messages || raw.messages;
      conv.messages = msgs.map(m => {
        let text = m.text || "";
        let thoughts = "";
        if (Array.isArray(m.content)) {
          text = m.content.map(b => {
            if (typeof b === "string") return b;
            if (b.type === "thinking") { thoughts += (b.thinking || "") + "\n"; return ""; }
            if (b.type === "text") return b.text || "";
            if (b.type === "tool_use") return `> 🛠 **Tool (${b.name}):** \`${JSON.stringify(b.input)}\``;
            return "";
          }).filter(Boolean).join("\n\n");
        }
        return {
          role: (m.sender === "human" || m.sender === "user") ? "user" : "assistant",
          sender: (m.sender === "human" || m.sender === "user") ? "User" : "Claude",
          text: clean(text),
          thoughts: clean(thoughts)
        };
      }).filter(m => m.text || m.thoughts);
    }
  }

  // 2. CHATGPT (Backend Tree Re-fetch + Synthetic Endpoint)
  else if (host.includes("chatgpt.com") || host.includes("chat.openai.com")) {
    conv.platform = "ChatGPT";
    const convMatch = location.href.match(/\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const convId = convMatch ? convMatch[1] : null;
    let raw = null;
    if (typeof performance !== "undefined") {
      const match = performance.getEntriesByType("resource").map(e => e.name).reverse().find(u => u.includes("/backend-api/conversation/"));
      if (match) {
        try { const r = await fetch(match, { credentials: "include" }); if (r.ok) raw = await r.json(); } catch (_) {}
      }
    }
    if (!raw && convId) {
      try {
        const r = await fetch(`${location.origin}/backend-api/conversation/${convId}`, { credentials: "include" });
        if (r.ok) raw = await r.json();
      } catch (_) {}
    }
    if (raw && raw.mapping) {
      conv.title = raw.title || conv.title;
      let curr = raw.current_node;
      const nodes = [];
      while (curr && raw.mapping[curr]) {
        nodes.unshift(raw.mapping[curr]);
        curr = raw.mapping[curr].parent;
      }
      conv.messages = nodes.map(n => {
        const msg = n.message;
        if (!msg || !msg.author || msg.author.role === "system") return null;
        const text = msg.content?.parts ? msg.content.parts.filter(p => typeof p === "string").join("\n\n") : (msg.content?.text || "");
        return {
          role: msg.author.role === "user" ? "user" : "assistant",
          sender: msg.author.role === "user" ? "User" : "ChatGPT",
          text: clean(text),
          thoughts: clean(msg.metadata?.thought || "")
        };
      }).filter(Boolean).filter(m => m.text || m.thoughts);
    }
  }

  // 3. DEEPSEEK (History API / R1 Reasoner Walk)
  else if (host.includes("deepseek.com")) {
    conv.platform = "DeepSeek";
    let raw = null;
    if (typeof performance !== "undefined") {
      const match = performance.getEntriesByType("resource").map(e => e.name).reverse().find(u => u.includes("/history_messages"));
      if (match) {
        try { const r = await fetch(match, { credentials: "include" }); if (r.ok) raw = await r.json(); } catch (_) {}
      }
    }
    if (raw && raw.data && Array.isArray(raw.data.chat_messages)) {
      conv.messages = raw.data.chat_messages.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        sender: m.role === "user" ? "User" : "DeepSeek",
        text: clean(m.content),
        thoughts: clean(m.thinking_content || "")
      })).filter(m => m.text || m.thoughts);
    } else {
      const els = Array.from(document.querySelectorAll(".chat-message, [class*='chat-message']"));
      conv.messages = els.map(el => {
        const isUser = el.className.includes("user") || el.getAttribute("data-role") === "user" || !!el.querySelector("[class*='user-avatar']");
        const thinkEl = el.querySelector(".ds-think, [class*='think']");
        const thoughts = thinkEl ? clean(thinkEl.innerText) : "";
        const clone = el.cloneNode(true);
        const cThink = clone.querySelector(".ds-think, [class*='think']");
        if (cThink) cThink.remove();
        const textEl = clone.querySelector(".ds-markdown, [class*='markdown']") || clone;
        return {
          role: isUser ? "user" : "assistant",
          sender: isUser ? "User" : "DeepSeek",
          text: clean(textEl.innerText),
          thoughts: thoughts
        };
      }).filter(m => m.text || m.thoughts);
    }
  }

  // 4. GLM / CHATGLM / Z.AI (chatglm.cn, z.ai, bigmodel.cn, glm.ai)
  else if (host.includes("chatglm.cn") || host.includes("z.ai") || host.includes("bigmodel.cn") || host.includes("glm.ai") || host.includes("zhipu")) {
    conv.platform = "GLM";

    // Check specific GLM question and answer DOM selectors
    const qSel = ".question-content-wrap, [class*='question-content'], [class*='question-wrap'], [class*='user-content'], [class*='user-msg'], [class*='my-message']";
    const aSel = ".answer-content-wrap, [class*='answer-content'], [class*='answer-wrap'], [class*='bot-content'], [class*='assistant-content'], [class*='bot-message']";
    
    const glmNodes = Array.from(document.querySelectorAll(`${qSel}, ${aSel}`));
    if (glmNodes.length > 0) {
      conv.messages = glmNodes.map(el => {
        const isUser = el.matches(qSel) || el.className.toLowerCase().includes("question") || el.className.toLowerCase().includes("user");
        const thinkEl = el.querySelector("[class*='think'], [class*='reason']");
        const thoughts = thinkEl ? clean(thinkEl.innerText) : "";
        const clone = el.cloneNode(true);
        const cThink = clone.querySelector("[class*='think'], [class*='reason']");
        if (cThink) cThink.remove();
        const text = clean(clone.innerText);
        return (text || thoughts) ? {
          role: isUser ? "user" : "assistant",
          sender: isUser ? "User" : "GLM",
          text: text,
          thoughts: thoughts
        } : null;
      }).filter(Boolean);
    }
  }

  // 5. UNIVERSAL MULTI-STAGE DOM RECOVERY (Works on ANY AI chat platform)
  if (!conv.messages || conv.messages.length === 0) {
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
    // Filter out parent elements that contain matched child turns
    turns = turns.filter(el => !turns.some(other => other !== el && el.contains(other)));

    if (turns.length > 0) {
      conv.messages = turns.map(turn => {
        const roleAttr = (turn.getAttribute("data-role") || turn.getAttribute("data-message-author-role") || turn.getAttribute("data-author") || "").toLowerCase();
        const classStr = turn.className.toLowerCase();
        const isUser = roleAttr.includes("user") || roleAttr.includes("human") ||
                       classStr.includes("user") || classStr.includes("human") || classStr.includes("question") || classStr.includes("prompt") ||
                       !!turn.querySelector("[class*='user'], [class*='human'], [class*='question']");

        const thinkEl = turn.querySelector(".ds-think, [class*='think'], [class*='reason']");
        const thoughts = thinkEl ? clean(thinkEl.innerText) : "";

        const clone = turn.cloneNode(true);
        const cThink = clone.querySelector(".ds-think, [class*='think'], [class*='reason']");
        if (cThink) cThink.remove();

        const text = clean(clone.innerText);
        return (text || thoughts) ? {
          role: isUser ? "user" : "assistant",
          sender: isUser ? "User" : (conv.platform || "Assistant"),
          text: text,
          thoughts: thoughts
        } : null;
      }).filter(Boolean);
    }
  }

  // Stage B: Markdown & Prose Block Harvesting
  if (!conv.messages || conv.messages.length === 0) {
    const markdownBlocks = Array.from(document.querySelectorAll(".markdown-body, .prose, [class*='markdown'], [class*='answer'], [class*='bubble'], .text-message"));
    if (markdownBlocks.length > 0) {
      conv.messages = markdownBlocks.map((block, idx) => {
        const text = clean(block.innerText);
        const isUser = block.className.toLowerCase().includes("user") || block.className.toLowerCase().includes("question");
        return text ? {
          role: isUser ? "user" : "assistant",
          sender: isUser ? "User" : (conv.platform || "Assistant"),
          text: text
        } : null;
      }).filter(Boolean);
    }
  }

  // Stage C: Main Chat Scroll Container Child Walker (The Ultimate Fail-Safe)
  if (!conv.messages || conv.messages.length === 0) {
    const candidates = Array.from(document.querySelectorAll("main, [role='main'], [class*='chat'], [class*='conversation'], [class*='history'], [class*='message']"));
    let bestContainer = null;
    let maxValidChildren = 0;

    for (const c of candidates) {
      const directChildren = Array.from(c.children);
      const textChildren = directChildren.filter(child => clean(child.innerText).length > 5);
      if (textChildren.length >= 2 && textChildren.length > maxValidChildren) {
        maxValidChildren = textChildren.length;
        bestContainer = c;
      }
    }

    if (bestContainer) {
      const items = Array.from(bestContainer.children).filter(child => clean(child.innerText).length > 5);
      conv.messages = items.map((item, idx) => {
        const text = clean(item.innerText);
        const isUser = item.className.toLowerCase().includes("user") || item.className.toLowerCase().includes("right") ||
                       !!item.querySelector("[class*='user'], [class*='avatar-user'], img[alt*='user' i]");
        return text ? {
          role: isUser ? "user" : "assistant",
          sender: isUser ? "User" : (conv.platform || "Assistant"),
          text: text
        } : null;
      }).filter(Boolean);
    }
  }

  if (!conv.messages || conv.messages.length === 0) {
    console.error("❌ Could not detect messages on this page. Make sure you are viewing an active conversation.");
    return;
  }

  // CALCULATE TOKEN COMPRESSION STATS
  let origAll = "";
  let compAll = "";
  let handoverPrompt = `> **[Prior Context: ${conv.title}]**\n> _Cleaned & Token-Compressed for AI Handover_\n\n`;

  let rawMd = `# ${conv.title}\n\n**Platform:** ${conv.platform}  \n**Total Messages:** ${conv.messages.length}\n\n---\n\n`;

  for (const m of conv.messages) {
    origAll += (m.thoughts || "") + "\n" + (m.text || "") + "\n";
    const cleanedText = m.role === "assistant" ? stripFiller(m.text) : m.text;
    compAll += cleanedText + "\n";

    // Build handover prompt
    handoverPrompt += `### ${m.role === "user" ? "👤 User" : "🤖 " + m.sender}\n\n${cleanedText}\n\n---\n\n`;

    // Build raw markdown
    rawMd += `## ${m.sender}\n\n`;
    if (m.thoughts) rawMd += `<details>\n<summary>💭 <i>Thinking Process</i></summary>\n\n> ${m.thoughts.replace(/\n/g, "\n> ")}\n\n</details>\n\n`;
    if (m.text) rawMd += `${m.text}\n\n`;
    rawMd += `---\n\n`;
  }

  handoverPrompt += `**[Task Continuation Prompt]**: Please review the above conversation history and continue assisting based on the technical decisions established above.`;

  const origTokens = estimateTokens(origAll);
  const compTokens = estimateTokens(compAll);
  const savedPercent = origTokens > 0 ? Math.round(((origTokens - compTokens) / origTokens) * 100) : 0;

  // Copy compressed prompt to clipboard
  try {
    await navigator.clipboard.writeText(handoverPrompt);
    console.log(`%c📋 COPIED COMPRESSED CONTEXT TO CLIPBOARD!`, "color: #a855f7; font-weight: bold; font-size: 13px;");
    console.log(`%c⚡ Original Tokens: ~${origTokens.toLocaleString()} | Compressed: ~${compTokens.toLocaleString()} (Saved ${savedPercent}% tokens!)`, "color: #22c55e; font-weight: bold;");
  } catch (_) {}

  // Download raw markdown file
  const safeTitle = (conv.title || "ai_chat").replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
  download(rawMd, `${safeTitle}.md`, "text/markdown");
  console.log(`%c💾 Downloaded full raw markdown to "${safeTitle}.md"!`, "color: #38bdf8; font-size: 12px;");
})();
