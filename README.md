<div align="center">

# DiscordMessageSender

**A browser-based tool for composing and sending Discord webhook messages, with a live Discord-style preview.**

[![HTML](https://img.shields.io/badge/html-5-E34F26?style=flat-square&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/javascript-ES2020-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Overview

DiscordMessageSender is a single-page static web app (`index.html`) that lets you compose Discord webhook messages entirely in the browser. It supports embed messages, regular text messages, or a dual mode combining both. A live Discord-style preview renders on the right as you type, so you can see exactly how the message will appear before sending.

The tool sends directly to the Discord API from the browser using the Fetch API. No server, no backend, no account required.

Live at: [discordmessagesender.drew-gnr.xyz](https://discordmessagesender.drew-gnr.xyz)

---

## Message Types

| Mode | What it sends |
|---|---|
| **Embed** | A Discord embed with all embed fields only |
| **Regular** | A plain text content message only |
| **Dual** | Both an embed and a plain text content message in the same webhook payload |

---

## Embed Fields

| Field | Discord limit | Notes |
|---|---|---|
| Title | - | |
| Description | 4096 chars | Live character counter, warns at 90%, blocks at 100% |
| Colour | - | Hex input with colour picker. Synced bidirectionally. Validates on send |
| Author name | - | |
| Author icon URL | - | |
| Thumbnail URL | - | |
| Image URL | - | |
| Footer text | - | |
| Footer icon URL | - | |
| Timestamp | - | `datetime-local` input, converted to ISO 8601 before sending |
| Embed fields | Up to 25 | Dynamically added. Each field has name (max 256 chars), value (max 1024 chars), and inline toggle. Counters warn at 90% |
| **Total embed chars** | **6000** | Aggregate counter across title + description + author + footer + all field names and values. Warns at 5400, blocks send at 6000 |

---

## Sending and Editing

- **Send**: Submits a `POST` request to the webhook URL with the composed payload.
- **Edit**: Toggle the `Edit` button to reveal a Message Link field. Paste a Discord message URL (`https://discord.com/channels/...`). The send button switches to `Edit Message` and the request becomes a `PATCH` to `{webhook}/messages/{messageId}`. The message must belong to the same webhook.
- A confirmation dialog appears before every send or edit.
- A toast notification appears at the bottom of the screen after a successful send.

---

## Webhook URL

- The webhook URL is validated against the pattern `https://discord.com/api/webhooks/{id}/{token}` before sending.
- An opt-in `Remember webhook URL on this browser` checkbox saves the URL to `localStorage`. The `Clear saved` button removes it.
- The URL is stored in plaintext in your browser profile. A warning is shown below the checkbox.

---

## Webhook Identity

- **Webhook Name**: Overrides the webhook's display name for this message.
- **Webhook Avatar URL**: Overrides the webhook's avatar for this message.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Missing or invalid webhook URL | Inline error shown, send blocked |
| Invalid hex colour | Inline error shown, send blocked |
| Embed total over 6000 chars | Alert shown with exact count, send blocked |
| HTTP 404 on edit | Explains the message must belong to the same webhook |
| HTTP 401 / 403 | Reports invalid or expired webhook URL |
| Other HTTP errors | Shows Discord's error message and status code |

---

## File Structure

```
index.html          - Entire app (HTML, CSS, JS)
Assets/
  style.css         - Page styles
  message_link.js   - extractMessageId() helper for parsing Discord message links
  icon.png          - Favicon
```

---

## Usage

Open `index.html` in any modern browser, or visit the live site. No installation or dependencies required.

---

## License

MIT - made by [Drew](https://github.com/drew-codes-things)
