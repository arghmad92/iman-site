/**
 * Cloudflare Pages Function — /oauth/callback
 *
 * Exchanges the GitHub OAuth code for an access token and returns it
 * to the Decap CMS popup via postMessage.
 * Requires env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return errorPage('No authorization code was returned from GitHub.');
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return errorPage('GitHub OAuth app credentials are not configured.');
  }

  // Exchange code for access token
  let tokenData;
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    tokenData = await res.json();
  } catch {
    return errorPage('Failed to reach GitHub to exchange the code for a token.');
  }

  if (tokenData.error) {
    return errorPage(`GitHub error: ${tokenData.error_description ?? tokenData.error}`);
  }

  const token = tokenData.access_token;

  // Pass token back to the Decap CMS popup via postMessage
  const message = JSON.stringify({
    token,
    provider: 'github',
  });

  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Authorizing…</title>
    <style>
      body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef0f3; color: #4a2830; }
      p { font-size: 1rem; }
    </style>
  </head>
  <body>
    <p>Authorizing… this window will close automatically.</p>
    <script>
      (function () {
        const message = ${JSON.stringify(`authorization:github:success:${message}`)};
        function notify(e) {
          window.opener.postMessage(message, e.origin);
        }
        window.addEventListener('message', notify, false);
        window.opener.postMessage('authorizing:github', '*');
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function errorPage(msg) {
  return new Response(
    `<!DOCTYPE html><html><head><title>Auth Error</title></head><body><p style="font-family:sans-serif;color:#c9848c;padding:2rem">${msg}</p></body></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
