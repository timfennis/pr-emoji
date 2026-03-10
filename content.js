let autoSuggestFired = false;
let autoSuggestTimer = null;

function init() {
  const observer = new MutationObserver(() => tryInject());
  observer.observe(document.body, { childList: true, subtree: true });
  tryInject();

  // Listen for keyboard shortcut from background script
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "trigger-suggest") {
      const input = findTitleInput();
      if (input) onSuggestClick(input);
    }
  });
}

function findEditTitleInput() {
  // Look for a label with "Edit Pull Request Title" and find its associated input
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    if (label.textContent.trim() === "Edit Pull Request Title") {
      const forId = label.getAttribute("for");
      if (forId) return document.getElementById(forId);
      // Fallback: find input as sibling
      return label.parentElement?.querySelector('input[type="text"]');
    }
  }
  return null;
}

function findTitleInput() {
  // Create page
  const createInput = document.querySelector(
    'input[name="pull_request[title]"]'
  );
  if (createInput) return createInput;

  // Edit mode
  return findEditTitleInput();
}

function tryInject() {
  const existing = document.getElementById("pr-emoji-container");

  // Case 1: PR creation page
  const createInput = document.querySelector(
    'input[name="pull_request[title]"]'
  );
  if (createInput) {
    if (!existing) {
      injectButton(createInput);
      setupAutoSuggest(createInput);
    }
    return;
  }

  // Case 2: PR edit mode
  const editInput = findEditTitleInput();
  const isEditMode = !!editInput;

  if (isEditMode && !existing) {
    injectButton(editInput);
  } else if (!isEditMode && existing) {
    existing.remove();
    // Reset auto-suggest so it can fire again on next edit
    autoSuggestFired = false;
  }
}

// --- Auto-suggest on create page ---

function setupAutoSuggest(titleInput) {
  // Debounce: wait 1.5s after the user stops typing, then auto-suggest once
  const handler = () => {
    if (autoSuggestFired) return;
    clearTimeout(autoSuggestTimer);
    autoSuggestTimer = setTimeout(() => {
      if (titleInput.value.trim().length > 5 && !autoSuggestFired) {
        autoSuggestFired = true;
        onSuggestClick(titleInput);
      }
    }, 1500);
  };

  titleInput.addEventListener("input", handler);

  // Also fire if the input already has a value (GitHub pre-fills from branch name)
  if (titleInput.value.trim().length > 5) {
    autoSuggestTimer = setTimeout(() => {
      if (!autoSuggestFired) {
        autoSuggestFired = true;
        onSuggestClick(titleInput);
      }
    }, 1500);
  }
}

// --- Button injection ---

function injectButton(titleInput) {
  const container = document.createElement("div");
  container.id = "pr-emoji-container";
  container.className = "pr-emoji-container";

  const btn = document.createElement("button");
  btn.id = "pr-emoji-btn";
  btn.type = "button";
  btn.textContent = "🎯 Suggest Emoji";
  btn.className = "pr-emoji-btn";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSuggestClick(titleInput);
  });

  container.appendChild(btn);

  const createAnchor = titleInput.closest("text-expander, react-partial");
  if (createAnchor) {
    createAnchor.insertAdjacentElement("afterend", container);
    return;
  }

  const form = titleInput.closest("form");
  if (form) {
    form.insertAdjacentElement("afterend", container);
    return;
  }

  titleInput.parentElement.insertAdjacentElement("afterend", container);
}

// --- Gather commit messages ---

function gatherCommits() {
  const commits = [];

  // Create page: commit list in the compare view
  document
    .querySelectorAll(".commit-message code a, .js-commits-list-item .Link--primary")
    .forEach((el) => {
      const text = el.textContent.trim();
      if (text) commits.push(text);
    });

  // View page: commits tab may have been loaded, or commit summaries in timeline
  if (commits.length === 0) {
    document
      .querySelectorAll('a[data-testid="commit-row-title"], .TimelineItem .commit-message a')
      .forEach((el) => {
        const text = el.textContent.trim();
        if (text) commits.push(text);
      });
  }

  return commits;
}

// --- Suggest flow ---

function applyEmoji(titleInput, emoji) {
  const currentTitle = stripLeadingEmoji(titleInput.value);
  titleInput.value = emoji + " " + currentTitle;
  titleInput.dispatchEvent(new Event("input", { bubbles: true }));
  titleInput.focus();
}

async function onSuggestClick(titleInput) {
  const btn = document.getElementById("pr-emoji-btn");
  if (!btn) return;

  const existingPopup = document.getElementById("pr-emoji-popup");
  if (existingPopup) existingPopup.remove();

  btn.textContent = "⏳ Thinking...";
  btn.disabled = true;

  const title = titleInput.value;
  const bodyEl =
    document.querySelector('textarea[name="pull_request[body]"]') ||
    document.querySelector(".comment-body");
  const body = bodyEl?.value ?? bodyEl?.textContent?.trim() ?? "";
  const commits = gatherCommits();

  const response = await browser.runtime.sendMessage({
    type: "suggest-emojis",
    title,
    body,
    commits,
  });

  btn.textContent = "🎯 Suggest Emoji";
  btn.disabled = false;

  if (response.error) {
    showPopup([{ emoji: "⚠️", reason: response.error }], null, true);
    return;
  }

  // Surprise me: auto-apply the top suggestion
  const { surpriseMe } = await browser.storage.sync.get("surpriseMe");
  if (surpriseMe && response.suggestions.length > 0) {
    applyEmoji(titleInput, response.suggestions[0].emoji);
    // Brief flash on the button to confirm it worked
    btn.textContent = response.suggestions[0].emoji + " Applied!";
    setTimeout(() => {
      btn.textContent = "🎯 Suggest Emoji";
    }, 1500);
    return;
  }

  showPopup(response.suggestions, (emoji) => {
    applyEmoji(titleInput, emoji);
  });
}

// --- Popup ---

function showPopup(suggestions, onPick, isError = false) {
  const existing = document.getElementById("pr-emoji-popup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.id = "pr-emoji-popup";
  popup.className = "pr-emoji-popup";

  if (isError) {
    const msg = document.createElement("div");
    msg.className = "pr-emoji-error";
    msg.textContent = suggestions[0].reason;
    popup.appendChild(msg);
  } else {
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
  }

  const onClickOutside = (e) => {
    if (!popup.contains(e.target) && e.target.id !== "pr-emoji-btn") {
      popup.remove();
      document.removeEventListener("click", onClickOutside);
    }
  };
  setTimeout(() => document.addEventListener("click", onClickOutside), 0);

  const container = document.getElementById("pr-emoji-container");
  container.appendChild(popup);
}

function stripLeadingEmoji(text) {
  return text.replace(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u, "");
}

init();
