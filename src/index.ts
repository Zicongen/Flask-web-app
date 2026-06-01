import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { getGmailClient } from './gmail.js';
import {
  buildDateFilter,
  classifyEmail,
  formatEmailList,
  paginateGmailFetch,
  fetchEmailDetails,
  getHeader,
  GmailMessage,
} from './utils.js';

/**
 * Global centralized error handler to catch expired tokens, rate limits, and network errors.
 */
function handleGmailError(error: any) {
  const errMsg = error.message || String(error);
  const errCode = error.code || (error.response && error.response.status);

  let userFriendlyMsg = `Gmail API Error: ${errMsg}`;
  if (errCode === 401 || errMsg.includes('invalid_grant') || errMsg.includes('credentials')) {
    userFriendlyMsg =
      'Authentication Error: The provided OAuth2 credentials or refresh token are invalid or expired. ' +
      'Please re-authenticate and update your environment variables (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).';
  } else if (errCode === 429 || errMsg.includes('rateLimitExceeded') || errMsg.includes('429')) {
    userFriendlyMsg = 'Rate Limit Error: Gmail API rate limit exceeded. Please try your request again in a few seconds.';
  }

  return {
    content: [{ type: 'text' as const, text: userFriendlyMsg }],
    isError: true,
  };
}

/**
 * Helper function to register all 4 Gmail summary tools on a given McpServer instance.
 */
