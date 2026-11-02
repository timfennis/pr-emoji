const apiKeyInput = document.getElementById("apiKey");
const customModelInput = document.getElementById("customModel");
const modelHint = document.getElementById("modelHint");
const radios = document.querySelectorAll('input[name="modelChoice"]');
const sendCheckboxes = Object.keys(SEND_DEFAULTS).map((key) =>
  document.getElementById(key)
);
const saveBtn = document.getElementById("save");
const status = document.getElementById("status");

const HINTS = {
  free: "Routes each request to an available free model (free, but quality and speed vary)",
  haiku: "anthropic/claude-haiku-5.5 — fast and cheap, billed to your OpenRouter credits",
  custom: "Any OpenRouter model ID, see ",
};
const MODELS_URL = "https://openrouter.ai/models";

function selectedChoice() {
  return document.querySelector('input[name="modelChoice"]:checked')?.value ?? "free";
}

function updateModelUi() {
  const choice = selectedChoice();
  customModelInput.disabled = choice !== "custom";
  modelHint.textContent = HINTS[choice];
  if (choice === "custom") {
    const link = document.createElement("a");
    link.href = MODELS_URL;
    link.target = "_blank";
    link.textContent = "openrouter.ai/models";
    modelHint.appendChild(link);
  }
  if (choice === "custom") customModelInput.focus();
}

radios.forEach((r) => r.addEventListener("change", updateModelUi));

loadSettings().then((settings) => {
  const { apiKey, modelChoice, customModel } = settings;
  if (apiKey) apiKeyInput.value = apiKey;
  if (customModel) customModelInput.value = customModel;
  sendCheckboxes.forEach((cb) => (cb.checked = settings[cb.id]));
  const choice = HINTS[modelChoice] ? modelChoice : "free";
  document.querySelector(`input[name="modelChoice"][value="${choice}"]`).checked = true;
  updateModelUi();
});

function showStatus(text, ok) {
  status.textContent = text;
  status.style.color = ok ? "#1a7f37" : "#d1242f";
}

saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const modelChoice = selectedChoice();
  const customModel = customModelInput.value.trim();

  if (!apiKey) return showStatus("Please enter an API key.", false);
  if (modelChoice === "custom" && !customModel) {
    return showStatus("Please enter a model name.", false);
  }

  const sendSettings = Object.fromEntries(
    sendCheckboxes.map((cb) => [cb.id, cb.checked])
  );

  browser.storage.sync
    .set({ apiKey, modelChoice, customModel, ...sendSettings })
    .then(() => showStatus("Saved!", true));
});
