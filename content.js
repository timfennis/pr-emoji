let autoSuggestFired = false;
let autoSuggestTimer = null;
let wandInProgress = false;
const autoSuggestInputs = new WeakSet();

const SUGGEST_LABEL = "🎯 Suggest Emoji";
const SUGGEST_TOOLTIP =
  "Suggest an emoji (ctrl/shift+click to apply the top pick)";
const WAND_TOOLTIP = "Add a random AI-picked emoji to the title";

// The content script runs on every github.com page so it survives SPA
// navigation (e.g. repo home -> PR page never triggers a fresh injection).
// Only do work on pages that can have a PR title input.
function isPrPage() {
  return /^\/[^/]+\/[^/]+\/(pull\/\d+|compare\/)/.test(location.pathname);
}

// Coalesce bursts of DOM mutations into one check. Not requestAnimationFrame:
// that never fires while the window is occluded or the tab is in the background.
let injectScheduled = false;
function scheduleInject() {
  if (injectScheduled) return;
  injectScheduled = true;
  setTimeout(() => {
    injectScheduled = false;
    tryInject();
  }, 50);
}

function init() {
  const observer = new MutationObserver(scheduleInject);
  observer.observe(document.body, { childList: true, subtree: true });
  tryInject();

  // Handle GitHub SPA navigation (soft-nav is modern GitHub, turbo:load is older)
  for (const evt of ["soft-nav:end", "turbo:load"]) {
    document.addEventListener(evt, () => {
      autoSuggestFired = false;
      tryInject();
    });
  }

  // Listen for keyboard shortcut from background script
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "trigger-suggest") return;
    const input = findTitleInput();
    const wand = document.getElementById("pr-emoji-wand");
    if (input) onSuggestClick(input);
    else if (wand) onWandClick();
  });
}

// --- DOM lookups ---

function findCreateTitleInput() {
  return document.querySelector('input[name="pull_request[title]"]');
}

function findEditTitleInput() {
  // Look for the (visually hidden) "Edit pull request title" label and find
  // its associated input. GitHub has changed the casing of this label before.
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    if (label.textContent.trim().toLowerCase() === "edit pull request title") {
      const forId = label.getAttribute("for");
      if (forId) return document.getElementById(forId);
      // Fallback: find input as sibling
      return label.parentElement?.querySelector('input[type="text"]');
    }
  }
  return null;
}

function findTitleInput() {
  return findCreateTitleInput() || findEditTitleInput();
}

// Primer IconButtons are named by a tooltip element referenced via aria-labelledby
function accessibleName(el) {
  const ids = el.getAttribute("aria-labelledby");
  if (ids) {
    return ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
  }
  return (el.getAttribute("aria-label") ?? el.textContent).trim();
}

function findEditTitleButton() {
  for (const btn of document.querySelectorAll("button")) {
    if (
      btn.querySelector("svg.octicon-pencil") &&
      accessibleName(btn).toLowerCase() === "edit title"
    ) {
      return btn;
    }
  }
  return null;
}

// --- Injection ---

function tryInject() {
  const container = document.getElementById("pr-emoji-container");
  const wandWrap = document.getElementById("pr-emoji-wand-wrap");

  if (!isPrPage()) {
    container?.remove();
    wandWrap?.remove();
    document.getElementById("pr-emoji-btn")?.remove();
    return;
  }

  // Case 1: PR creation page
  const createInput = findCreateTitleInput();
  if (createInput) {
    if (!document.getElementById("pr-emoji-btn")) {
      injectCreateButton(createInput);
    }
    if (!autoSuggestInputs.has(createInput)) {
      autoSuggestInputs.add(createInput);
      setupAutoSuggest(createInput);
    }
    return;
  }

  // Case 2: PR edit mode
  const editInput = findEditTitleInput();
  if (editInput) {
    if (!container && !wandInProgress) injectButtonBelow(editInput);
    return;
  }
  container?.remove();

  // Case 3: PR view mode — magic wand next to the pencil
  if (!wandWrap) {
    const pencil = findEditTitleButton();
    if (pencil) injectWand(pencil);
  }
}

function createSuggestButton(className, label, titleInputGetter) {
  const btn = document.createElement("button");
  btn.id = "pr-emoji-btn";
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.dataset.label = label;
  btn.title = SUGGEST_TOOLTIP;
  btn.setAttribute("aria-label", SUGGEST_TOOLTIP);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = titleInputGetter();
    if (input) onSuggestClick(input, e);
  });
  return btn;
}

// Create page: take over the Copilot slot inside the title input. content.css
// hides the Copilot button itself. Falls back to a button below the input when
// there is no Copilot slot (e.g. Copilot disabled for the account).
function injectCreateButton(titleInput) {
  const slot = titleInput
    .closest(".TextInput-wrapper")
    ?.querySelector(".TextInput-action");
  if (!slot) {
    injectButtonBelow(titleInput);
    return;
  }
  const btn = createSuggestButton("pr-emoji-icon-btn", "🎯", findCreateTitleInput);
  btn.dataset.icon = "";
  slot.appendChild(btn);
}

