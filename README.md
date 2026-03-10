# PR Emoji

A Firefox extension that uses AI to suggest emojis for your GitHub pull request titles.

Requires Firefox 143+.

## Features

- **Auto-suggest on PR creation** - automatically suggests emojis 1.5s after you stop typing the title (or immediately if GitHub pre-fills it from the branch name)
- **PR edit page** - click the pencil to edit a PR title and a "Suggest Emoji" button appears
- **Surprise me mode** - auto-picks the top suggestion without showing the popup. Combined with auto-suggest, emojis just appear as you create PRs
- **Commit-aware** - feeds commit messages into the AI prompt for better suggestions
- **Keyboard shortcut** - `Ctrl+Shift+E` to trigger suggestions from anywhere on the page
- **Dynamic model picker** - fetches available cheap models from OpenRouter so the list is always up to date
- Pick from 5 AI-suggested emojis with short explanations
- Replaces any existing leading emoji if you re-run it

## Installation

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select any file in the `pr-emoji` folder (e.g. `manifest.json`)
5. Right-click the extension icon in the toolbar > **Manage Extension** > **Preferences**
6. Paste your OpenRouter API key and click **Save**

### Permanent installation

To install permanently (persists across restarts), package as an `.xpi`:

```sh
cd pr-emoji
zip -r ../pr-emoji.xpi . -x '*.git*' 'demo.html'
```

Then drag `pr-emoji.xpi` into Firefox, or go to `about:addons` > gear icon > **Install Add-on From File**.

> Note: unsigned extensions only work in Firefox Developer Edition or Nightly with `xpinstall.signatures.required` set to `false` in `about:config`.

## Configuration

Open the extension preferences to configure:

- **API Key** - your OpenRouter API key
- **AI Model** - fetched live from OpenRouter, filtered to cheap models only. Recommended picks from Google, OpenAI, and Anthropic are shown at the top
- **Surprise me mode** - skip the popup and auto-apply the top emoji suggestion

The keyboard shortcut can be customized in `about:addons` > gear icon > **Manage Extension Shortcuts**.

## Disclaimer

This extension was vibe-coded with [Claude Code](https://claude.ai/claude-code). The human provided direction, feedback, and a lot of "it's broken, try again" energy. The AI wrote the code.
