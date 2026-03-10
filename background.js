const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

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

async function suggestEmojis(title, body, commits) {
  const settings = await browser.storage.sync.get(["apiKey", "model"]);
  const apiKey = settings.apiKey;
  const model = settings.model || DEFAULT_MODEL;

  if (!apiKey) {
    return {
      error: "No API key set. Right-click the extension and go to Options.",
    };
  }

  let commitSection = "";
  if (commits && commits.length > 0) {
    commitSection = `\n\nCommit messages:\n${commits.map((c) => `- ${c}`).join("\n")}`;
  }

  const prompt = `You are an emoji suggestion engine for GitHub pull requests. Given the PR title, description, and commit messages, suggest 5 emojis that best represent the changes. Return ONLY a JSON array of objects with "emoji" and "reason" fields. Keep reasons under 8 words.

PR Title: ${title}
PR Description: ${body || "(no description)"}${commitSection}

Example response:
[{"emoji": "🐛", "reason": "Bug fix"}, {"emoji": "✨", "reason": "New feature"}]`;

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