function injectButtonBelow(titleInput) {
  const container = document.createElement("div");
  container.id = "pr-emoji-container";
  container.className = "pr-emoji-container";
  container.appendChild(
    createSuggestButton("pr-emoji-btn", SUGGEST_LABEL, findTitleInput)
  );

  const anchor =
    titleInput.closest("text-expander, react-partial") ||
    titleInput.closest("form") ||
    titleInput.parentElement;
  anchor.insertAdjacentElement("afterend", container);
}

function injectWand(pencil) {
  const wrap = document.createElement("span");
  wrap.id = "pr-emoji-wand-wrap";
  wrap.className = "pr-emoji-wand-wrap";

  const btn = document.createElement("button");
  btn.id = "pr-emoji-wand";
  btn.type = "button";
  btn.className = "pr-emoji-wand";
  btn.textContent = "🪄";
  btn.dataset.label = "🪄";
  btn.dataset.icon = "";
  btn.title = WAND_TOOLTIP;
  btn.setAttribute("aria-label", WAND_TOOLTIP);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onWandClick();
  });

  wrap.appendChild(btn);
  pencil.parentElement.appendChild(wrap);
}

// Where the popup for a given trigger button should be attached
function popupHostFor(btn) {
  if (btn.classList.contains("pr-emoji-icon-btn")) {
    // Inside the input's action slot: anchor to the field, right-aligned
    return { host: btn.closest("text-expander") || btn.closest(".TextInput-wrapper").parentElement, alignRight: true };
  }
  return { host: btn.parentElement, alignRight: btn.id === "pr-emoji-wand" };
}

// --- Auto-suggest on create page ---

function setupAutoSuggest(titleInput) {
  // Debounce: wait 1.5s after the user stops typing, then auto-suggest once
  const fire = () => {
    if (titleInput.value.trim().length > 5 && !autoSuggestFired && titleInput.isConnected) {
      autoSuggestFired = true;
      onSuggestClick(titleInput);
    }
  };

  titleInput.addEventListener("input", () => {
    if (autoSuggestFired) return;
    clearTimeout(autoSuggestTimer);
    autoSuggestTimer = setTimeout(fire, 1500);
  });

  // Also fire if the input already has a value (GitHub pre-fills from branch name)
  if (titleInput.value.trim().length > 5) {
    autoSuggestTimer = setTimeout(fire, 1500);
  }
}

// --- Gather context ---

function gatherCommits() {
  const commits = [];

  // Create page: commit list in the compare view
  document
    .querySelectorAll(".commit-message code a, .js-commits-list-item .Link--primary")
    .forEach((el) => {
      const text = el.textContent.trim();
      if (text) commits.push(text);
    });

  // View page: commit links in the (React) timeline or commits tab
  if (commits.length === 0) {
    document
      .querySelectorAll(
        'a.markdown-title[href*="/commits/"], a[data-testid="commit-row-title"], .TimelineItem .commit-message a'
      )
      .forEach((el) => {
        const text = el.textContent.trim();
        if (text) commits.push(text);
      });
  }

  // The same commit can be linked more than once (e.g. force-push events)
  return [...new Set(commits)];
}

function gatherBody() {
  const bodyEl =
    document.querySelector('textarea[name="pull_request[body]"]') ||
    document.querySelector(".comment-body");
  return bodyEl?.value ?? bodyEl?.textContent?.trim() ?? "";
}

function requestSuggestions(title) {
  return browser.runtime.sendMessage({
    type: "suggest-emojis",
    title,
    body: gatherBody(),
    commits: gatherCommits(),
  });
}

// --- Suggest flow (create page + edit mode) ---

// React tracks input values itself; use the native setter so the following
// input event is seen as a real change.
function setInputValue(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    value
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyEmoji(titleInput, emoji) {
  setInputValue(titleInput, emoji + " " + stripLeadingEmoji(titleInput.value));
  titleInput.focus();
}

function setBusy(btn, busy) {
  const thinking = "icon" in btn.dataset ? "⏳" : "⏳ Thinking...";
  btn.textContent = busy ? thinking : btn.dataset.label;
  btn.disabled = busy;
}

function flash(btn, text) {
  btn.textContent = text;
  setTimeout(() => {
    if (btn.isConnected && !btn.disabled) btn.textContent = btn.dataset.label;
  }, 1500);
}

async function onSuggestClick(titleInput, event = null) {
  const btn = document.getElementById("pr-emoji-btn");
  if (!btn || btn.disabled) return;

  document.getElementById("pr-emoji-popup")?.remove();
  setBusy(btn, true);
  const response = await requestSuggestions(titleInput.value);
  setBusy(btn, false);

  if (response.error) {
    showError(btn, response.error);
    return;
  }

  // Surprise me: auto-apply the top suggestion (triggered by ctrl/shift+click)
  const surpriseMe = event && (event.ctrlKey || event.shiftKey);
  if (surpriseMe && response.suggestions.length > 0) {
    const { emoji } = response.suggestions[0];
    applyEmoji(titleInput, emoji);
    flash(btn, "icon" in btn.dataset ? emoji : emoji + " Applied!");
    return;
  }

  showPopup(btn, response.suggestions, (emoji) => {
    // The input may have been re-rendered while the popup was open
    applyEmoji(findTitleInput() || titleInput, emoji);
  });
}

// --- Magic wand flow (PR view mode) ---

function waitFor(fn, timeout = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const result = fn();
      if (result || Date.now() - start > timeout) resolve(result || null);
      else setTimeout(tick, 50);
    };
    tick();
  });
}

