# Gmail Category Summary MCP Server

[![MCPize](https://mcpize.com/badge/@zicogenoxy/mail-summary-tracker)](https://mcpize.com/mcp/mail-summary-tracker)

A production-ready Model Context Protocol (MCP) server written in TypeScript that connects to Gmail using OAuth2, retrieves emails within specified date ranges, and classifies them into seven categories to provide rich, structured category-wise summaries.

**Zero-Friction Authentication**: Built-in default GCP Desktop Application credentials allow users to connect their Gmail account in **1 click** without setting developer client secrets or creating a Google Cloud Project!

## Features

- **Categorized Summarization**: Groups and summarizes emails into:
  - **Promotions** – newsletters, discounts, marketing
  - **Social** – notifications from LinkedIn, Facebook, Twitter, Reddit, etc.
  - **Finance** – bank alerts, invoices, payment receipts
  - **Work** – emails from work domains or with work-related keywords
  - **Updates** – app notifications, shipping, tracking, subscriptions
  - **Spam/Junk** – low-priority or suspicious emails (based on label/folder)
  - **Primary** – personal or important emails (fallback)
- **High Performance**: Fetches Gmail metadata in efficient concurrent batches to prevent API rate limits.
- **Stdio Transport**: Seamlessly works with Claude Desktop, n8n, and other MCP clients.
- **Clean Markdown & JSON**: Returns both human-readable markdown tables and structured JSON data.

---

## 🚀 Quick Start (Zero-Friction Setup)

### 1. Install Dependencies
Clone the repository, enter the directory, and install:
```bash
npm install
```

### 2. Connect Your Gmail (1-Click Browser Authentication)
Simply run the interactive local login script:
```bash
npm run login
```
This script will:
- Start a temporary local callback server on port `3000`.
- **Automatically open your browser** to Google's secure authorization page.
- Once you click **Authorize**, it exchanges the code for a refresh token and **automatically writes it to your local `.env` file** as `GMAIL_REFRESH_TOKEN`!
- Stops the local server immediately.

---

## 🛠️ Custom GCP Project Configuration (Optional)

If you prefer to use your own Google Cloud Console project and custom OAuth Credentials rather than our built-in default Desktop Client, you can easily override them by adding your own keys to the `.env` file:

```ini
GMAIL_CLIENT_ID=your_custom_client_id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_custom_client_secret
GMAIL_REFRESH_TOKEN=your_custom_refresh_token
```

To get your own keys:
1. Enable the **Gmail API** in your Google Cloud Console.
2. Configure your **OAuth Consent Screen** (adding your email under Test Users).
3. Create an **OAuth Client ID** configured as a **Web application** (using `https://developers.google.com/oauthplayground` as redirect URI) or a **Desktop application**.
4. Generate your refresh token via the Google OAuth Playground and save it to `.env`.

---

## 📦 Build & Run

Compile TypeScript:
```bash
npm run build
```

Run in development mode (starts via tsx):
```bash
npm run dev
```

---

## 🖥️ Register with Claude Desktop

To register this server with your Claude Desktop client, edit your `claude_desktop_config.json` (located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "gmail-summarizer": {
      "command": "node",
      "args": ["f:/MCP/Mail tracker/mail-tracker/dist/index.js"],
      "env": {
        "GMAIL_REFRESH_TOKEN": "your_gmail_refresh_token_here"
      }
    }
  }
}
```

> [!NOTE]
> Make sure to replace `f:/MCP/Mail tracker/mail-tracker/dist/index.js` with the actual absolute path to your compiled `dist/index.js` file, and `your_gmail_refresh_token_here` with the token written to your `.env` file. If you are using custom credentials, you must also add `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` under `env` in this configuration.

---

## 💬 Example Prompts

Once the MCP server is configured and connected, you can ask Claude prompts like:

- *"Summarize my emails from last week by category."*
- *"Check for any urgent emails in my Work or Finance categories from today."*
- *"Get a count of how many unread emails I have per category."*
- *"Show me my last 10 promotions and newsletters."*
- *"What updates did I get in my inbox this month?"*

---

## MCP Tools Reference

### 1. `gmail_summary_by_category`
- **Description**: Fetch and group emails within a date range into categories, producing sender, subject, date, and 1-line snippets.
- **Inputs**:
  - `date_range` (enum: `"today" | "last_7_days" | "last_30_days" | "this_month"`)
  - `categories` (optional array of strings: `["Work", "Social", ...]`)
  - `max_per_category` (optional number, default: `10`)

### 2. `gmail_category_counts`
- **Description**: Get a fast overview count of emails per category in a specific date range.
- **Inputs**:
  - `date_range` (enum: `"today" | "last_7_days" | "last_30_days" | "this_month"`)

### 3. `gmail_emails_in_category`
- **Description**: Retrieve full list of emails within a specific category and date range, including from, subject, date, snippet, isRead, and labels.
- **Inputs**:
  - `category` (enum: `"Promotions" | "Social" | "Finance" | "Work" | "Updates" | "Spam/Junk" | "Primary"`)
  - `date_range` (enum: `"today" | "last_7_days" | "last_30_days" | "this_month"`)
  - `limit` (optional number, default: `20`)

### 4. `gmail_unread_summary`
- **Description**: Fetch all unread emails, group them by category, and return counts plus top 5 subject lines per category.
- **Inputs**:
  - `categories` (optional array of strings: `["Work", "Social", ...]`)

---

## License

MIT