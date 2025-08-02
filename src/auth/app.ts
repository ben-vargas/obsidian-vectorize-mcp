import { Hono } from "hono";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Env } from '../types';
import { checkRateLimit } from '../utils/auth';

export type Bindings = Env & {
  OAUTH_PROVIDER: OAuthHelpers;
};

const app = new Hono<{
  Bindings: Bindings;
}>();

// Simple home page
app.get("/", async (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Obsidian Vectorize MCP</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 600px;
          margin: 100px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          text-align: center;
        }
        h1 {
          color: #333;
          margin-bottom: 20px;
        }
        p {
          color: #666;
          line-height: 1.6;
        }
        .status {
          margin-top: 20px;
          padding: 15px;
          background: #f0f8ff;
          border-radius: 4px;
          color: #0066cc;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔍 Obsidian Vectorize MCP</h1>
        <p>AI-powered search for your Obsidian knowledge base</p>
        <div class="status">
          ✅ Service is running
        </div>
      </div>
    </body>
    </html>
  `);
});

// Authorization page
app.get("/authorize", async (c) => {
  const clientIp = c.req.header('CF-Connecting-IP') || 'unknown';
  
  // Rate limiting
  const allowed = await checkRateLimit(clientIp, 'auth_attempt', c.env);
  if (!allowed) {
    return c.html('Too many authorization attempts. Please try again later.', 429);
  }

  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authorize - Obsidian Vectorize MCP</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 400px;
          margin: 100px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 24px;
        }
        .client-info {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 4px;
          margin: 20px 0;
          font-size: 14px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          color: #666;
          font-weight: 500;
        }
        input[type="password"] {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-bottom: 20px;
          box-sizing: border-box;
          font-size: 16px;
        }
        button {
          width: 100%;
          padding: 12px;
          background: #0070f3;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          font-weight: 500;
        }
        button:hover {
          background: #0051cc;
        }
        .scopes {
          margin: 20px 0;
          padding: 15px;
          background: #f0f8ff;
          border-radius: 4px;
          font-size: 14px;
        }
        .scopes h3 {
          margin: 0 0 10px 0;
          font-size: 16px;
          color: #0066cc;
        }
        .scopes ul {
          margin: 0;
          padding-left: 20px;
        }
        .scopes li {
          margin: 5px 0;
          color: #555;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔐 Authorization Required</h1>
        
        <div class="client-info">
          <strong>Application:</strong> ${oauthReqInfo.clientId}<br>
          <strong>Redirect:</strong> ${oauthReqInfo.redirectUri}
        </div>

        <div class="scopes">
          <h3>This app is requesting access to:</h3>
          <ul>
            <li>Search your Obsidian notes</li>
            <li>Read note contents and metadata</li>
            <li>List and filter your notes</li>
            <li>Analyze connections between notes</li>
          </ul>
        </div>

        <form method="post" action="/approve">
          <input type="hidden" name="oauth_req_info" value="${encodeURIComponent(JSON.stringify(oauthReqInfo))}" />
          
          <label for="password">Enter MCP Password:</label>
          <input type="password" id="password" name="password" required autofocus />
          
          <button type="submit">Authorize Access</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Handle authorization approval
app.post("/approve", async (c) => {
  const formData = await c.req.parseBody();
  const password = formData.password as string;
  const oauthReqInfoStr = formData.oauth_req_info as string;

  if (!oauthReqInfoStr) {
    return c.html('Invalid request', 400);
  }

  const oauthReqInfo = JSON.parse(decodeURIComponent(oauthReqInfoStr));

  // Validate password
  if (password !== c.env.MCP_PASSWORD) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Failed</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 400px;
            margin: 100px auto;
            padding: 20px;
            text-align: center;
          }
          .error {
            background: #fee;
            padding: 20px;
            border-radius: 8px;
            color: #c00;
          }
          a {
            color: #0070f3;
            text-decoration: none;
            margin-top: 20px;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>❌ Authorization Failed</h2>
          <p>Invalid password. Please try again.</p>
          <a href="/authorize">← Back</a>
        </div>
      </body>
      </html>
    `, 401);
  }

  // Complete the authorization
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: "user",
    metadata: {
      label: "Authorized User",
    },
    scope: oauthReqInfo.scope,
    props: {
      authorized: true,
    },
  });

  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authorization Successful</title>
      <meta http-equiv="refresh" content="3;url=${redirectTo}">
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 400px;
          margin: 100px auto;
          padding: 20px;
          text-align: center;
        }
        .success {
          background: #efe;
          padding: 20px;
          border-radius: 8px;
          color: #0a0;
        }
      </style>
    </head>
    <body>
      <div class="success">
        <h2>✅ Authorization Successful</h2>
        <p>Redirecting you back to the application...</p>
      </div>
    </body>
    </html>
  `);
});

export default app;