function registerToolsOnServer(server: McpServer): void {
  // ----------------------------------------------------------------------------
  // Tool 1: Summary by Category
  // ----------------------------------------------------------------------------
  server.registerTool(
    'gmail_summary_by_category',
    {
      title: 'Gmail Summary by Category',
      description: 'Fetch and group emails within a date range into categories, producing sender, subject, date, and 1-line snippets, with a markdown summary.',
      inputSchema: {
        date_range: z
          .enum(['today', 'last_7_days', 'last_30_days', 'this_month'])
          .describe('The date range to retrieve emails from.'),
        categories: z
          .array(z.string())
          .optional()
          .describe('Optional list of categories to filter by (e.g., ["Work", "Finance"]).'),
        max_per_category: z
          .number()
          .optional()
          .default(10)
          .describe('Maximum number of emails to return per category.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      } as any,
    },
    async ({ date_range, categories, max_per_category }) => {
      try {
        const gmail = getGmailClient();
        const query = buildDateFilter(date_range);

        const summaries = await paginateGmailFetch(gmail, query, 150);
        if (summaries.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No emails found in this date range.' }],
            structuredContent: { categories: {} },
          };
        }

        const emails = await fetchEmailDetails(gmail, summaries);

        const grouped: Record<string, GmailMessage[]> = {
          'Promotions': [],
          'Social': [],
          'Finance': [],
          'Work': [],
          'Updates': [],
          'Spam/Junk': [],
          'Primary': [],
        };

        for (const email of emails) {
          const cat = classifyEmail(email);
          grouped[cat].push(email);
        }

        const filteredGrouped: Record<string, any[]> = {};
        const targetCategories = categories && categories.length > 0 ? categories : Object.keys(grouped);

        let markdown = `# Gmail Email Summary (${date_range})\n\n`;

        for (const cat of targetCategories) {
          if (!grouped[cat]) continue;
          const list = grouped[cat].slice(0, max_per_category);
          filteredGrouped[cat] = list.map((email) => ({
            id: email.id,
            from: getHeader(email, 'From'),
            subject: getHeader(email, 'Subject'),
            date: getHeader(email, 'Date'),
            snippet: email.snippet || '',
          }));

          markdown += `## ${cat} (${grouped[cat].length} total)\n`;
          markdown += formatEmailList(list) + '\n\n';
        }

        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: { categories: filteredGrouped },
        };
      } catch (error: any) {
        return handleGmailError(error);
      }
    }
  );

  // ----------------------------------------------------------------------------
  // Tool 2: Category Counts
  // ----------------------------------------------------------------------------
  server.registerTool(
    'gmail_category_counts',
    {
      title: 'Gmail Category Counts',
      description: 'Get a fast overview count of emails per category in a specific date range.',
      inputSchema: {
        date_range: z
          .enum(['today', 'last_7_days', 'last_30_days', 'this_month'])
          .describe('The date range to retrieve counts for.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      } as any,
    },
    async ({ date_range }) => {
      try {
        const gmail = getGmailClient();
        const query = buildDateFilter(date_range);

        const summaries = await paginateGmailFetch(gmail, query, 200);
        const counts: Record<string, number> = {
          'Promotions': 0,
          'Social': 0,
          'Finance': 0,
          'Work': 0,
          'Updates': 0,
          'Spam/Junk': 0,
          'Primary': 0,
        };

        if (summaries.length > 0) {
          const emails = await fetchEmailDetails(gmail, summaries);
          for (const email of emails) {
            const cat = classifyEmail(email);
            counts[cat] = (counts[cat] || 0) + 1;
          }
        }

        let markdown = `# Gmail Category Counts (${date_range})\n\n`;
        markdown += '| Category | Count |\n';
        markdown += '| :--- | :--- |\n';
        for (const [cat, count] of Object.entries(counts)) {
          markdown += `| **${cat}** | ${count} |\n`;
        }

        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: counts,
        };
      } catch (error: any) {
        return handleGmailError(error);
      }
    }
  );

  // ----------------------------------------------------------------------------
  // Tool 3: Emails in Category
  // ----------------------------------------------------------------------------
  server.registerTool(
    'gmail_emails_in_category',
    {
      title: 'Gmail Emails in Category',
      description: 'Retrieve full list of emails within a specific category and date range, including from, subject, date, snippet, isRead, and labels.',
      inputSchema: {
        category: z
          .enum(['Promotions', 'Social', 'Finance', 'Work', 'Updates', 'Spam/Junk', 'Primary'])
          .describe('The category to retrieve emails from.'),
        date_range: z
          .enum(['today', 'last_7_days', 'last_30_days', 'this_month'])
          .describe('The date range.'),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe('Maximum number of emails to return.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      } as any,
    },
    async ({ category, date_range, limit }) => {
      try {
        const gmail = getGmailClient();
        const query = buildDateFilter(date_range);

        const summaries = await paginateGmailFetch(gmail, query, 200);
        if (summaries.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No emails found in the category "${category}" for this date range.` }],
            structuredContent: { emails: [] },
          };
        }

        const emails = await fetchEmailDetails(gmail, summaries);
        const filtered = emails.filter((email) => classifyEmail(email) === category);
        const sliced = filtered.slice(0, limit);

        if (sliced.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No emails found in the category "${category}" for this date range.` }],
            structuredContent: { emails: [] },
          };
        }

        const structuredResult = sliced.map((email) => {
          const labelIds = email.labelIds || [];
          return {
            id: email.id,
            from: getHeader(email, 'From'),
            subject: getHeader(email, 'Subject'),
            date: getHeader(email, 'Date'),
            snippet: email.snippet || '',
            isRead: !labelIds.includes('UNREAD'),
            labels: labelIds,
          };
        });

        let markdown = `# Emails in category "${category}" (${date_range})\n\n`;
        markdown += formatEmailList(sliced);

        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: { emails: structuredResult },
        };
      } catch (error: any) {
        return handleGmailError(error);
      }
    }
  );

  // ----------------------------------------------------------------------------
  // Tool 4: Unread Summary
  // ----------------------------------------------------------------------------
  server.registerTool(
    'gmail_unread_summary',
    {
      title: 'Gmail Unread Summary',
      description: 'Fetch all unread emails, group them by category, and return counts plus top 5 subject lines per category.',
      inputSchema: {
        categories: z
          .array(z.string())
          .optional()
          .describe('Optional list of categories to filter unread emails by.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      } as any,
    },
    async ({ categories }) => {
      try {
        const gmail = getGmailClient();
        const query = 'is:unread';

        const summaries = await paginateGmailFetch(gmail, query, 150);
        if (summaries.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No unread emails found.' }],
            structuredContent: { counts: {}, details: {} },
          };
        }

        const emails = await fetchEmailDetails(gmail, summaries);

        const grouped: Record<string, GmailMessage[]> = {
          'Promotions': [],
          'Social': [],
          'Finance': [],
          'Work': [],
          'Updates': [],
          'Spam/Junk': [],
          'Primary': [],
        };

        for (const email of emails) {
          const cat = classifyEmail(email);
          grouped[cat].push(email);
        }

        const targetCategories = categories && categories.length > 0 ? categories : Object.keys(grouped);

        const counts: Record<string, number> = {};
        const topSubjects: Record<string, string[]> = {};
        let markdown = '# Unread Email Summary\n\n';

        for (const cat of targetCategories) {
          if (!grouped[cat]) continue;
          const totalCount = grouped[cat].length;
          counts[cat] = totalCount;

          const top5 = grouped[cat].slice(0, 5);
          topSubjects[cat] = top5.map((email) => getHeader(email, 'Subject') || 'No Subject');

          markdown += `## ${cat} (${totalCount} unread)\n`;
          if (totalCount === 0) {
            markdown += '*No unread emails in this category.*\n\n';
          } else {
            markdown += '### Top 5 Unread Subjects:\n';
            top5.forEach((email, idx) => {
              const subject = getHeader(email, 'Subject') || 'No Subject';
              const from = getHeader(email, 'From') || 'Unknown Sender';
              markdown += `${idx + 1}. **${subject}** (from: ${from})\n`;
            });
            markdown += '\n';
          }
        }

        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: {
            counts,
            details: topSubjects,
          },
        };
      } catch (error: any) {
        return handleGmailError(error);
      }
    }
  );
}

