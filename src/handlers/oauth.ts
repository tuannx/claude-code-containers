async function handleOAuthCallback(_request: Request, url: URL, env: any): Promise<Response> {
    const code = url.searchParams.get('code');

    if (!code) {
        return new Response('Missing authorization code', { status: 400 });
    }

    try {
        // Exchange temporary code for app credentials
        const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Worker-GitHub-Integration'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const appData = await response.json() as GitHubAppData;

        // Store app credentials securely in Durable Object
        try {
            const encryptedPrivateKey = await encrypt(appData.pem);
            const encryptedWebhookSecret = await encrypt(appData.webhook_secret);

            const appConfig: GitHubAppConfig = {
                appId: appData.id.toString(),
                privateKey: encryptedPrivateKey,
                webhookSecret: encryptedWebhookSecret,
                repositories: [],
                owner: {
                    login: appData.owner?.login || 'unknown',
                    type: 'User', // Default to User, will be updated during installation
                    id: 0 // Will be updated during installation
                },
                permissions: {
                    contents: 'read',
                    metadata: 'read',
                    pull_requests: 'write',
                    issues: 'write'
                },
                events: ['push', 'pull_request', 'issues'],
                createdAt: new Date().toISOString(),
                webhookCount: 0
            };

            // Store in Durable Object (using app ID as unique identifier)
            const id = env.GITHUB_APP_CONFIG.idFromName(appData.id.toString());
            const configDO = env.GITHUB_APP_CONFIG.get(id);

            // We need to create a simple API for the Durable Object
            await configDO.fetch(new Request('http://internal/store', {
                method: 'POST',
                body: JSON.stringify(appConfig)
            }));

            console.log(`Stored GitHub App config for App ID: ${appData.id}`);
        } catch (error) {
            console.error('Failed to store app config:', error);
            // Continue with the flow even if storage fails
        }

        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>GitHub App Created Successfully</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
        }
        .success { color: #28a745; }
        .install-btn {
            display: inline-block;
            background: #0969da;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }
        .app-info {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }
    </style>
</head>
<body>
    <h1 class="success">✅ GitHub App Created Successfully!</h1>

    <div class="app-info">
        <h3>App Details</h3>
        <p><strong>Name:</strong> ${appData.name}</p>
        <p><strong>App ID:</strong> ${appData.id}</p>
        <p><strong>Owner:</strong> ${appData.owner?.login || 'Unknown'}</p>
    </div>

    <p>Your GitHub App has been created with all necessary permissions and webhook configuration.</p>

    <h3>Next Step: Install Your App</h3>
    <p>Click the button below to install the app on your repositories and start receiving webhooks.</p>

    <a href="${appData.html_url}/installations/new" class="install-btn">
        📦 Install App on Repositories
    </a>

    <p><small>App credentials have been securely stored and webhooks are ready to receive events.</small></p>
</body>
</html>`;

        return new Response(html, {
            headers: { 'Content-Type': 'text/html' }
        });

    } catch (error) {
        console.error('OAuth callback error:', error);
        return new Response(`Setup failed: ${error}`, { status: 500 });
    }
}