function currentViewTitle(pencil) {
  // The heading sits next to the pencil's wrapper; fall back to document.title
  const heading = pencil.closest("div")?.querySelector("h1 .markdown-title");
  if (heading) return heading.textContent.trim();
  return document.title.split(" by ")[0].split(" · ")[0];
}

async function onWandClick() {
  const wand = document.getElementById("pr-emoji-wand");
  const pencil = findEditTitleButton();
  if (!wand || !pencil || wand.disabled || wandInProgress) return;

  document.getElementById("pr-emoji-popup")?.remove();
  setBusy(wand, true);
  const response = await requestSuggestions(currentViewTitle(pencil));

  if (response.error || !response.suggestions?.length) {
    setBusy(wand, false);
    showError(wand, response.error || "No suggestions returned");
    return;
  }

  const pick =
    response.suggestions[Math.floor(Math.random() * response.suggestions.length)];

  wandInProgress = true;
  try {
    const error = await saveTitleWithEmoji(pick.emoji);
    if (error) {
      const w = document.getElementById("pr-emoji-wand");
      if (w) {
        setBusy(w, false);
        showError(w, error);
      }
    }
  } finally {
    wandInProgress = false;
    tryInject();
  }
}

// Drive GitHub's own edit form: open it, set the title, press Save.
async function saveTitleWithEmoji(emoji) {
  findEditTitleButton()?.click();
  const input = await waitFor(findEditTitleInput);
  if (!input) return "Couldn't open the title editor";

  setInputValue(input, emoji + " " + stripLeadingEmoji(input.value));

  const form = input.closest("form");
  // The Save button's text includes a keybinding hint ("Save( enter⏎)")
  const save = await waitFor(() => {
    const buttons = [...(form?.querySelectorAll("button") ?? [])].filter(
      (b) => !b.disabled
    );
    return (
      buttons.find((b) => b.textContent.trim().startsWith("Save")) ||
      buttons.find((b) => b.dataset.variant === "primary")
    );
  });
  if (!save) return "Couldn't find the Save button";
  save.click();

  // Success = the editor closes again
  const closed = await waitFor(() => !findEditTitleInput(), 5000);
  return closed ? null : "Saving the title didn't finish — check the editor";
}

// --- Popup ---

function attachPopup(btn, popup) {
  document.getElementById("pr-emoji-popup")?.remove();
  const { host, alignRight } = popupHostFor(btn);
  if (alignRight) popup.classList.add("pr-emoji-popup--right");
  host.appendChild(popup);

  const onClickOutside = (e) => {
    if (!popup.contains(e.target) && e.target !== btn) {
      popup.remove();
      document.removeEventListener("click", onClickOutside);
    }
  };
  setTimeout(() => document.addEventListener("click", onClickOutside), 0);
}

function newPopup() {
  const popup = document.createElement("div");
  popup.id = "pr-emoji-popup";
  popup.className = "pr-emoji-popup";
  return popup;
}

function showError(btn, message) {
  const popup = newPopup();
  const msg = document.createElement("div");
  msg.className = "pr-emoji-error";
  msg.textContent = message;
  popup.appendChild(msg);
  attachPopup(btn, popup);
}

function showPopup(btn, suggestions, onPick) {
  const popup = newPopup();

  const heading = document.createElement("div");
  heading.className = "pr-emoji-heading";
  heading.textContent = "Pick an emoji for your PR:";
  popup.appendChild(heading);

  suggestions.forEach(({ emoji, reason }) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "pr-emoji-option";

    const emojiSpan = document.createElement("span");
    emojiSpan.className = "pr-emoji-option-emoji";
    emojiSpan.textContent = emoji;

    const reasonSpan = document.createElement("span");
    reasonSpan.className = "pr-emoji-option-reason";
    reasonSpan.textContent = reason;

    option.appendChild(emojiSpan);
    option.appendChild(reasonSpan);

    option.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      popup.remove();
      onPick(emoji);
    });

    popup.appendChild(option);
  });

  attachPopup(btn, popup);
}

function stripLeadingEmoji(text) {
  return text.replace(/^(\p{Emoji_Presentation}|\p{Emoji}️)\s*/u, "");
}

init();
