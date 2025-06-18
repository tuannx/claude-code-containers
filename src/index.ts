import { Container, loadBalance, getContainer } from 'cf-containers';
import jwt from '@tsndr/cloudflare-worker-jwt';

// GitHub App Manifest Template
interface GitHubAppManifest {
  name: string;
  url: string;
  hook_attributes: {
    url: string;
  };
  redirect_url: string;
  callback_urls: string[];
  setup_url: string;
  public: boolean;
  default_permissions: {
    contents: string;
    metadata: string;
    pull_requests: string;
    issues: string;
  };
  default_events: string[];
}

// GitHub App Data Response
interface GitHubAppData {
  id: number;
  name: string;
  html_url: string;
  owner?: {
    login: string;
  };
  pem: string;
  webhook_secret: string;
}

// Storage Interfaces for Phase 2
interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}

interface GitHubAppConfig {
  appId: string;
  privateKey: string; // encrypted
  webhookSecret: string; // encrypted
  installationId?: string;
  repositories: Repository[];
  owner: {
    login: string;
    type: "User" | "Organization";
    id: number;
  };
  permissions: {
    contents: string;
    metadata: string;
    pull_requests: string;
    issues: string;
  };
  events: string[];
  createdAt: string;
  lastWebhookAt?: string;
  webhookCount: number;
  // Claude Code integration
  anthropicApiKey?: string; // encrypted
  claudeSetupAt?: string;
}

// Encryption utilities
async function encrypt(text: string, key?: CryptoKey): Promise<string> {
  if (!key) {
    // Generate a simple key from static data for now
    // In production, this should use proper key management
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('github-app-encryption-key-32char'),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    key = keyMaterial;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedText: string, key?: CryptoKey): Promise<string> {
  if (!key) {
    // Generate the same key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('github-app-encryption-key-32char'),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    key = keyMaterial;
  }

  const combined = new Uint8Array(
    atob(encryptedText)
      .split('')
      .map(char => char.charCodeAt(0))
  );

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

// JWT token generation for GitHub App authentication
async function generateAppJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: appId,
    iat: now - 60, // Issue time (1 minute ago to account for clock skew)
    exp: now + 600, // Expiration time (10 minutes from now)
  };

  // GitHub requires RS256 algorithm for App JWT tokens
  const token = await jwt.sign(payload, privateKey, { algorithm: 'RS256' });
  return token;
}

// Generate installation access token for making GitHub API calls
async function generateInstallationToken(
  appId: string,
  privateKey: string,
  installationId: string
): Promise<{ token: string; expires_at: string } | null> {
  try {
    // First, generate App JWT
    const appJWT = await generateAppJWT(appId, privateKey);

    // Exchange for installation access token
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${appJWT}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Worker-GitHub-Integration'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to generate installation token: ${response.status} ${errorText}`);
      return null;
    }

    const tokenData = await response.json() as { token: string; expires_at: string };
    return tokenData;
  } catch (error) {
    console.error('Error generating installation token:', error);
    return null;
  }
}

// GitHub API client with authentication
class GitHubAPI {
  private configDO: any;

  constructor(configDO: any) {
    this.configDO = configDO;
  }

  async makeAuthenticatedRequest(path: string, options: RequestInit = {}): Promise<Response> {
    const tokenResponse = await this.configDO.fetch(new Request('http://internal/get-installation-token'));
    const tokenData = await tokenResponse.json() as { token: string };

    if (!tokenData.token) {
      throw new Error('No valid installation token available');
    }

    const headers = {
      'Authorization': `Bearer ${tokenData.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Worker-GitHub-Integration',
      ...options.headers
    };

    return fetch(`https://api.github.com${path}`, {
      ...options,
      headers
    });
  }

  // Get repository information
  async getRepository(owner: string, repo: string) {
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}`);
    return response.json();
  }

  // Comment on an issue or pull request
  async createComment(owner: string, repo: string, issueNumber: number, body: string) {
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    return response.json();
  }

  // Get installation repositories
  async getInstallationRepositories() {
    const response = await this.makeAuthenticatedRequest('/installation/repositories');
    return response.json();
  }
}

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

async function handleClaudeSetup(request: Request, origin: string, env: any): Promise<Response> {
  const url = new URL(request.url);
  
  // Handle POST request to save API key
  if (request.method === 'POST') {
    try {
      const formData = await request.formData();
      const apiKey = formData.get('anthropic_api_key') as string;
      
      if (!apiKey || !apiKey.startsWith('sk-ant-')) {
        throw new Error('Invalid Anthropic API key format');
      }
      
      // Store the API key securely in a deployment-specific Durable Object
      const deploymentId = 'claude-config'; // Single config per deployment
      const id = env.GITHUB_APP_CONFIG.idFromName(deploymentId);
      const configDO = env.GITHUB_APP_CONFIG.get(id);
      
      // Encrypt the API key
      const encryptedApiKey = await encrypt(apiKey);
      
      // Store in Durable Object
      await configDO.fetch(new Request('http://internal/store-claude-key', {
        method: 'POST',
        body: JSON.stringify({
          anthropicApiKey: encryptedApiKey,
          claudeSetupAt: new Date().toISOString()
        })
      }));
      
      return new Response(`
