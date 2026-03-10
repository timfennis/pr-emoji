const apiKeyInput = document.getElementById("apiKey");
const modelSelect = document.getElementById("model");
const saveBtn = document.getElementById("save");
const status = document.getElementById("status");

const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
const MAX_PROMPT_PRICE = 0.000001; // $1 per million tokens

// Recommended: cheapest model from these providers (any price)
const RECOMMENDED_PROVIDERS = ["google", "openai", "anthropic"];

function formatOption(m) {
  const opt = document.createElement("option");
  opt.value = m.id;
  const pricePerMillion = (parseFloat(m.pricing.prompt) * 1000000).toFixed(2);
  opt.textContent = m.name || m.id;
  if (pricePerMillion !== "0.00") {
    opt.textContent += " - $" + pricePerMillion + "/M tokens";
  }
  return opt;
}

async function loadModels() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    const allModels = data.data.filter((m) => {
      const price = parseFloat(m.pricing?.prompt ?? "999");
      const isText =
        m.architecture?.modality === "text->text" ||
        m.architecture?.input_modalities?.includes("text");
      return price > 0 && isText;
    });

    // Recommended: cheapest model from each big provider
    const recommended = [];
    const recommendedIds = new Set();
    for (const provider of RECOMMENDED_PROVIDERS) {
      const best = allModels
        .filter((m) => m.id.startsWith(provider + "/"))
        .sort(
          (a, b) =>
            parseFloat(a.pricing.prompt) - parseFloat(b.pricing.prompt)
        )[0];
      if (best) {
        recommended.push(best);
        recommendedIds.add(best.id);
      }
    }

    // Other cheap models: all that qualify, excluding recommended, sorted by provider then name
    const others = allModels
      .filter((m) => {
        const price = parseFloat(m.pricing?.prompt ?? "999");
        return price <= MAX_PROMPT_PRICE && !recommendedIds.has(m.id);
      })
      .sort((a, b) => {
        const nameA = (a.name || a.id).toLowerCase();
        const nameB = (b.name || b.id).toLowerCase();
        const provA = a.id.split("/")[0];
        const provB = b.id.split("/")[0];
        if (provA !== provB) return provA.localeCompare(provB);
        return nameA.localeCompare(nameB);
      });

    modelSelect.textContent = "";

    if (recommended.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Recommended";
      recommended.forEach((m) => group.appendChild(formatOption(m)));
      modelSelect.appendChild(group);
    }

    if (others.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Other cheap models";
      others.forEach((m) => group.appendChild(formatOption(m)));
      modelSelect.appendChild(group);
    }

    if (recommended.length === 0 && others.length === 0) {
      const noModels = document.createElement("option");
      noModels.value = "";
      noModels.textContent = "No models found";
      modelSelect.appendChild(noModels);
      return;
    }

    // Restore saved selection
    const { model } = await browser.storage.sync.get("model");
    if (
      model &&
      modelSelect.querySelector("option[value='" + CSS.escape(model) + "']")
    ) {
      modelSelect.value = model;
    } else if (
      modelSelect.querySelector(
        "option[value='" + CSS.escape(DEFAULT_MODEL) + "']"
      )
    ) {
      modelSelect.value = DEFAULT_MODEL;
    }
  } catch (e) {
    modelSelect.textContent = "";
    const fallback = document.createElement("option");
    fallback.value = DEFAULT_MODEL;
    fallback.textContent = DEFAULT_MODEL + " (failed to load model list)";
    modelSelect.appendChild(fallback);
    console.error("Failed to load models:", e);
  }
}

browser.storage.sync.get(["apiKey"]).then(({ apiKey }) => {
  if (apiKey) apiKeyInput.value = apiKey;
});

loadModels();

saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    status.textContent = "Please enter an API key.";
    status.style.color = "#d1242f";
    return;
  }
  browser.storage.sync
    .set({ apiKey, model: modelSelect.value })
    .then(() => {
      status.textContent = "Saved!";
      status.style.color = "#1a7f37";
    });
});
