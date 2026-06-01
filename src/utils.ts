import { gmail_v1 } from 'googleapis';

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  isRead: boolean;
  labels: string[];
  category: string;
}

/**
 * Formats a Date object to YYYY/MM/DD string format.
 */
export function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

/**
 * Translates human-readable date ranges into Gmail query filters.
 */
export function buildDateFilter(range: string): string {
  const now = new Date();
  switch (range) {
    case 'today':
      return `after:${formatDate(now)}`;
    case 'last_7_days': {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return `after:${formatDate(d)}`;
    }
    case 'last_30_days': {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return `after:${formatDate(d)}`;
    }
    case 'this_month': {
      return `after:${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/01`;
    }
    default:
      return '';
  }
}

/**
 * Retrieves the value of a specific header from a Gmail message payload.
 */
export function getHeader(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers || [];
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

/**
 * Formats raw Date string header to ISO style YYYY-MM-DD HH:MM.
 */
function formatDateString(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${yyyy}-${mm}-${dd} ${time}`;
  } catch {
    return dateStr;
  }
}

/**
 * Heuristics-based email classifier sorting emails into one of 7 categories.
 */
export function classifyEmail(message: GmailMessage): string {
  const labelIds = message.labelIds || [];
  const snippet = (message.snippet || '').toLowerCase();
  const from = getHeader(message, 'From').toLowerCase();
  const subject = getHeader(message, 'Subject').toLowerCase();

  // 1. Spam/Junk
  if (labelIds.includes('SPAM') || labelIds.includes('TRASH')) {
    return 'Spam/Junk';
  }

  // 2. Social
  if (labelIds.includes('CATEGORY_SOCIAL')) {
    return 'Social';
  }
  const socialDomains = [
    'linkedin.com', 'facebook.com', 'facebookmail.com', 'twitter.com', 'x.com',
    'instagram.com', 'pinterest.com', 'reddit.com', 'redditmail.com', 'tumblr.com',
    'medium.com', 'meetup.com', 'youtube.com', 'discord.com', 'nextdoor.com'
  ];
  if (socialDomains.some(domain => from.includes(domain))) {
    return 'Social';
  }

  // 3. Finance (alerts, invoices, bills, transactions)
  const financeKeywords = [
    'invoice', 'receipt', 'payment', 'bill', 'bank', 'statement', 'transaction',
    'wire transfer', 'charge', 'purchase', 'order confirmation', 'checkout',
    'stripe', 'paypal', 'transferwise', 'wise.com', 'credit card', 'debit card'
  ];
  if (financeKeywords.some(keyword => subject.includes(keyword))) {
    return 'Finance';
  }
  const financeDomains = [
    'stripe.com', 'paypal.com', 'wise.com', 'chase.com', 'wellsfargo.com',
    'bankofamerica.com', 'amex.com', 'americanexpress.com', 'capitalone.com',
    'fidelity.com', 'schwab.com', 'billing@', 'invoice@', 'finance@'
  ];
  if (financeDomains.some(domain => from.includes(domain))) {
    return 'Finance';
  }

  // 4. Work (known corporate collaboration domains or sync keywords)
  const workDomains = [
    'slack.com', 'jira.com', 'github.com', 'gitlab.com', 'atlassian.com',
    'trello.com', 'zoom.us', 'teams.microsoft.com', 'asana.com', 'notion.so',
    'salesforce.com', 'hubspot.com', 'basecamp.com'
  ];
  if (workDomains.some(domain => from.includes(domain))) {
    return 'Work';
  }
  const workKeywords = [
    'meeting', 'scrum', 'agenda', 'standup', 'deadline', 'sprint', 'project',
    'sync', 'work', 'huddle', 'deliverable', 'milestone', 'proposal', 'report',
    'action required', 'asap', 'task', 'collaborate', 'board', 'backlog'
  ];
  if (workKeywords.some(keyword => subject.includes(keyword))) {
    return 'Work';
  }

  // 5. Promotions
  if (labelIds.includes('CATEGORY_PROMOTIONS')) {
    return 'Promotions';
  }
  const promoKeywords = [
    'sale', 'discount', 'off', 'promo', 'coupon', 'deal', 'newsletter',
    'subscribe', 'offer', 'marketing', 'exclusive', 'clearance', 'special offer'
  ];
  if (promoKeywords.some(keyword => subject.includes(keyword))) {
    return 'Promotions';
  }
  const promoSenders = ['marketing@', 'newsletter@', 'promo@', 'offers@', 'deals@'];
  if (promoSenders.some(sender => from.includes(sender))) {
    return 'Promotions';
  }

  // 6. Updates
  if (labelIds.includes('CATEGORY_UPDATES')) {
    return 'Updates';
  }
  const updateKeywords = [
    'notification', 'alert', 'shipping', 'shipped', 'delivered', 'tracking',
    'update', 'verification', 'security', 'reset', 'password', 'code', 'otp',
    'signed in', 'login', 'activation', 'subscription'
  ];
  if (updateKeywords.some(keyword => subject.includes(keyword) || snippet.includes(keyword))) {
    return 'Updates';
  }

  // 7. Primary (Fallback)
  return 'Primary';
}

/**
 * Renders a list of emails into a clean, markdown table representation.
 */
export function formatEmailList(emails: GmailMessage[]): string {
  if (emails.length === 0) {
    return '*No emails found in this category.*';
  }

  let markdown = '| Date | From | Subject | Snippet |\n';
  markdown += '| :--- | :--- | :--- | :--- |\n';

  for (const email of emails) {
    const date = getHeader(email, 'Date') || 'N/A';
    const dateStr = formatDateString(date);
    const from = getHeader(email, 'From') || 'N/A';
    const subject = getHeader(email, 'Subject') || 'No Subject';
    const snippet = email.snippet || '';

    // Escape pipe characters to avoid malforming markdown tables
    const escapedSubject = subject.replace(/\|/g, '\\|').trim();
    const escapedSnippet = snippet.replace(/\|/g, '\\|').trim();
    const escapedFrom = from.replace(/\|/g, '\\|').trim();

    markdown += `| ${dateStr} | ${escapedFrom} | ${escapedSubject} | ${escapedSnippet} |\n`;
  }

  return markdown;
}

/**
 * Iteratively retrieves message summaries from Gmail using page tokens.
 */
export async function paginateGmailFetch(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number
): Promise<Array<{ id: string; threadId: string }>> {
  const messages: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined = undefined;

  while (messages.length < maxResults) {
    const limit = Math.min(100, maxResults - messages.length);
    const response: any = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: limit,
      pageToken,
    });

    const list = response.data.messages || [];
    messages.push(...(list as Array<{ id: string; threadId: string }>));

    pageToken = response.data.nextPageToken || undefined;
    if (!pageToken) {
      break;
    }
  }

  return messages.slice(0, maxResults);
}

/**
 * Concurrently fetches details of Gmail messages in configurable chunks to respect API limits.
 */
export async function fetchEmailDetails(
  gmail: gmail_v1.Gmail,
  messageSummaries: Array<{ id: string }>,
  concurrencyLimit = 10
): Promise<GmailMessage[]> {
  const details: GmailMessage[] = [];

  for (let i = 0; i < messageSummaries.length; i += concurrencyLimit) {
    const chunk = messageSummaries.slice(i, i + concurrencyLimit);
    const promises = chunk.map(async (msg) => {
      try {
        const response = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        return response.data as GmailMessage;
      } catch (error) {
        console.error(`Failed to fetch message details for ID ${msg.id}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const res of results) {
      if (res !== null) {
        details.push(res);
      }
    }
  }

  return details;
}
