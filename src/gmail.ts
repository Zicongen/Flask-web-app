import { google, gmail_v1 } from 'googleapis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Default embedded GCP Desktop OAuth2 credentials for zero-friction setup
export const DEFAULT_CLIENT_ID = 'your_gmail_client_id.apps.googleusercontent.com';
export const DEFAULT_CLIENT_SECRET = 'your_gmail_client_secret';

/**
 * Creates and returns an authenticated Gmail API client.
 * Uses GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.
 * Falls back to embedded desktop client credentials if secrets are omitted.
 */
export function getGmailClient(): gmail_v1.Gmail {
  const clientId = process.env.GMAIL_CLIENT_ID || DEFAULT_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error(
      'Missing GMAIL_REFRESH_TOKEN in environment variables. ' +
      'Please run "npm run login" first to authorize your Gmail account automatically.'
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}