/**
 * Main function to start the MCP Server dynamically detecting Stdio vs HTTP transport.
 */
export async function startServer() {
  const isHttp = !!process.env.PORT || process.argv.includes('--http');

  if (isHttp) {
    // ------------------------------------------------------------------------
    // Hosted HTTP (Streamable HTTP / MCPize / Cloud Run) Transport Setup
    // ------------------------------------------------------------------------
    const app = express();
    app.use(express.json());

    // Health check endpoint (required for Cloud Run / MCPize startup probe)
    app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'healthy' });
    });

    // MCP Endpoint with fresh server instance per connection request
    app.post('/mcp', async (req: Request, res: Response) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      const requestServer = new McpServer({
        name: 'gmail-category-summarizer',
        version: '1.0.0',
      });

      registerToolsOnServer(requestServer);

      res.on('close', () => {
        transport.close();
      });

      await requestServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    const port = parseInt(process.env.PORT || '8080');
    app.listen(port, () => {
      console.error(`Gmail MCP Server running on HTTP port ${port}`);
    });
  } else {
    // ------------------------------------------------------------------------
    // Local Stdio (Claude Desktop / CLI) Transport Setup
    // ------------------------------------------------------------------------
    const localServer = new McpServer({
      name: 'gmail-category-summarizer',
      version: '1.0.0',
    });

    registerToolsOnServer(localServer);

    try {
      const transport = new StdioServerTransport();
      await localServer.connect(transport);
      console.error('Gmail Category Summarizer MCP Server started on stdio');
    } catch (error) {
      console.error('Failed to start stdio MCP server:', error);
      process.exit(1);
    }
  }
}

// Automatically start the server if run directly
const isMain = process.argv[1] && (
  process.argv[1].endsWith('index.ts') ||
  process.argv[1].endsWith('index.js')
);

if (isMain) {
  startServer();
}