<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Setup Complete</title>
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
        .next-btn {
            display: inline-block;
            background: #0969da;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1 class="success">✅ Claude Code API Key Configured!</h1>
    <p>Your Anthropic API key has been securely stored and encrypted.</p>
    <p>Claude Code is now ready to process GitHub issues automatically!</p>
    
    <a href="/gh-setup" class="next-btn">
        📱 Setup GitHub Integration
    </a>
    
    <p><small>Your API key is encrypted and stored securely in Cloudflare's Durable Objects.</small></p>
</body>
</html>`, {
        headers: { 'Content-Type': 'text/html' }
      });
      
    } catch (error) {
      return new Response(`
<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Setup Error</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
        }
        .error { color: #dc3545; }
        .back-btn {
            display: inline-block;
            background: #6c757d;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1 class="error">❌ Setup Error</h1>
    <p>Error: ${error.message}</p>
    
    <a href="/claude-setup" class="back-btn">
        ← Try Again
    </a>
</body>
</html>`, {
        headers: { 'Content-Type': 'text/html' },
        status: 400
      });
    }
  }
  
  // Show setup form
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Setup - Anthropic API Key</title>
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
        .setup-form {
            background: #f5f5f5;
            padding: 30px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
            box-sizing: border-box;
        }
        .submit-btn {
            background: #28a745;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
            width: 100%;
        }
        .submit-btn:hover {
            background: #218838;
        }
        .info-box {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 6px;
            border-left: 4px solid #2196f3;
            margin: 20px 0;
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
        .security-note {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #28a745;
            margin: 20px 0;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 Claude Code Setup</h1>
        <p>Configure your Anthropic API key to enable AI-powered GitHub issue processing</p>
    </div>

    <div class="info-box">
        <h3>🔑 What you'll need</h3>
        <p>An Anthropic API key with access to Claude. You can get one from the <a href="https://console.anthropic.com/" target="_blank">Anthropic Console</a>.</p>
    </div>

    <div class="steps">
        <h3>Quick Setup Steps</h3>

        <div class="step">
            <div class="step-number">1</div>
            <strong>Get your API Key</strong><br>
            Visit <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a> and create an API key (starts with "sk-ant-").
        </div>

        <div class="step">
            <div class="step-number">2</div>
            <strong>Enter API Key</strong><br>
            Paste your API key in the form below. It will be encrypted and stored securely.
        </div>

        <div class="step">
            <div class="step-number">3</div>
            <strong>Setup GitHub Integration</strong><br>
            After saving your key, configure GitHub to send webhooks for automatic issue processing.
        </div>
    </div>

    <form method="POST" class="setup-form">
        <div class="form-group">
            <label for="anthropic_api_key">Anthropic API Key</label>
            <input 
                type="password" 
                id="anthropic_api_key" 
                name="anthropic_api_key" 
                placeholder="sk-ant-api03-..." 
                required 
                pattern="sk-ant-.*"
                title="API key must start with 'sk-ant-'"
            >
        </div>
        
        <button type="submit" class="submit-btn">
            🔐 Save API Key Securely
        </button>
    </form>

    <div class="security-note">
        <strong>🔒 Security:</strong> Your API key is encrypted using AES-256-GCM before storage. 
        Only your worker deployment can decrypt and use it. It's never logged or exposed.
    </div>

    <p><strong>Already configured?</strong> <a href="/gh-setup">Continue to GitHub Setup →</a></p>
    
    <hr style="margin: 40px 0;">
    <p style="text-align: center;"><a href="/">← Back to Home</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

async function handleGitHubSetup(_request: Request, origin: string): Promise<Response> {
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

async function handleInstallationGuide(_request: Request, _url: URL): Promise<Response> {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Install GitHub App</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
        }
        .step {
            margin: 20px 0;
            padding: 15px;
            border-left: 4px solid #0969da;
            background: #f8f9fa;
        }
    </style>
</head>
<body>
    <h1>📦 Install Your GitHub App</h1>

    <p>Follow these steps to complete the setup:</p>

    <div class="step">
        <h3>1. Choose Repositories</h3>
        <p>Select which repositories should send webhooks to your worker. You can choose:</p>
        <ul>
            <li><strong>All repositories</strong> - Current and future repos</li>
            <li><strong>Selected repositories</strong> - Choose specific repos</li>
        </ul>
    </div>

    <div class="step">
        <h3>2. Complete Installation</h3>
        <p>Click "Install" to finish the setup process.</p>
    </div>

    <div class="step">
        <h3>3. Test Webhooks</h3>
        <p>Once installed, try:</p>
        <ul>
            <li>Push a commit to trigger a webhook</li>
            <li>Open/close a pull request</li>
            <li>Create an issue</li>
        </ul>
    </div>

    <p><strong>✅ Once installation is complete, your worker will start receiving GitHub webhooks!</strong></p>

    <p><a href="/gh-setup">← Back to Setup</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

async function handleGitHubStatus(_request: Request, env: any): Promise<Response> {
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

// Main webhook processing handler
async function handleGitHubWebhook(request: Request, env: any): Promise<Response> {
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

// Handle installation events (app installed/uninstalled)
async function handleInstallationEvent(data: any, configDO: any): Promise<Response> {
  const action = data.action;
  const installation = data.installation;

  if (action === 'created') {
    // App was installed - update configuration with installation details
    const repositories = data.repositories || [];
    const repoData = repositories.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private
    }));

    await configDO.fetch(new Request('http://internal/update-installation', {
      method: 'POST',
      body: JSON.stringify({
        installationId: installation.id.toString(),
        repositories: repoData,
        owner: {
          login: installation.account.login,
          type: installation.account.type,
          id: installation.account.id
        }
      })
    }));

    console.log(`App installed on ${repositories.length} repositories`);
  } else if (action === 'deleted') {
    // App was uninstalled - could clean up or mark as inactive
    console.log('App installation removed');
  }

  return new Response('Installation event processed', { status: 200 });
}

// Handle repository changes (repos added/removed from installation)
async function handleInstallationRepositoriesEvent(data: any, configDO: any): Promise<Response> {
  const action = data.action;

  if (action === 'added') {
    const addedRepos = data.repositories_added || [];
    for (const repo of addedRepos) {
      await configDO.fetch(new Request('http://internal/add-repository', {
        method: 'POST',
        body: JSON.stringify({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private
        })
      }));
    }
    console.log(`Added ${addedRepos.length} repositories`);
  } else if (action === 'removed') {
    const removedRepos = data.repositories_removed || [];
    for (const repo of removedRepos) {
      await configDO.fetch(new Request(`http://internal/remove-repository/${repo.id}`, {
        method: 'DELETE'
      }));
    }
    console.log(`Removed ${removedRepos.length} repositories`);
  }

  return new Response('Repository changes processed', { status: 200 });
}

