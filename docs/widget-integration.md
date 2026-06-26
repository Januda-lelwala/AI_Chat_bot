# Website Widget Integration Spec

This document explains how to build and install a website chat widget that works with this backend. It is intended for website builders and app developers embedding the bot into public or logged-in pages.

The widget has four responsibilities:

1. Render the chat UI.
2. Collect safe live page context from the current page.
3. Send chat requests to `POST /api/chat`.
4. Execute safe frontend actions returned by the backend.

## Backend Requirements

Create or update a bot config so these tools are enabled when page guidance is needed:

```json
{
  "enabledTools": [
    "search_knowledge",
    "open_url",
    "scroll_to_section",
    "highlight_element",
    "prefill_form",
    "collect_lead",
    "human_handoff"
  ]
}
```

Use `highlight_element` and `prefill_form` only when the widget sends stable selectors in `pageContext`.

## Website Markup Requirements

Add stable `data-ai` attributes to important controls. These are the safest selectors for bot guidance.

```html
<button data-ai="update-payment">Update payment method</button>

<a data-ai="pricing-link" href="/pricing">Pricing</a>

<form data-ai="lead-form">
  <label>
    Email
    <input name="email" autocomplete="email" />
  </label>
  <button type="submit">Send</button>
</form>
```

Selector rules:

- Prefer `data-ai="descriptive-name"` for buttons, links, forms, sections, and important inputs.
- Use stable names that do not change between deploys.
- Do not put secrets, user IDs, tokens, or private record IDs in `data-ai` values.
- Avoid relying on generated CSS classes.
- The backend will only allow `highlight_element` and `prefill_form` for selectors supplied by the widget in `pageContext`.

## Embed Snippet

Install the widget with a script tag. Host `widget.js` on your CDN or serve it from the same app that owns the website.

```html
<script
  src="https://cdn.example.com/chat-widget.js"
  data-bot-id="replace-with-bot-id"
  data-api-url="https://api.example.com"
  async>
</script>
```

Required attributes:

- `data-bot-id`: Bot ID from this backend.
- `data-api-url`: API base URL, for example `https://api.example.com`.

Recommended optional attributes:

- `data-widget-title`: Header text for the chat panel.
- `data-primary-color`: Brand color for the widget.
- `data-context-mode`: `visible-only` by default.

## Chat Request Contract

The widget sends one request per user message:

```http
POST /api/chat
content-type: application/json
```

```json
{
  "botId": "bot-id",
  "conversationId": "optional-existing-conversation-id",
  "message": "How do I update my payment method?",
  "pageUrl": "https://app.example.com/settings/billing",
  "pageContext": {
    "title": "Billing Settings",
    "visibleText": "Current plan Pro. Update payment method. Download invoices.",
    "headings": ["Billing Settings", "Payment method"],
    "buttons": [
      {
        "label": "Update payment method",
        "selector": "[data-ai='update-payment']"
      }
    ],
    "links": [
      {
        "label": "Plans",
        "url": "https://app.example.com/settings/plans",
        "selector": "[data-ai='plans-link']"
      }
    ],
    "forms": [
      {
        "label": "Payment method form",
        "selector": "[data-ai='payment-form']",
        "fields": ["card number", "expiry date", "billing ZIP"]
      }
    ]
  },
  "confirmed": false
}
```

Field limits enforced by the backend:

| Field | Limit |
| --- | --- |
| `pageContext.title` | 200 characters |
| `pageContext.visibleText` | 12,000 characters |
| `pageContext.headings` | 80 items, 200 characters each |
| `pageContext.buttons` | 100 items |
| `pageContext.links` | 100 items |
| `pageContext.forms` | 30 items |
| `selector` | 300 characters |
| `form.fields` | 40 items, 120 characters each |

## Chat Response Contract

The backend returns:

```json
{
  "conversationId": "conversation-id",
  "message": "Yes. Use the Update payment method button on this page.",
  "actions": [
    {
      "type": "highlight_element",
      "selector": "[data-ai='update-payment']"
    }
  ]
}
```

Supported frontend actions:

| Action | Purpose |
| --- | --- |
| `open_url` | Navigate to an approved same-origin URL. |
| `scroll_to` | Scroll to a selector. |
| `highlight_element` | Highlight a selector supplied in live page context. |
| `prefill_form` | Fill values into a form selector supplied in live page context. |

