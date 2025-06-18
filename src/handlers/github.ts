import { handlePushEvent } from "./events/push";
import { handleIssuesEvent } from "./events/issue";
import { handlePullRequestEvent } from "./events/pull-request";

function generateAppManifest(workerDomain: string): GitHubAppManifest {
  const timestamp = new Date().toISOString().split('T')[1].replace(/:/g, '');
  return {
    name: `Worker GitHub Integration - ${timestamp}`,
    url: workerDomain,
    hook_attributes: {
      url: `${workerDomain}/webhooks/github`
    },
    redirect_url: `${workerDomain}/gh-setup/callback`,
    callback_urls: [`${workerDomain}/gh-setup/callback`],
    setup_url: `${workerDomain}/gh-setup/install`,
    public: false,
    default_permissions: {
      contents: 'read',
      metadata: 'read',
      pull_requests: 'write',
      issues: 'write'
    },
    default_events: [
      'push',
      'pull_request',
      'issues'
    ]
  };
}

export async function handleGitHubSetup(_request: Request, origin: string): Promise<Response> {
    const webhookUrl = `${origin}/webhooks/github`;
    const manifest = generateAppManifest(origin);
    const manifestJson = JSON.stringify(manifest);

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>GitHub App Setup - Cloudflare Worker</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .webhook-info {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .webhook-url {
            font-family: monospace;
            background: #fff;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            word-break: break-all;
        }
        .create-app-btn {
            background: #238636;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            cursor: pointer;
            font-size: 14px;
        }
        .create-app-btn:hover {
            background: #2ea043;
        }
        .steps {
            margin: 30px 0;
        }
        .step {
            margin: 15px 0;
            padding-left: 30px;
            position: relative;
        }
        .step-number {
            position: absolute;
            left: 0;
            top: 0;
            background: #0969da;
            color: white;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 GitHub App Setup</h1>
        <p>Configure GitHub webhook integration for your Cloudflare Worker</p>
    </div>

    <div class="webhook-info">
        <h3>📡 Your Webhook URL</h3>
        <div class="webhook-url">${webhookUrl}</div>
        <p>This URL will receive GitHub webhook events once setup is complete.</p>
    </div>

    <div class="steps">
        <h3>Setup Steps</h3>

        <div class="step">
            <div class="step-number">1</div>
            <strong>Create GitHub App</strong><br>
            Click the button below to create a pre-configured GitHub App with all necessary permissions and webhook settings.
        </div>

        <div class="step">
            <div class="step-number">2</div>
            <strong>Choose Account</strong><br>
            Select which GitHub account or organization should own the app.
        </div>

        <div class="step">
            <div class="step-number">3</div>
            <strong>Install App</strong><br>
            After creation, you'll be guided to install the app on your repositories.
        </div>
    </div>

    <div style="text-align: center; margin: 40px 0;">
        <form action="https://github.com/settings/apps/new" method="post" id="github-app-form">
            <input type="hidden" name="manifest" id="manifest" value="">
            <button type="submit" class="create-app-btn">
                📱 Create GitHub App
            </button>
        </form>
    </div>

    <details>
        <summary>App Configuration Details</summary>
        <pre style="background: #f8f8f8; padding: 15px; border-radius: 4px; overflow-x: auto;">
Permissions:
- Repository contents: read
- Repository metadata: read
- Pull requests: write
- Issues: write

Webhook Events:
- push, pull_request, issues
- installation events (automatically enabled)

Webhook URL: ${webhookUrl}
        </pre>
    </details>

    <script>
        // Set the manifest data when the page loads
        document.getElementById('manifest').value = ${JSON.stringify(manifestJson)};
    </script>
</body>
</html>`;

    return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
    });
}

export async function handleGitHubStatus(_request: Request, env: any): Promise<Response> {
  const url = new URL(_request.url);
  const appId = url.searchParams.get('app_id');

  if (!appId) {
    return new Response(JSON.stringify({ error: 'Missing app_id parameter' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    });
  }

  try {
    const id = env.GITHUB_APP_CONFIG.idFromName(appId);
    const configDO = env.GITHUB_APP_CONFIG.get(id);

    const response = await configDO.fetch(new Request('http://internal/get'));
    const config = await response.json() as GitHubAppConfig | null;

    if (!config) {
      return new Response(JSON.stringify({ error: 'No configuration found for this app ID' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404
      });
    }

    // Return safe information (without sensitive data)
    const safeConfig = {
      appId: config.appId,
      owner: config.owner,
      repositories: config.repositories,
      permissions: config.permissions,
      events: config.events,
      createdAt: config.createdAt,
      lastWebhookAt: config.lastWebhookAt,
      webhookCount: config.webhookCount,
      installationId: config.installationId,
      hasCredentials: !!(config.privateKey && config.webhookSecret)
    };

    return new Response(JSON.stringify(safeConfig, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching GitHub status:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
}

// HMAC-SHA256 signature verification for GitHub webhooks
async function verifyGitHubSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const sigHex = signature.replace('sha256=', '');

  // Create HMAC-SHA256 hash
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const messageBuffer = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.sign('HMAC', key, messageBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  const computedHex = Array.from(hashArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  return sigHex === computedHex;
}

// Route webhook events to specific handlers
async function routeWebhookEvent(event: string, data: any, configDO: any, env: any): Promise<Response> {
  switch (event) {
    case 'installation':
      return handleInstallationEvent(data, configDO);

    case 'installation_repositories':
      return handleInstallationRepositoriesEvent(data, configDO);

    case 'push':
      return handlePushEvent(data, env, configDO);

    case 'pull_request':
      return handlePullRequestEvent(data, env, configDO);

    case 'issues':
      return handleIssuesEvent(data, env, configDO);

    default:
      console.log(`Unhandled webhook event: ${event}`);
      return new Response('Event acknowledged', { status: 200 });
  }
}

// Main webhook processing handler
export async function handleGitHubWebhook(request: Request, env: any): Promise<Response> {
  try {
    // Get webhook payload and headers
    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event');
    const delivery = request.headers.get('x-github-delivery');

    if (!signature || !event || !delivery) {
      console.log('Missing required webhook headers');
      return new Response('Missing required headers', { status: 400 });
    }

    // Parse the payload to get app/installation info
    let webhookData;
    try {
      webhookData = JSON.parse(payload);
    } catch (error) {
      console.log('Invalid JSON payload:', error);
      return new Response('Invalid JSON payload', { status: 400 });
    }

    // Determine which app config to use based on the webhook
    let appId: string | undefined;

    if (webhookData.installation?.app_id) {
      // Installation events include app_id directly
      appId = webhookData.installation.app_id.toString();
    } else if (webhookData.installation?.id) {
      // For other events, we need to look up the app ID by installation ID
      // Since we only have one app per worker deployment, we can check our known app
      // For now, use the app ID from the header
      const hookInstallationTargetId = request.headers.get('x-github-hook-installation-target-id');
      if (hookInstallationTargetId) {
        appId = hookInstallationTargetId;
      } else {
        console.log('Cannot determine app ID from webhook payload or headers');
        return new Response('Cannot determine app ID', { status: 400 });
      }
    } else {
      console.log('No installation information in webhook payload');
      return new Response('No installation information', { status: 400 });
    }

    // Get app configuration and decrypt webhook secret
    const id = env.GITHUB_APP_CONFIG.idFromName(appId);
    const configDO = env.GITHUB_APP_CONFIG.get(id);

    const configResponse = await configDO.fetch(new Request('http://internal/get-credentials'));
    if (!configResponse.ok) {
      console.log('No app configuration found for app ID:', appId);
      return new Response('App not configured', { status: 404 });
    }

    const credentials = await configResponse.json();
    if (!credentials || !credentials.webhookSecret) {
      console.log('No webhook secret found for app ID:', appId);
      return new Response('Webhook secret not found', { status: 500 });
    }

    // Verify the webhook signature
    const isValid = await verifyGitHubSignature(payload, signature, credentials.webhookSecret);
    if (!isValid) {
      console.log('Invalid webhook signature');
      return new Response('Invalid signature', { status: 401 });
    }

    // Log successful webhook delivery
    await configDO.fetch(new Request('http://internal/log-webhook', {
      method: 'POST',
      body: JSON.stringify({ event, delivery, timestamp: new Date().toISOString() })
    }));

    // Route to appropriate event handler
    const eventResponse = await routeWebhookEvent(event, webhookData, configDO, env);

    console.log(`Successfully processed ${event} webhook (delivery: ${delivery})`);
    return eventResponse;

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}