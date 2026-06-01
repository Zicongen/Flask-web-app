import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { google } from 'googleapis';
import { DEFAULT_CLIENT_ID, DEFAULT_CLIENT_SECRET } from './gmail.js';

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

function openBrowser(targetUrl: string): void {
  let command = '';
  if (process.platform === 'darwin') {
    command = `open "${targetUrl}"`;
  } else if (process.platform === 'win32') {
    command = `start "" "${targetUrl}"`;
  } else {
    command = `xdg-open "${targetUrl}"`;
  }
  
  exec(command, (err) => {
    if (err) {
      console.error('\n⚠️ Failed to open browser automatically. Please copy and paste the link below into your browser:');
    }
  });
}

async function runLogin(): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID || DEFAULT_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET || DEFAULT_CLIENT_SECRET,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  });

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = url.parse(req.url || '', true);
      
      if (parsedUrl.pathname === '/oauth2callback') {
        const code = parsedUrl.query.code as string;
        
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization Failed</h1><p>No authorization code returned.</p>');
          return;
        }

        // Exchange authorization code for access/refresh tokens
        const { tokens } = await oauth2Client.getToken(code);
        const refreshToken = tokens.refresh_token;

        if (!refreshToken) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h1>Setup Error</h1><p>Could not retrieve a refresh token. Did you already authorize this application?</p>');
          console.error('\n❌ Could not retrieve a refresh token. Make sure you clear permissions or force consent.');
          process.exit(1);
        }

        // Save refresh token to .env file
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
        }

        const tokenLine = `GMAIL_REFRESH_TOKEN=${refreshToken}`;
        if (envContent.includes('GMAIL_REFRESH_TOKEN=')) {
          envContent = envContent.replace(/GMAIL_REFRESH_TOKEN=.*/, tokenLine);
        } else {
          envContent += `\n${tokenLine}\n`;
        }
        
        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

        // Send confirmation response to user's browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #f4f7f6; color: #333;">
              <div style="display: inline-block; padding: 30px; border-radius: 8px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <h1 style="color: #2e7d32;">&#10003; Authentication Successful!</h1>
                <p style="font-size: 16px;">The GMAIL_REFRESH_TOKEN was successfully written to your local <strong>.env</strong> file.</p>
                <p style="font-size: 14px; color: #666;">You can now close this browser window and return to your terminal.</p>
              </div>
            </body>
          </html>
        `);

        console.log('\n========================================');
        console.log('✓ Authentication Successful!');
        console.log('✓ GMAIL_REFRESH_TOKEN has been saved to your local .env file.');
        console.log('========================================\n');
        
        // Shut down redirect server and exit CLI process cleanly
        res.on('finish', () => {
          server.close(() => {
            process.exit(0);
          });
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    } catch (error) {
      console.error('\n❌ Error during authorization callback:', error);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>Server Error</h1><p>An internal error occurred during authentication.</p>');
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log('\n==================================================================');
    console.log(`🤖 Starting Gmail Local OAuth Callback Server on port ${PORT}...`);
    console.log('🔗 Automatically opening browser to Google OAuth consent page...');
    console.log('==================================================================\n');
    console.log(`Authorize URL: ${authUrl}\n`);
    
    openBrowser(authUrl);
  });
}

runLogin().catch((err) => {
  console.error('\n❌ Login process failed:', err);
  process.exit(1);
});