The widget must ignore unknown action types.

## Minimal Widget Implementation

This is a reference implementation. Production widgets should replace inline styles with real CSS and add loading/error states.

```js
(function () {
  const script = document.currentScript;
  const botId = script.dataset.botId;
  const apiUrl = script.dataset.apiUrl;
  const title = script.dataset.widgetTitle || "Chat";
  let conversationId = null;

  if (!botId || !apiUrl) {
    console.error("Chat widget requires data-bot-id and data-api-url.");
    return;
  }

  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.right = "20px";
  root.style.bottom = "20px";
  root.style.width = "360px";
  root.style.maxWidth = "calc(100vw - 40px)";
  root.style.zIndex = "2147483647";
  root.innerHTML = `
    <div style="border:1px solid #d1d5db;background:#fff;font-family:system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.18)">
      <div style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-weight:600">${escapeHtml(title)}</div>
      <div data-chat-messages style="height:360px;overflow:auto;padding:12px"></div>
      <form data-chat-form style="display:flex;border-top:1px solid #e5e7eb">
        <input data-chat-input style="flex:1;padding:10px;border:0;min-width:0" placeholder="Ask a question" autocomplete="off" />
        <button style="padding:10px 14px;border:0;background:#111827;color:#fff">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(root);

  const messages = root.querySelector("[data-chat-messages]");
  const form = root.querySelector("[data-chat-form]");
  const input = root.querySelector("[data-chat-input]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    appendMessage("You", text);

    try {
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          botId,
          conversationId,
          message: text,
          pageUrl: window.location.href,
          pageContext: collectPageContext(),
          confirmed: false
        })
      });

      if (!response.ok) {
        throw new Error(`Chat request failed with ${response.status}`);
      }

      const data = await response.json();
      conversationId = data.conversationId;
      appendMessage("Bot", data.message || "I could not respond.");
      executeActions(data.actions || []);
    } catch (error) {
      console.error(error);
      appendMessage("Bot", "Sorry, I could not reach the chat service.");
    }
  });

  function appendMessage(author, text) {
    const item = document.createElement("div");
    item.style.marginBottom = "10px";
    item.textContent = `${author}: ${text}`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }
})();
```

## Page Context Collector

The widget should collect visible, non-sensitive context only.

```js
function collectPageContext() {
  return {
    title: document.title.slice(0, 200),
    visibleText: getVisibleText(),
    headings: getTexts("h1, h2, h3").slice(0, 80),
    buttons: getElements("button, [role='button'], input[type='button'], input[type='submit']").slice(0, 100),
    links: getLinks().slice(0, 100),
    forms: getForms().slice(0, 30)
  };
}

