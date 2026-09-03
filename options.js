const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("save");
const status = document.getElementById("status");

browser.storage.sync.get(["apiKey"]).then(({ apiKey }) => {
  if (apiKey) apiKeyInput.value = apiKey;
});

saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    status.textContent = "Please enter an API key.";
    status.style.color = "#d1242f";
    return;
  }
  browser.storage.sync
    .set({ apiKey })
    .then(() => {
      status.textContent = "Saved!";
      status.style.color = "#1a7f37";
    });
});
