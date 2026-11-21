// One-time YouTube OAuth helper. Opens Google's consent screen in the default
// browser, catches the loopback redirect, and prints a refresh token you paste
// into Settings → YouTube. No tokens are written to disk here.
//
//   npm run youtube:auth -- --client-id ID --client-secret SECRET

import http from 'node:http';
import { exec } from 'node:child_process';
import { URL } from 'node:url';

const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return process.env[name.toUpperCase().replace(/-/g, '_')] || '';
  return process.argv[index + 1] || '';
}

const clientId = arg('client-id');
const clientSecret = arg('client-secret');

if (!clientId || !clientSecret) {
  console.error('Missing credentials.');
  console.error('Run: npm run youtube:auth -- --client-id YOUR_ID --client-secret YOUR_SECRET');
  process.exit(1);
}

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? `cmd /c start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, (error) => {
    if (error) console.log('\nOpen this URL yourself:\n\n' + url + '\n');
  });
}

function page(message, detail = '') {
  return `<!doctype html><meta charset="utf-8"><title>Clipmax Pro · YouTube</title>
  <body style="font-family:Segoe UI,system-ui,sans-serif;background:#12070c;color:#f5eee3;display:grid;place-items:center;height:100vh;margin:0">
  <div style="max-width:540px;padding:32px;border:1px solid rgba(245,238,227,.18);border-radius:14px;background:#1c0a12">
  <h1 style="font-size:22px;margin:0 0 10px">${message}</h1>
  <p style="color:#cbbcaf;line-height:1.6;margin:0">${detail}</p>
  </div></body>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  if (url.searchParams.get('error')) {
    res.writeHead(400, { 'Content-Type': 'text/html' }).end(
      page('Google refused the request.', String(url.searchParams.get('error')))
    );
    server.close();
    process.exitCode = 1;
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' }).end(page('No code arrived.', 'Close this tab and try again.'));
    return;
  }

  try {
    const redirectUri = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.refresh_token) {
      throw new Error(data.error_description || data.error || 'Google did not return a refresh token.');
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(
      page('YouTube is connected.', 'Close this tab, copy the refresh token printed in the terminal, and paste it into Settings → YouTube.')
    );
    console.log('\nRefresh token (paste it into Settings → YouTube):\n');
    console.log(data.refresh_token);
    console.log('\nKeep it private. If you revoke access, generate a new one.');
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/html' }).end(page('The token exchange failed.', String(error.message)));
    console.error('\nToken exchange failed:', error.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(0, '127.0.0.1', () => {
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', redirectUri);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', SCOPE);
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  console.log('Opening Google consent in your browser…');
  console.log(`If it does not open, visit:\n\n${auth}\n`);
  openBrowser(auth.toString());
});