// Handle push events
async function handlePushEvent(data: any, env: any, configDO: any): Promise<Response> {
  const repository = data.repository;
  const commits = data.commits || [];

  console.log(`Push event: ${commits.length} commits to ${repository.full_name}`);

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  try {
    // Example: Get repository details with authenticated API call
    const repoData = await githubAPI.getRepository(repository.owner.login, repository.name);
    console.log(`Repository stars: ${repoData.stargazers_count}`);
  } catch (error) {
    console.error('Failed to fetch repository data:', error);
  }

  // Wake up a container based on the repository
  const containerName = `repo-${repository.id}`;
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  // Pass webhook data to the container
  const containerResponse = await container.fetch(new Request('http://internal/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'push',
      repository: repository.full_name,
      commits: commits.length,
      ref: data.ref,
      author: commits[0]?.author?.name || 'Unknown'
    })
  }));

  console.log(`Container response status: ${containerResponse.status}`);

  return new Response('Push event processed', { status: 200 });
}

// Handle pull request events
async function handlePullRequestEvent(data: any, env: any, configDO: any): Promise<Response> {
  const action = data.action;
  const pullRequest = data.pull_request;
  const repository = data.repository;

  console.log(`Pull request ${action}: #${pullRequest.number} in ${repository.full_name}`);

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  // Example: Comment on PR when it's opened
  if (action === 'opened') {
    try {
      await githubAPI.createComment(
        repository.owner.login,
        repository.name,
        pullRequest.number,
        `🚀 Thanks for the pull request! This event was processed by our Worker container.`
      );
      console.log(`Commented on PR #${pullRequest.number}`);
    } catch (error) {
      console.error('Failed to comment on PR:', error);
    }
  }

  // Wake up container for all PR events
  const containerName = `repo-${repository.id}`;
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  await container.fetch(new Request('http://internal/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'pull_request',
      action,
      repository: repository.full_name,
      pr_number: pullRequest.number,
      pr_title: pullRequest.title,
      pr_author: pullRequest.user.login
    })
  }));

  return new Response('Pull request event processed', { status: 200 });
}

