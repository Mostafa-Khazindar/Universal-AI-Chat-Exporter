/**
 * Automated Test Suite for Universal AI Exporter & Prompt Compressor
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('🧪 Starting Universal AI Exporter Test Suite...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    testsFailed++;
  }
}

// -------------------------------------------------------------
// TEST 1: Prompt Compressor Unit Tests
// -------------------------------------------------------------
console.log('📦 TEST 1: Prompt Compressor Engine');

const promptCompressorCode = fs.readFileSync(path.join(__dirname, 'prompt-compressor.js'), 'utf8');
const pcContext = { globalThis: {}, module: { exports: {} } };
vm.createContext(pcContext);
vm.runInContext(promptCompressorCode, pcContext);
const PromptCompressor = pcContext.module.exports;

// 1.1 Token Estimation
const sampleText = 'The quick brown fox jumps over the lazy dog and writes some TypeScript code.';
const tokens = PromptCompressor.estimateTokens(sampleText);
assert(tokens > 10 && tokens < 25, `Token estimation realistic: ${tokens} tokens`);

// 1.2 Conversational Filler Stripping
const fillerMessage = 'Sure! I would be happy to help with that. Here is the implementation:\n\n```js\nconst x = 1;\n```\n\nHope this helps! Let me know if you need any adjustments.';
const cleaned = PromptCompressor.stripConversationalFiller(fillerMessage);
assert(!cleaned.includes('happy to help') && !cleaned.includes('Hope this helps!'), 'Conversational filler successfully stripped');
assert(cleaned.includes('const x = 1;'), 'Code block preserved intact');

// 1.3 Full Conversation Compression
const mockConv = {
  platform: 'Claude',
  title: 'Debugging JWT Authentication',
  messages: [
    { role: 'user', sender: 'User', text: 'How do I handle expired JWT tokens in Express?' },
    {
      role: 'assistant',
      sender: 'Claude',
      thoughts: 'Thinking: The user wants to know about refresh tokens. We need to explain rotation and cookies...',
      text: 'Certainly! I can help with that. Here is how you can implement refresh token rotation:\n\n```js\napp.post("/refresh", verifyToken);\n```\n\nLet me know if you have any questions!'
    }
  ]
};

const compResult = PromptCompressor.compressConversation(mockConv, { stripFiller: true, omitThinking: true });
assert(compResult.compressedTokens < compResult.originalTokens, `Tokens compressed: ${compResult.originalTokens} -> ${compResult.compressedTokens} (Saved ${compResult.savingsPercent}%)`);
assert(compResult.messages[1].thoughts === null || compResult.messages[1].thoughts === '', 'Hidden thinking traces omitted from compressed handover');

const clipboardOutput = compResult.toClipboardText();
assert(clipboardOutput.includes('[Prior Conversation Context: Debugging JWT Authentication]'), 'Clipboard handover contains structured context header');
assert(clipboardOutput.includes('[Task Continuation Prompt]'), 'Clipboard handover contains model continuation instruction');

// -------------------------------------------------------------
// TEST 2: Universal AI Exporter Engine Tests
// -------------------------------------------------------------
console.log('\n📦 TEST 2: Universal AI Exporter Formats & Schema Parser');

const exporterCode = fs.readFileSync(path.join(__dirname, 'universal-ai-exporter.js'), 'utf8');
const expContext = {
  globalThis: {},
  module: { exports: {} },
  location: { hostname: 'claude.ai', href: 'https://claude.ai/chat/1b157e5c-4a3f-4e2f-a76f-43d588b8a075' },
  document: { title: 'Claude Test Conversation - Claude' },
  performance: { getEntriesByType: () => [] }
};
vm.createContext(expContext);
vm.runInContext(exporterCode, expContext);
const Exporter = expContext.module.exports;

// 2.1 Format Converters
const mdExport = Exporter.Exporters.toMarkdown(mockConv);
assert(mdExport.content.includes('# Debugging JWT Authentication'), 'Markdown format has correct title');
assert(mdExport.content.includes('## User') && mdExport.content.includes('## Claude'), 'Markdown format has role headers');

const jsonExport = Exporter.Exporters.toJSON(mockConv);
const parsedJson = JSON.parse(jsonExport.content);
assert(parsedJson.platform === 'Claude' && parsedJson.messages.length === 2, 'JSON export is valid and structured');

const htmlExport = Exporter.Exporters.toHTML(mockConv);
assert(htmlExport.content.includes('<!DOCTYPE html>') && htmlExport.content.includes('Debugging JWT Authentication'), 'HTML export creates valid standalone document');

// 2.2 Claude Schema Parser Simulation (196-message API structure)
const claudeMockData = {
  uuid: '1b157e5c-4a3f-4e2f-a76f-43d588b8a075',
  name: 'Long Claude Project Session',
  model: 'claude-3-5-sonnet-20241022',
  chat_messages: [
    { sender: 'human', text: 'Hello Claude', created_at: '2026-10-06T18:00:00Z' },
    {
      sender: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Analyze query...' },
        { type: 'text', text: 'Hello! How can I assist you today?' },
        { type: 'tool_use', name: 'search_docs', input: { q: 'react' } }
      ],
      created_at: '2026-10-06T18:01:00Z'
    }
  ]
};

// 2.3 ChatGPT DAG Mapping Tree Parser Simulation
const chatgptMockData = {
  title: 'ChatGPT Python Refactor',
  current_node: 'node-3',
  mapping: {
    'node-1': { id: 'node-1', parent: null, message: { author: { role: 'system' }, content: { parts: [''] } } },
    'node-2': { id: 'node-2', parent: 'node-1', message: { author: { role: 'user' }, content: { parts: ['Refactor my script'] } } },
    'node-3': { id: 'node-3', parent: 'node-2', message: { author: { role: 'assistant' }, content: { parts: ['Here is the clean refactor:'] }, metadata: { thought: 'Reviewing PEP8 guidelines' } } }
  }
};

// -------------------------------------------------------------
// TEST 3: File Syntax & Bundle Verification
// -------------------------------------------------------------
console.log('\n📦 TEST 3: Syntax Verification of All Scripts');

const filesToValidate = [
  'universal-snippet.js',
  'universal-ai-exporter.user.js',
  'extension/content.js',
  'extension/popup.js',
  'claude-export-snippet.js'
];

for (const file of filesToValidate) {
  try {
    const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
    new vm.Script(code);
    assert(true, `${file} syntax is clean and valid`);
  } catch (err) {
    assert(false, `${file} syntax error: ${err.message}`);
  }
}

// Summary
console.log(`\n========================================`);
console.log(`TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log(`========================================\n`);

if (testsFailed > 0) {
  process.exit(1);
}
