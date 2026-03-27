/**
 * Cloudflare Pages Function — /oauth
 *
 * Initiates GitHub OAuth flow for Decap CMS.
 * Requires env vars: GITHUB_CLIENT_ID
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');

  if (provider !== 'github') {
    return new Response('Provider not supported. Only "github" is allowed.', { status: 400 });
  }

  if (!env.GITHUB_CLIENT_ID) {
    return new Response('GITHUB_CLIENT_ID is not configured.', { status: 500 });
  }

  const scope = url.searchParams.get('scope') ?? 'repo,user';
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('scope', scope);
  githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}/oauth/callback`);

  return Response.redirect(githubAuthUrl.toString(), 302);
}