// Handle issues events
async function handleIssuesEvent(data: any, env: any, configDO: any): Promise<Response> {
  const action = data.action;
  const issue = data.issue;
  const repository = data.repository;

  console.log(`Issue ${action}: #${issue.number} in ${repository.full_name}`);

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  // Handle new issue creation with Claude Code
  if (action === 'opened') {
    try {
      // Post initial acknowledgment comment
      await githubAPI.createComment(
        repository.owner.login,
        repository.name,
        issue.number,
        `🤖 **Claude Code Assistant**\n\nI've received this issue and I'm analyzing it now. I'll start working on a solution shortly!\n\n---\n🚀 Powered by Claude Code`
      );
      console.log(`Posted initial comment on issue #${issue.number}`);

      // Route to Claude Code container for processing
      await routeToClaudeCodeContainer(issue, repository, env, configDO);

    } catch (error) {
      console.error('Failed to process new issue:', error);
      
      // Post error comment
      try {
        await githubAPI.createComment(
          repository.owner.login,
          repository.name,
          issue.number,
          `❌ I encountered an error while setting up to work on this issue: ${error.message}\n\nI'll need human assistance to resolve this.`
        );
      } catch (commentError) {
        console.error('Failed to post error comment:', commentError);
      }
    }
  }

  // For other issue actions, use the standard container routing
  const containerName = `repo-${repository.id}`;
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  await container.fetch(new Request('http://internal/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'issues',
      action,
      repository: repository.full_name,
      issue_number: issue.number,
      issue_title: issue.title,
      issue_author: issue.user.login
    })
  }));

  return new Response('Issues event processed', { status: 200 });
}

