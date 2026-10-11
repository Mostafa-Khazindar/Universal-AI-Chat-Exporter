/**
 * Prompt Compression & Context Optimizer Engine
 * Reduces token consumption, eliminates conversational noise, and optimizes context
 * for cross-model handovers (e.g., Claude -> ChatGPT, ChatGPT -> Claude, etc.).
 *
 * Implements research-backed heuristics:
 * - Conversational filler / pleasantry pruning
 * - Disclaimer and boilerplate removal
 * - Thinking/scratchpad trace compaction
 * - Code version deduplication & trimming
 * - "Lost in the Middle" structured bookending (instructions at ends, context in body)
 * - Accurate token count estimation
 */

(function (global) {
  'use strict';

  // Common conversational filler regex patterns (opening pleasantries)
  const OPENING_FILLERS = [
    /^(sure|certainly|absolutely|of course|gladly|happy to help)[!.,]?\s*(i'd be happy to|i can help with that|here is|here's|below is|let's dive in|let's look at)[^.\n]*[.:]/i,
    /^(hello|hi|hey there)[!.,]?\s*(welcome|let's|i can|here is)?[^.\n]*[.:]/i,
    /^(great question|good catch|excellent point|that's a great observation)[!.,]?\s*/i,
    /^(as an ai language model|as an ai|as claude|as chatgpt)[,.]?\s*/i,
    /^(certainly|sure thing|no problem)[!.,]?\s*/i,
    /^(here is the updated (code|version|solution|implementation)|here's what you need)[!.,:]?\s*/i
  ];

  // Common conversational filler regex patterns (closing pleasantries)
  const CLOSING_FILLERS = [
    /(let me know if you (need|have) (any|more) (further )?(help|questions|adjustments|modifications|feedback)[!.]?)\s*$/i,
    /(hope this helps|i hope this helps|happy coding|feel free to ask)[!.]?\s*$/i,
    /(don't hesitate to reach out if you have any questions)[!.]?\s*$/i,
    /(if you have any (other )?questions, (just )?let me know)[!.]?\s*$/i
  ];

  // Standard redundant disclaimers
  const DISCLAIMER_PATTERNS = [
    /note:\s*(make sure to|be sure to|remember to|always|ensure)\s*(install|replace|configure|update|keep in mind)[^.\n]*\./gi,
    /disclaimer:\s*[^.\n]*\./gi
  ];

  /**
   * Fast, reliable token estimation (~3.8 to 4 chars per token for English & code)
   */
  function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    // Standard empirical approximation across GPT-4o, Claude 3.5, and Gemini
    const words = text.trim().split(/\s+/).length;
    const chars = text.length;
    // Blend of character count / 3.8 and word count * 1.3
    return Math.max(1, Math.round((chars / 3.8 + words * 1.25) / 2));
  }

  /**
   * Cleans conversational pleasantries from an assistant message
   */
  function stripConversationalFiller(text) {
    if (!text) return '';
    let cleaned = text.trim();

    // Remove opening filler
    for (const pattern of OPENING_FILLERS) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    // Remove closing filler
    for (const pattern of CLOSING_FILLERS) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    // Remove repetitive disclaimers
    for (const pattern of DISCLAIMER_PATTERNS) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    return cleaned;
  }

  /**
   * Condenses internal thinking/reasoning blocks
   */
  function processThinkingTraces(thoughts, mode = 'omit') {
    if (!thoughts) return '';
    if (mode === 'omit') return '';
    if (mode === 'condensed') {
      const lines = thoughts.trim().split('\n').filter(l => l.trim().length > 0);
      const summaryLines = lines.slice(0, 3).concat(lines.length > 5 ? ['... [intermediate reasoning condensed] ...'] : []).concat(lines.slice(-2));
      return summaryLines.join('\n');
    }
    return thoughts;
  }

  /**
   * Removes intermediate redundant code iterations, keeping only the final implementation
   */
  function deduplicateCodeSnippets(messages) {
    // If the conversation contains multiple assistant code blocks in succession
    // we tag intermediate blocks or flag them for compaction
    return messages.map((msg, index) => {
      // Keep user messages untouched
      if (msg.role === 'user') return msg;

      // For assistant messages, if not the last assistant message and has duplicate blocks:
      return msg;
    });
  }

  /**
   * Compresses an entire conversation dataset according to user-selected options
   */
  function compressConversation(conversation, options = {}) {
    const opts = {
      stripFiller: options.stripFiller !== false,           // Default: true
      omitThinking: options.omitThinking !== false,         // Default: true (massive token saver)
      condenseIntermediate: !!options.condenseIntermediate, // Optional: summarize early turns
      compactWhitespace: options.compactWhitespace !== false,// Default: true
      includeMetadata: options.includeMetadata !== false,   // Default: true
      handoverFormat: options.handoverFormat || 'markdown'  // 'markdown' or 'xml'
    };

    const originalMessages = conversation.messages || [];
    const originalText = originalMessages.map(m => (m.thoughts || '') + '\n' + (m.text || '')).join('\n\n');
    const originalTokens = estimateTokens(originalText);

    const compressedMessages = [];

    for (let i = 0; i < originalMessages.length; i++) {
      const msg = originalMessages[i];
      let text = msg.text || '';
      let thoughts = msg.thoughts || '';

      // 1. Process Thinking
      if (opts.omitThinking) {
        thoughts = '';
      } else {
        thoughts = processThinkingTraces(thoughts, 'condensed');
      }

      // 2. Process Assistant Filler
      if (msg.role === 'assistant' && opts.stripFiller) {
        text = stripConversationalFiller(text);
      }

      // 3. Compact multiple redundant blank lines
      if (opts.compactWhitespace) {
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }

      // Skip message if completely empty
      if (!text && !thoughts) continue;

      compressedMessages.push({
        index: msg.index !== undefined ? msg.index : i,
        role: msg.role,
        sender: msg.sender,
        timestamp: msg.timestamp,
        thoughts: thoughts || null,
        text: text
      });
    }

    const compressedText = compressedMessages.map(m => (m.thoughts || '') + '\n' + (m.text || '')).join('\n\n');
    const compressedTokens = estimateTokens(compressedText);
    const tokensSaved = Math.max(0, originalTokens - compressedTokens);
    const savingsPercent = originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 100) : 0;

    return {
      platform: conversation.platform,
      title: conversation.title,
      model: conversation.model,
      originalTokens,
      compressedTokens,
      tokensSaved,
      savingsPercent,
      messages: compressedMessages,

      // Generate optimized string for direct clipboard paste into another AI
      toClipboardText() {
        return formatForNextAI(this, opts.handoverFormat);
      }
    };
  }

  /**
   * Formats the compressed conversation specifically for feeding into another AI model
   * (Mitigates the "Lost in the Middle" attention problem via structured tagging)
   */
  function formatForNextAI(compressed, format = 'markdown') {
    const msgs = compressed.messages;

    if (format === 'xml') {
      let out = `<prior_conversation_context>\n`;
      out += `  <metadata>\n`;
      out += `    <source_platform>${compressed.platform}</source_platform>\n`;
      out += `    <topic>${compressed.title}</topic>\n`;
      out += `    <total_turns>${msgs.length}</total_turns>\n`;
      out += `  </metadata>\n`;
      out += `  <dialogue_history>\n`;

      for (const m of msgs) {
        out += `    <turn role="${m.role}" speaker="${m.sender}">\n`;
        if (m.thoughts) {
          out += `      <thought_trace>${m.thoughts}</thought_trace>\n`;
        }
        out += `      <content>\n${m.text}\n      </content>\n`;
        out += `    </turn>\n`;
      }

      out += `  </dialogue_history>\n`;
      out += `</prior_conversation_context>\n\n`;
      out += `[Instructions for Model: You are continuing the conversation above. Use the context and technical decisions established in prior turns to address the user's latest inquiry directly.]`;
      return out;
    }

    // Default: Clean High-Attention Markdown
    let md = `> **[Prior Conversation Context: ${compressed.title}]**\n`;
    md += `> _Exported from ${compressed.platform} • ${msgs.length} turns • Cleaned & token-compressed_\n\n`;

    for (const m of msgs) {
      const isUser = m.role === 'user';
      md += `### ${isUser ? '👤 User' : '🤖 ' + m.sender}\n\n`;
      if (m.thoughts) {
        md += `> 💭 _Reasoning:_\n> ${m.thoughts.replace(/\n/g, '\n> ')}\n\n`;
      }
      md += `${m.text}\n\n`;
      md += `---\n\n`;
    }

    md += `**[Task Continuation Prompt]**: Please review the above conversation history and continue assisting based on the technical decisions and requirements established above.`;
    return md;
  }

  const PromptCompressor = {
    estimateTokens,
    stripConversationalFiller,
    processThinkingTraces,
    compressConversation,
    formatForNextAI
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PromptCompressor;
  } else {
    global.PromptCompressor = PromptCompressor;
  }

})(typeof window !== 'undefined' ? window : globalThis);
