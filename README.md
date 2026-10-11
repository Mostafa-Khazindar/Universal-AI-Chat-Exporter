# Universal AI Chat Exporter

A simple, client-side browser extension and script to export and clean up conversations from Claude, ChatGPT, Google Gemini, DeepSeek, Perplexity, and more.

---

## Why I Made This

I originally made this tool for myself after trying to copy a long Claude conversation and finding out it was broken. 

I first tried the classic **Ctrl + P (Print to PDF)** trick, but the browser only printed the active screen view and completely cut off the rest of the chat. Then I tried manually clicking *"Load later messages"*, but Claude virtualizes its chat history—clicking the button only swaps the visible message window (e.g. from 18,000 → 16,699 characters) rather than appending them. Normal copy-pasting or regular page scrapers missed dozens of messages.

While inspecting the DevTools network tab, I realized that the browser actually receives the full, unpaginated conversation data (all 196+ messages in my test) in the background via internal API requests. I wrote a small script to grab that data directly from the active browser session and save it as a clean Markdown file.

Along the way, I added two things that made it much more useful:
1. **Multi-platform support**: Added handling for ChatGPT, DeepSeek, Gemini, Perplexity, and local WebUIs.
2. **Context Compression (for copying to another AI)**: When pasting a conversation into another model (like moving from Claude to ChatGPT), raw transcripts are filled with repetitive conversational pleasantries (*"Sure! I'd be happy to help..."*, *"Let me know if you need anything else!"*) and thousands of tokens of hidden reasoning scratchpads. A built-in filter cleans that up so you can copy a clean summary without wasting tokens or confusing the next model.

I figured other people might run into the exact same frustration, so I decided to share it here on GitHub.

---

## Supported Platforms

* **Claude** (`claude.ai`) — grabs full conversation trees (including tool calls and thinking blocks) directly from background API responses.
* **ChatGPT** (`chatgpt.com` / `chat.openai.com`) — extracts the full conversation node tree.
* **DeepSeek** (`chat.deepseek.com`) — captures full message history and DeepSeek R1 reasoning traces.
* **Google Gemini** (`gemini.google.com`) — walks structured turns and code blocks.
* **Perplexity** (`perplexity.ai`) — captures questions, answers, and sources.
* **Mistral, Copilot, Poe, Grok, and Local WebUIs** (Ollama, Open WebUI, etc.) — generic fallback extractor.

---

## How to Use It

Choose whichever method is easiest for you:

### Method 1: Chrome / Edge / Brave Extension (Recommended)
You don't need to install anything from any store. You can load it directly in Developer Mode:
1. Download or clone this repository:
   ```bash
   git clone https://github.com/Mostafa-Khazindar/Universal-AI-Chat-Exporter.git
   ```
2. Open your browser and go to `chrome://extensions` (or `edge://extensions`).
3. Turn on the **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** and select the `extension` folder from this repo.
5. On any supported AI chat page, a small **`⚡ Export & Compress`** button will appear in the bottom-right corner.

### Method 2: Tampermonkey Userscript
If you use Tampermonkey or Violentmonkey:
1. Create a new userscript.
2. Paste the contents of [`universal-ai-exporter.user.js`](./universal-ai-exporter.user.js) and save it.

### Method 3: Browser Console (Zero Install)
If you just want a quick one-off export without installing anything:
1. Open any AI chat.
2. Press `F12` (or right-click → Inspect) and switch to the **Console** tab.
3. Paste [`universal-snippet.js`](./universal-snippet.js) and press Enter.
4. It will immediately download your conversation as a `.md` file and copy the compressed context to your clipboard.

---

## Features

- **100% Client-Side & Private**: Runs strictly inside your browser. No telemetry, no accounts, and no data is sent anywhere.
- **Bypasses UI Virtualization**: Captures the entire conversation history, even when the web page only displays a few messages at a time.
- **Copy Compressed for Next AI**: Strips conversational filler, generic greetings, and raw scratchpads so you can transfer context to another model without wasting tokens or causing *"lost-in-the-middle"* hallucinations.
- **Multiple Export Formats**:
  - **Markdown (`.md`)** — clean, readable text with headers and timestamps.
  - **JSON (`.json`)** — structured data.
  - **HTML (`.html`)** — standalone viewer with dark mode, ready to print to PDF (`Ctrl + P`).

---

## Privacy & Legality

- **Is this safe to run?** Yes. The script only reads your own active conversation that is already loaded in your browser. It doesn't modify anything on the server.
- **No Store Registration Required:** Browser extensions can be freely run and shared as open-source code using Chrome's built-in Developer Mode.
- **Licenses:** Licensed under your choice of either [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE). See [LICENSES.md](LICENSES.md) for details.