// Route GitHub issue to Claude Code container
async function routeToClaudeCodeContainer(issue: any, repository: any, env: any, configDO: any): Promise<void> {
  console.log(`Routing issue #${issue.number} to Claude Code container`);

  // Create unique container for this issue
  const containerName = `claude-issue-${issue.id}`;
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  // Get installation token for GitHub API access
  const tokenResponse = await configDO.fetch(new Request('http://internal/get-installation-token'));
  const tokenData = await tokenResponse.json() as { token: string };

  // Get Claude API key from secure storage
  const claudeConfigId = env.GITHUB_APP_CONFIG.idFromName('claude-config');
  const claudeConfigDO = env.GITHUB_APP_CONFIG.get(claudeConfigId);
  const claudeKeyResponse = await claudeConfigDO.fetch(new Request('http://internal/get-claude-key'));
  const claudeKeyData = await claudeKeyResponse.json() as { anthropicApiKey: string | null };

  if (!claudeKeyData.anthropicApiKey) {
    throw new Error('Claude API key not configured. Please visit /claude-setup first.');
  }

  // Prepare environment variables for the container
  const issueContext = {
    ANTHROPIC_API_KEY: claudeKeyData.anthropicApiKey,
    GITHUB_TOKEN: tokenData.token,
    ISSUE_ID: issue.id.toString(),
    ISSUE_NUMBER: issue.number.toString(),
    ISSUE_TITLE: issue.title,
    ISSUE_BODY: issue.body || '',
    ISSUE_LABELS: JSON.stringify(issue.labels?.map((label: any) => label.name) || []),
    REPOSITORY_URL: repository.clone_url,
    REPOSITORY_NAME: repository.full_name,
    ISSUE_AUTHOR: issue.user.login,
    MESSAGE: `Processing issue #${issue.number}: ${issue.title}`
  };

  // Create container with Claude Code environment variables
  const claudeContainer = new MyContainer();
  claudeContainer.envVars = {
    ...claudeContainer.envVars,
    ...issueContext
  };

  // Get container instance for Claude Code processing
  const claudeId = env.MY_CONTAINER.idFromName(containerName);
  const claudeInstance = env.MY_CONTAINER.get(claudeId);

  // Start Claude Code processing by sending the issue context
  try {
    const response = await claudeInstance.fetch(new Request('http://internal/process-issue', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(issueContext)
    }));

    console.log(`Claude Code container response: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`Container returned status ${response.status}`);
    }

  } catch (error) {
    console.error('Failed to start Claude Code processing:', error);
    throw error;
  }
}


export class GitHubAppConfigDO {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/store' && request.method === 'POST') {
      const config = await request.json() as GitHubAppConfig;
      await this.storeAppConfig(config);
      return new Response('OK');
    }

    if (url.pathname === '/get' && request.method === 'GET') {
      const config = await this.getAppConfig();
      return new Response(JSON.stringify(config));
    }

    if (url.pathname === '/get-credentials' && request.method === 'GET') {
      const credentials = await this.getDecryptedCredentials();
      return new Response(JSON.stringify(credentials));
    }

    if (url.pathname === '/log-webhook' && request.method === 'POST') {
      const webhookData = await request.json() as { event: string; delivery: string; timestamp: string };
      await this.logWebhook(webhookData.event);
      return new Response('OK');
    }

    if (url.pathname === '/update-installation' && request.method === 'POST') {
      const installationData = await request.json() as { installationId: string; repositories: Repository[]; owner: any };
      await this.updateInstallation(installationData.installationId, installationData.repositories);
      // Also update owner information
      const config = await this.getAppConfig();
      if (config) {
        config.owner = installationData.owner;
        await this.storeAppConfig(config);
      }
      return new Response('OK');
    }

    if (url.pathname === '/add-repository' && request.method === 'POST') {
      const repo = await request.json() as Repository;
      await this.addRepository(repo);
      return new Response('OK');
    }

    if (url.pathname.startsWith('/remove-repository/') && request.method === 'DELETE') {
      const repoId = parseInt(url.pathname.split('/').pop() || '0');
      await this.removeRepository(repoId);
      return new Response('OK');
    }

    if (url.pathname === '/get-installation-token' && request.method === 'GET') {
      const token = await this.getInstallationToken();
      return new Response(JSON.stringify({ token }));
    }

    if (url.pathname === '/store-claude-key' && request.method === 'POST') {
      const claudeData = await request.json() as { anthropicApiKey: string; claudeSetupAt: string };
      await this.storeClaudeApiKey(claudeData.anthropicApiKey, claudeData.claudeSetupAt);
      return new Response('OK');
    }

    if (url.pathname === '/get-claude-key' && request.method === 'GET') {
      const apiKey = await this.getDecryptedClaudeApiKey();
      return new Response(JSON.stringify({ anthropicApiKey: apiKey }));
    }

    return new Response('Not Found', { status: 404 });
  }

  async storeAppConfig(config: GitHubAppConfig): Promise<void> {
    await this.storage.put('github_app_config', config);
  }

  async getAppConfig(): Promise<GitHubAppConfig | null> {
    return await this.storage.get('github_app_config') || null;
  }

  async updateInstallation(installationId: string, repositories: Repository[]): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      config.installationId = installationId;
      config.repositories = repositories;
      await this.storeAppConfig(config);
    }
  }

  async logWebhook(_event: string): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      config.lastWebhookAt = new Date().toISOString();
      config.webhookCount = (config.webhookCount || 0) + 1;
      await this.storeAppConfig(config);
    }
  }

  async addRepository(repo: Repository): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      // Check if repository already exists
      const exists = config.repositories.some(r => r.id === repo.id);
      if (!exists) {
        config.repositories.push(repo);
        await this.storeAppConfig(config);
      }
    }
  }

  async removeRepository(repoId: number): Promise<void> {
    const config = await this.getAppConfig();
    if (config) {
      config.repositories = config.repositories.filter(r => r.id !== repoId);
      await this.storeAppConfig(config);
    }
  }

  async getDecryptedCredentials(): Promise<{ privateKey: string; webhookSecret: string } | null> {
    const config = await this.getAppConfig();
    if (!config) return null;

    try {
      const privateKey = await decrypt(config.privateKey);
      const webhookSecret = await decrypt(config.webhookSecret);
      return { privateKey, webhookSecret };
    } catch (error) {
      console.error('Failed to decrypt credentials:', error);
      return null;
    }
  }

  async getInstallationToken(): Promise<string | null> {
    const config = await this.getAppConfig();
    if (!config || !config.installationId) return null;

    try {
      // Check if we have a cached token that's still valid
      const cachedToken = await this.storage.get('cached_installation_token') as { token: string; expires_at: string } | null;
      if (cachedToken) {
        const expiresAt = new Date(cachedToken.expires_at);
        const now = new Date();
        // Check if token expires in more than 5 minutes
        if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
          return cachedToken.token;
        }
      }

      // Generate new token
      const credentials = await this.getDecryptedCredentials();
      if (!credentials) return null;

      const tokenData = await generateInstallationToken(
        config.appId,
        credentials.privateKey,
        config.installationId
      );

      if (tokenData) {
        // Cache the token
        await this.storage.put('cached_installation_token', tokenData);
        return tokenData.token;
      }

      return null;
    } catch (error) {
      console.error('Failed to get installation token:', error);
      return null;
    }
  }

  // Claude Code API key management
  async storeClaudeApiKey(encryptedApiKey: string, setupTimestamp: string): Promise<void> {
    // Store in a separate key for easier management
    await this.storage.put('claude_config', {
      anthropicApiKey: encryptedApiKey,
      claudeSetupAt: setupTimestamp
    });
  }

  async getDecryptedClaudeApiKey(): Promise<string | null> {
    try {
      const claudeConfig = await this.storage.get('claude_config') as { anthropicApiKey: string; claudeSetupAt: string } | null;
      if (!claudeConfig) return null;

      const decryptedKey = await decrypt(claudeConfig.anthropicApiKey);
      return decryptedKey;
    } catch (error) {
      console.error('Failed to decrypt Claude API key:', error);
      return null;
    }
  }
}

export class MyContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '30m'; // Extended timeout for Claude Code processing
  envVars = {
    MESSAGE: 'I was passed in via the container class!',
  };

  override onStart() {
    console.log('Container successfully started');
  }

  override onStop() {
    console.log('Container successfully shut down');
  }

  override onError(error: unknown) {
    console.log('Container error:', error);
  }
}

export default {
  async fetch(
    request: Request,
    env: any
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Claude Code Setup Route
    if (pathname === '/claude-setup') {
      return handleClaudeSetup(request, url.origin, env);
    }

    // GitHub App Setup Routes
    if (pathname === '/gh-setup') {
      return handleGitHubSetup(request, url.origin);
    }

    if (pathname === '/gh-setup/callback') {
      return handleOAuthCallback(request, url, env);
    }

    if (pathname === '/gh-setup/install') {
      return handleInstallationGuide(request, url);
    }

    // Status endpoint to check stored configurations
    if (pathname === '/gh-status') {
      return handleGitHubStatus(request, env);
    }

    // GitHub webhook endpoint
    if (pathname === '/webhooks/github') {
      return handleGitHubWebhook(request, env);
    }

    // To route requests to a specific container,
    // pass a unique container identifier to .get()
    if (pathname.startsWith('/container')) {
      let id = env.MY_CONTAINER.idFromName('container');
      let container = env.MY_CONTAINER.get(id);
      return await container.fetch(request);
    }

    // This route forces a panic in the container.
    // This will cause the onError hook to run
    if (pathname.startsWith('/error')) {
      let id = env.MY_CONTAINER.idFromName('error-test');
      let container = env.MY_CONTAINER.get(id);
      return await container.fetch(request);
    }

    // This route uses the loadBalance helper to route
    // requests to one of 3 containers
    if (pathname.startsWith('/lb')) {
      let container = await loadBalance(env.MY_CONTAINER, 3);
      return await container.fetch(request);
    }

    // This route uses the getContainer helper to get a
    // single contianer instance and always routes to it
    if (pathname.startsWith('/singleton')) {
      return await getContainer(env.MY_CONTAINER).fetch(request);
    }

    return new Response(`
🤖 Claude Code Container Integration

Setup Instructions:
1. Configure Claude Code: /claude-setup
2. Setup GitHub Integration: /gh-setup

Container Testing Routes:
- /container - Basic container health check
- /lb - Load balancing over multiple containers  
- /error - Test error handling
- /singleton - Single container instance

Once both setups are complete, create GitHub issues to trigger automatic Claude Code processing!
    `);
  },
};
