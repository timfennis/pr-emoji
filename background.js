const FREE_MODEL = "openrouter/free";
const HAIKU_MODEL = "anthropic/claude-haiku-5.5";

function resolveModel({ modelChoice, customModel }) {
  if (modelChoice === "haiku") return HAIKU_MODEL;
  if (modelChoice === "custom" && customModel?.trim()) return customModel.trim();
  return FREE_MODEL;
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "suggest-emojis") {
    suggestEmojis(request.title, request.body, request.commits).then(
      sendResponse
    );
    return true;
  }
});

// Keyboard shortcut — forward to the active tab's content script
browser.commands.onCommand.addListener((command) => {
  if (command === "suggest-emoji") {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, { type: "trigger-suggest" });
      }
    });
  }
});

// Builds the prompt from only the PR info the user allows to be sent.
function buildPrompt(title, body, commits, { sendBody, sendCommits }) {
  const included = ["title"];
  let context = `PR Title: ${title}`;

  if (sendBody) {
    included.push("description");
    context += `\nPR Description: ${body || "(no description)"}`;
  }
  if (sendCommits && commits?.length > 0) {
    included.push("commit messages");
    context += `\n\nCommit messages:\n${commits.map((c) => `- ${c}`).join("\n")}`;
  }

  const given =
    included.length === 1
      ? included[0]
      : included.slice(0, -1).join(", ") + " and " + included.at(-1);

  return `You are an emoji suggestion engine for GitHub pull requests. Given the PR ${given}, suggest 5 emojis that best represent the changes. Return ONLY a JSON array of objects with "emoji" and "reason" fields. Keep reasons under 8 words.

${context}

Example response:
[{"emoji": "🐛", "reason": "Bug fix"}, {"emoji": "✨", "reason": "New feature"}]`;
}

async function suggestEmojis(title, body, commits) {
  const settings = await loadSettings();
  const apiKey = settings.apiKey;
  const model = resolveModel(settings);

  if (!apiKey) {
    return {
      error: "No API key set. Right-click the extension and go to Options.",
    };
  }

  const prompt = buildPrompt(title, body, commits, settings);

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { error: `API error ${res.status}: ${err}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    const match = content.match(/\[[\s\S]*?\]/);
    if (!match) {
      return { error: "Could not parse AI response" };
    }

    const suggestions = JSON.parse(match[0]);
    return { suggestions };
  } catch (e) {
    return { error: e.message };
  }
}
