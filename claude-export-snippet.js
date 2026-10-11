(async () => {
  console.log("%c⚡ Claude Exporter starting...", "color: #a855f7; font-weight: bold; font-size: 13px;");

  function getConversationUuid() {
    const match = window.location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return match ? match[0] : null;
  }

  function getOrgId() {
    const entries = performance.getEntriesByType("resource");
    for (let i = entries.length - 1; i >= 0; i--) {
      const match = entries[i].name.match(/\/api\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (match) return match[1];
    }
    const cookieMatch = document.cookie.match(/lastActiveOrg=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return cookieMatch ? cookieMatch[1] : null;
  }

  function getApiUrl(uuid) {
    const entries = performance.getEntriesByType("resource").map(e => e.name);
    if (uuid) {
      const matching = entries.filter(u => u.includes(uuid) && u.includes("/chat_conversations/"));
      if (matching.length) {
        return matching.reverse().find(u => u.toLowerCase().includes("tree=true")) || matching[0];
      }
    }
    const orgId = getOrgId();
    if (orgId && uuid) {
      return `https://claude.ai/api/organizations/${orgId}/chat_conversations/${uuid}?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong`;
    }
    return null;
  }

  const uuid = getConversationUuid();
  if (!uuid) {
    console.error("❌ Not on a Claude conversation page (URL must contain conversation UUID).");
    return;
  }

  const apiUrl = getApiUrl(uuid);
  if (!apiUrl) {
    console.error("❌ Could not determine API URL. Refresh the conversation page once and re-run.");
    return;
  }

  console.log("Fetching conversation from:", apiUrl);

  try {
    const res = await fetch(apiUrl, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();

    const messages = Array.isArray(data.chat_messages) ? data.chat_messages : (data.messages || []);
    if (!messages.length) {
      console.warn("⚠️ No messages found in payload.", data);
      return;
    }

    function extractText(m) {
      if (typeof m.text === "string" && m.text.trim()) return m.text;
      if (typeof m.content === "string" && m.content.trim()) return m.content;
      if (Array.isArray(m.content)) {
        return m.content.map(b => {
          if (!b) return "";
          if (typeof b === "string") return b;
          if (typeof b.text === "string") return b.text;
          if (b.type === "tool_use" || b.name) return `> 🛠 **Tool: ${b.name}**\n\`\`\`json\n${JSON.stringify(b.input, null, 2)}\n\`\`\``;
          if (b.type === "tool_result") return `> 📋 **Result:**\n\`\`\`\n${typeof b.content === "string" ? b.content : JSON.stringify(b.content, null, 2)}\n\`\`\``;
          return "";
        }).filter(Boolean).join("\n\n");
      }
      return "";
    }

    function getSender(m) {
      const s = String(m.sender || m.role || "").toLowerCase();
      if (s === "human" || s === "user") return "User";
      if (s === "assistant" || s === "claude") return "Claude";
      return m.sender || "Unknown";
    }

    const title = (data.name || "claude-conversation").trim();
    let md = `# ${title}\n\n**Conversation ID:** \`${data.uuid || uuid}\`  \n`;
    if (data.model) md += `**Model:** ${data.model}  \n`;
    md += `**Total Messages:** ${messages.length}\n\n---\n\n`;

    let count = 0;
    for (const msg of messages) {
      const text = extractText(msg).trim();
      if (!text) continue;
      const sender = getSender(msg);
      const time = msg.created_at ? ` _(${new Date(msg.created_at).toLocaleString()})_` : "";
      md += `## ${sender}${time}\n\n${text}\n\n---\n\n`;
      count++;
    }

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title.replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, "_") + ".md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    console.log(`%c✅ Exported ${count} of ${messages.length} messages to "${a.download}"!`, "color: #22c55e; font-weight: bold; font-size: 13px;");
  } catch (err) {
    console.error("❌ Export error:", err);
  }
})();
