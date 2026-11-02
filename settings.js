// Shared between the background script and the options page.

// What PR info is sent to the AI, besides the title (which is always sent).
const SEND_DEFAULTS = {
  sendBody: true,
  sendCommits: false,
};

async function loadSettings() {
  const stored = await browser.storage.sync.get([
    "apiKey",
    "modelChoice",
    "customModel",
    ...Object.keys(SEND_DEFAULTS),
  ]);
  return { ...SEND_DEFAULTS, ...stored };
}
