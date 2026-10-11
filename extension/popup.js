document.addEventListener('DOMContentLoaded', () => {
  const btnCopy = document.getElementById('btn-quick-copy');
  const btnMd = document.getElementById('btn-quick-md');
  const btnJson = document.getElementById('btn-quick-json');

  function executeInTab(action) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) return;
      chrome.scripting?.executeScript({
        target: { tabId: tabs[0].id },
        func: (act) => {
          if (act === 'copy') {
            const trigger = document.getElementById('ai-exporter-trigger');
            if (trigger) trigger.click();
          } else if (act === 'md') {
            window.UniversalAIExporter?.exportCurrent('markdown');
          } else if (act === 'json') {
            window.UniversalAIExporter?.exportCurrent('json');
          }
        },
        args: [action]
      });
      window.close();
    });
  }

  btnCopy.onclick = () => executeInTab('copy');
  btnMd.onclick = () => executeInTab('md');
  btnJson.onclick = () => executeInTab('json');
});