function getVisibleText() {
  return redactSensitiveText(document.body.innerText)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

function getTexts(selector) {
  return [...document.querySelectorAll(selector)]
    .filter(isVisible)
    .map((element) => cleanLabel(element.innerText))
    .filter(Boolean);
}

function getElements(selector) {
  return [...document.querySelectorAll(selector)]
    .filter(isVisible)
    .map((element) => ({
      label: getLabel(element),
      selector: getSafeSelector(element)
    }))
    .filter((item) => item.label && item.selector);
}

function getLinks() {
  return [...document.querySelectorAll("a[href]")]
    .filter(isVisible)
    .map((element) => ({
      label: getLabel(element),
      url: element.href,
      selector: getSafeSelector(element)
    }))
    .filter((item) => item.label && item.url && item.selector);
}

function getForms() {
  return [...document.querySelectorAll("form")]
    .filter(isVisible)
    .map((form) => ({
      label: getLabel(form) || "Form",
      selector: getSafeSelector(form),
      fields: [...form.querySelectorAll("input, textarea, select")]
        .filter((field) => !shouldSkipField(field))
        .map(getLabel)
        .filter(Boolean)
        .slice(0, 40)
    }))
    .filter((item) => item.selector);
}

function getSafeSelector(element) {
  if (element.dataset.ai) {
    return `[data-ai='${CSS.escape(element.dataset.ai)}']`;
  }

  if (element.id && !looksGenerated(element.id)) {
    return `#${CSS.escape(element.id)}`;
  }

  return null;
}

function getLabel(element) {
  const explicitLabel = findExplicitLabel(element);
  const value =
    explicitLabel ||
    element.getAttribute("aria-label") ||
    element.getAttribute("placeholder") ||
    element.getAttribute("value") ||
    element.innerText ||
    element.name ||
    "";

  return cleanLabel(value);
}

function findExplicitLabel(element) {
  if (!element.id) return "";
  const label = document.querySelector(`label[for='${CSS.escape(element.id)}']`);
  return label ? label.innerText : "";
}

function cleanLabel(value) {
  return redactSensitiveText(String(value)).replace(/\s+/g, " ").trim().slice(0, 200);
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function shouldSkipField(field) {
  const type = String(field.getAttribute("type") || "").toLowerCase();
  return ["password", "hidden", "file"].includes(type);
}

function looksGenerated(value) {
  return value.length > 40 || /[0-9a-f]{12,}/i.test(value);
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/\b\d{13,19}\b/g, "[redacted-card]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted-ssn]");
}
```

## Action Executor

The widget must execute only the supported safe actions.

```js
function executeActions(actions) {
  for (const action of actions) {
    if (action.type === "open_url") {
      window.open(action.url, action.target || "_self");
      continue;
    }

    if (action.type === "scroll_to") {
      const element = document.querySelector(action.selector);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      continue;
    }

    if (action.type === "highlight_element") {
      highlightElement(action.selector);
      continue;
    }

    if (action.type === "prefill_form") {
      prefillForm(action.selector, action.values || {});
    }
  }
}

function highlightElement(selector) {
  const element = document.querySelector(selector);
  if (!element) return;

  element.scrollIntoView({ behavior: "smooth", block: "center" });

  const previousOutline = element.style.outline;
  const previousOutlineOffset = element.style.outlineOffset;
  element.style.outline = "3px solid #2563eb";
  element.style.outlineOffset = "3px";

  window.setTimeout(() => {
    element.style.outline = previousOutline;
    element.style.outlineOffset = previousOutlineOffset;
  }, 3000);
}

function prefillForm(selector, values) {
  const form = document.querySelector(selector);
  if (!form) return;

  for (const [name, value] of Object.entries(values)) {
    const field = form.querySelector(`[name='${CSS.escape(name)}']`);
    if (!field || shouldSkipField(field)) continue;

    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

## Privacy And Security Rules

The widget must not send:

- Passwords.
- Cookies.
- Auth tokens.
- CSRF tokens.
- Hidden input values.
- Raw HTML.
- API keys.
- Full payment card numbers.
- One-time codes.
- Private record IDs unless the user workflow explicitly needs them.

Recommended safeguards:

- Collect only visible page text.
- Skip `input[type='password']`, `input[type='hidden']`, and `input[type='file']`.
- Redact obvious payment and government ID patterns.
- Keep `pageContext` request-scoped. Do not store it in localStorage.
- Do not send page context until the user opens the widget or sends a message.
- Ask for explicit user confirmation before submitting forms or making destructive changes.

## Logged-In Pages

For logged-in pages, the widget can describe what the current user can see because it runs in the user's browser session. The backend should not crawl logged-in pages with user credentials.

Correct pattern:

1. User opens a logged-in page.
2. Widget collects visible page context.
3. Widget sends `pageContext` with the user's message.
4. Backend uses it only for the current chat response.
5. Widget executes returned safe actions.

Do not vectorize logged-in user page context into shared business knowledge.

## CORS And Deployment

If the widget is hosted on a different domain than the API, configure API CORS to allow the website origin.

Recommended production setup:

- Serve `chat-widget.js` from a CDN.
- Version the script URL, for example `/chat-widget.v1.js`.
- Use HTTPS for both website and API.
- Restrict API CORS to approved website origins.
- Monitor `/api/chat` errors separately from website errors.

## Website Builder Checklist

Before launch:

- Bot config includes `highlight_element` and `prefill_form` if guided actions are needed.
- Important controls have stable `data-ai` attributes.
- Widget sends `pageUrl` and bounded `pageContext`.
- Widget ignores unknown action types.
- Widget skips password, hidden, file, token, and payment fields.
- Widget does not send raw HTML.
- API CORS allows the website origin.
- Logged-in page context is not persisted as shared knowledge.
- Form submission or destructive actions require confirmation.
