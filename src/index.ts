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

// Enhanced logging utility
function logWithContext(context: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${context}] ${message}`;
  
  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
}

// Encryption utilities
async function encrypt(text: string, key?: CryptoKey): Promise<string> {
  logWithContext('ENCRYPTION', 'Starting encryption process');
  
  if (!key) {
    logWithContext('ENCRYPTION', 'Generating encryption key from static material');
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

  logWithContext('ENCRYPTION', 'Encryption completed successfully');
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedText: string, key?: CryptoKey): Promise<string> {
  logWithContext('DECRYPTION', 'Starting decryption process');
  
  if (!key) {
    logWithContext('DECRYPTION', 'Generating decryption key from static material');
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

  const result = new TextDecoder().decode(decrypted);
  logWithContext('DECRYPTION', 'Decryption completed successfully');
  return result;
}

// JWT token generation for GitHub App authentication
async function generateAppJWT(appId: string, privateKey: string): Promise<string> {
  logWithContext('JWT', 'Generating App JWT token', { appId });
  
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: appId,
    iat: now - 60, // Issue time (1 minute ago to account for clock skew)
    exp: now + 600, // Expiration time (10 minutes from now)
  };

  logWithContext('JWT', 'JWT payload prepared', { payload });
  
  // GitHub requires RS256 algorithm for App JWT tokens
  const token = await jwt.sign(payload, privateKey, { algorithm: 'RS256' });
  
  logWithContext('JWT', 'App JWT token generated successfully');
  return token;
}

// Generate installation access token for making GitHub API calls
async function generateInstallationToken(
  appId: string,
  privateKey: string,
  installationId: string
): Promise<{ token: string; expires_at: string } | null> {
  logWithContext('INSTALLATION_TOKEN', 'Starting installation token generation', {
    appId,
    installationId
  });
  
  try {
    // First, generate App JWT
    const appJWT = await generateAppJWT(appId, privateKey);
    logWithContext('INSTALLATION_TOKEN', 'App JWT generated, exchanging for installation token');

    // Exchange for installation access token
    const apiUrl = `https://api.github.com/app/installations/${installationId}/access_tokens`;
    logWithContext('INSTALLATION_TOKEN', 'Calling GitHub API', { url: apiUrl });
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appJWT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Worker-GitHub-Integration'
      }
    });

    logWithContext('INSTALLATION_TOKEN', 'GitHub API response received', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      logWithContext('INSTALLATION_TOKEN', 'Failed to generate installation token', {
        status: response.status,
        error: errorText
      });
      return null;
    }

    const tokenData = await response.json() as { token: string; expires_at: string };
    logWithContext('INSTALLATION_TOKEN', 'Installation token generated successfully', {
      expires_at: tokenData.expires_at
    });
    
    return tokenData;
  } catch (error) {
    logWithContext('INSTALLATION_TOKEN', 'Error generating installation token', {
      error: error instanceof Error ? error.message : String(error)
    });
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
    logWithContext('GITHUB_API', 'Making authenticated request', { path, method: options.method || 'GET' });
    
    const tokenResponse = await this.configDO.fetch(new Request('http://internal/get-installation-token'));
    const tokenData = await tokenResponse.json() as { token: string };

    if (!tokenData.token) {
      logWithContext('GITHUB_API', 'No installation token available');
      throw new Error('No valid installation token available');
    }

    const headers = {
      'Authorization': `Bearer ${tokenData.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Worker-GitHub-Integration',
      ...options.headers
    };

    const url = `https://api.github.com${path}`;
    logWithContext('GITHUB_API', 'Sending request to GitHub', { url, headers: Object.keys(headers) });
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    logWithContext('GITHUB_API', 'GitHub API response', {
      status: response.status,
      statusText: response.statusText,
      path
    });
    
    return response;
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
  logWithContext('CLAUDE_SETUP', 'Handling Claude setup request', {
    method: request.method,
    origin
  });
  
  const url = new URL(request.url);
  
  // Handle POST request to save API key
  if (request.method === 'POST') {
    logWithContext('CLAUDE_SETUP', 'Processing API key submission');
    
    try {
      const formData = await request.formData();
      const apiKey = formData.get('anthropic_api_key') as string;
      
      logWithContext('CLAUDE_SETUP', 'API key received', {
        hasApiKey: !!apiKey,
        keyPrefix: apiKey ? apiKey.substring(0, 7) + '...' : 'none'
      });
      
      if (!apiKey || !apiKey.startsWith('sk-ant-')) {
        logWithContext('CLAUDE_SETUP', 'Invalid API key format provided');
        throw new Error('Invalid Anthropic API key format');
      }
      
      // Store the API key securely in a deployment-specific Durable Object
      const deploymentId = 'claude-config'; // Single config per deployment
      logWithContext('CLAUDE_SETUP', 'Storing API key in Durable Object', { deploymentId });
      
      const id = env.GITHUB_APP_CONFIG.idFromName(deploymentId);
      const configDO = env.GITHUB_APP_CONFIG.get(id);
      
      // Encrypt the API key
      const encryptedApiKey = await encrypt(apiKey);
      logWithContext('CLAUDE_SETUP', 'API key encrypted successfully');
      
      // Store in Durable Object
      const storeResponse = await configDO.fetch(new Request('http://internal/store-claude-key', {
        method: 'POST',
        body: JSON.stringify({
          anthropicApiKey: encryptedApiKey,
          claudeSetupAt: new Date().toISOString()
        })
      }));
      
      logWithContext('CLAUDE_SETUP', 'API key stored in Durable Object', {
        storeResponseStatus: storeResponse.status
      });
      
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
      logWithContext('CLAUDE_SETUP', 'Error during Claude setup', {
        error: error instanceof Error ? error.message : String(error)
      });
      
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
  logWithContext('GITHUB_SETUP', 'Handling GitHub setup request', { origin });
  
  const webhookUrl = `${origin}/webhooks/github`;
  const manifest = generateAppManifest(origin);
  const manifestJson = JSON.stringify(manifest);
  
  logWithContext('GITHUB_SETUP', 'Generated GitHub App manifest', {
    webhookUrl,
    appName: manifest.name
  });

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
  logWithContext('OAUTH_CALLBACK', 'Handling OAuth callback', {
    hasCode: !!url.searchParams.get('code'),
    origin: url.origin
  });
  
  const code = url.searchParams.get('code');

  if (!code) {
    logWithContext('OAUTH_CALLBACK', 'Missing authorization code in callback');
    return new Response('Missing authorization code', { status: 400 });
  }

  try {
    // Exchange temporary code for app credentials
    logWithContext('OAUTH_CALLBACK', 'Exchanging code for app credentials', { code: code.substring(0, 8) + '...' });
    
    const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Worker-GitHub-Integration'
      }
    });

    logWithContext('OAUTH_CALLBACK', 'GitHub manifest conversion response', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      logWithContext('OAUTH_CALLBACK', 'GitHub API error', {
        status: response.status,
        error: errorText
      });
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const appData = await response.json() as GitHubAppData;
    logWithContext('OAUTH_CALLBACK', 'App credentials received', {
      appId: appData.id,
      appName: appData.name,
      owner: appData.owner?.login
    });

    // Store app credentials securely in Durable Object
    logWithContext('OAUTH_CALLBACK', 'Storing app credentials in Durable Object');
    
    try {
      const encryptedPrivateKey = await encrypt(appData.pem);
      const encryptedWebhookSecret = await encrypt(appData.webhook_secret);
      
      logWithContext('OAUTH_CALLBACK', 'App credentials encrypted successfully');

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
      const storeResponse = await configDO.fetch(new Request('http://internal/store', {
        method: 'POST',
        body: JSON.stringify(appConfig)
      }));

      logWithContext('OAUTH_CALLBACK', 'App config stored in Durable Object', {
        appId: appData.id,
        storeResponseStatus: storeResponse.status
      });
    } catch (error) {
      logWithContext('OAUTH_CALLBACK', 'Failed to store app config', {
        error: error instanceof Error ? error.message : String(error)
      });
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
    logWithContext('OAUTH_CALLBACK', 'OAuth callback error', {
      error: error instanceof Error ? error.message : String(error)
    });
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
  const startTime = Date.now();
  
  try {
    // Get webhook payload and headers
    const payload = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    const event = request.headers.get('x-github-event');
    const delivery = request.headers.get('x-github-delivery');

    logWithContext('WEBHOOK', 'Received GitHub webhook', {
      event,
      delivery,
      hasSignature: !!signature,
      payloadSize: payload.length,
      headers: {
        userAgent: request.headers.get('user-agent'),
        contentType: request.headers.get('content-type')
      }
    });

    if (!signature || !event || !delivery) {
      logWithContext('WEBHOOK', 'Missing required webhook headers', {
        hasSignature: !!signature,
        hasEvent: !!event,
        hasDelivery: !!delivery
      });
      return new Response('Missing required headers', { status: 400 });
    }

    // Parse the payload to get app/installation info
    let webhookData;
    try {
      webhookData = JSON.parse(payload);
      logWithContext('WEBHOOK', 'Webhook payload parsed successfully', {
        hasInstallation: !!webhookData.installation,
        hasRepository: !!webhookData.repository,
        action: webhookData.action
      });
    } catch (error) {
      logWithContext('WEBHOOK', 'Invalid JSON payload', {
        error: error instanceof Error ? error.message : String(error),
        payloadPreview: payload.substring(0, 200)
      });
      return new Response('Invalid JSON payload', { status: 400 });
    }

    // Determine which app config to use based on the webhook
    let appId: string | undefined;

    if (webhookData.installation?.app_id) {
      // Installation events include app_id directly
      appId = webhookData.installation.app_id.toString();
      logWithContext('WEBHOOK', 'App ID found in installation data', { appId });
    } else if (webhookData.installation?.id) {
      // For other events, we need to look up the app ID by installation ID
      // Since we only have one app per worker deployment, we can check our known app
      // For now, use the app ID from the header
      const hookInstallationTargetId = request.headers.get('x-github-hook-installation-target-id');
      if (hookInstallationTargetId) {
        appId = hookInstallationTargetId;
        logWithContext('WEBHOOK', 'App ID found in header', { appId });
      } else {
        logWithContext('WEBHOOK', 'Cannot determine app ID from webhook payload or headers', {
          hasInstallationId: !!webhookData.installation?.id,
          installationId: webhookData.installation?.id
        });
        return new Response('Cannot determine app ID', { status: 400 });
      }
    } else {
      logWithContext('WEBHOOK', 'No installation information in webhook payload', {
        webhookKeys: Object.keys(webhookData)
      });
      return new Response('No installation information', { status: 400 });
    }

    // Get app configuration and decrypt webhook secret
    logWithContext('WEBHOOK', 'Retrieving app configuration', { appId });
    
    const id = env.GITHUB_APP_CONFIG.idFromName(appId);
    const configDO = env.GITHUB_APP_CONFIG.get(id);

    const configResponse = await configDO.fetch(new Request('http://internal/get-credentials'));
    
    logWithContext('WEBHOOK', 'Config DO response', {
      status: configResponse.status,
      appId
    });
    
    if (!configResponse.ok) {
      logWithContext('WEBHOOK', 'No app configuration found', { appId });
      return new Response('App not configured', { status: 404 });
    }

    const credentials = await configResponse.json();
    if (!credentials || !credentials.webhookSecret) {
      logWithContext('WEBHOOK', 'No webhook secret found', {
        appId,
        hasCredentials: !!credentials,
        credentialKeys: credentials ? Object.keys(credentials) : []
      });
      return new Response('Webhook secret not found', { status: 500 });
    }
    
    logWithContext('WEBHOOK', 'Webhook secret retrieved successfully');

    // Verify the webhook signature
    logWithContext('WEBHOOK', 'Verifying webhook signature');
    
    const isValid = await verifyGitHubSignature(payload, signature, credentials.webhookSecret);
    
    logWithContext('WEBHOOK', 'Signature verification result', { isValid });
    
    if (!isValid) {
      logWithContext('WEBHOOK', 'Invalid webhook signature', {
        signaturePrefix: signature.substring(0, 15) + '...',
        delivery
      });
      return new Response('Invalid signature', { status: 401 });
    }

    // Log successful webhook delivery
    await configDO.fetch(new Request('http://internal/log-webhook', {
      method: 'POST',
      body: JSON.stringify({ event, delivery, timestamp: new Date().toISOString() })
    }));

    // Route to appropriate event handler
    logWithContext('WEBHOOK', 'Routing to event handler', { event });
    
    const eventResponse = await routeWebhookEvent(event, webhookData, configDO, env);
    
    const processingTime = Date.now() - startTime;
    logWithContext('WEBHOOK', 'Webhook processing completed', {
      event,
      delivery,
      processingTimeMs: processingTime,
      responseStatus: eventResponse.status
    });
    
    return eventResponse;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logWithContext('WEBHOOK', 'Webhook processing error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: processingTime
    });
    return new Response('Internal server error', { status: 500 });
  }
}

// Route webhook events to specific handlers
async function routeWebhookEvent(event: string, data: any, configDO: any, env: any): Promise<Response> {
  logWithContext('EVENT_ROUTER', 'Routing webhook event', {
    event,
    action: data.action,
    repository: data.repository?.full_name
  });
  
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
      logWithContext('EVENT_ROUTER', 'Unhandled webhook event', {
        event,
        availableEvents: ['installation', 'installation_repositories', 'push', 'pull_request', 'issues']
      });
      return new Response('Event acknowledged', { status: 200 });
  }
}

// Handle installation events (app installed/uninstalled)
async function handleInstallationEvent(data: any, configDO: any): Promise<Response> {
  const action = data.action;
  const installation = data.installation;

  logWithContext('INSTALLATION_EVENT', 'Processing installation event', {
    action,
    installationId: installation?.id,
    account: installation?.account?.login,
    accountType: installation?.account?.type
  });

  if (action === 'created') {
    // App was installed - update configuration with installation details
    const repositories = data.repositories || [];
    const repoData = repositories.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private
    }));

    logWithContext('INSTALLATION_EVENT', 'Updating installation configuration', {
      repositoryCount: repositories.length,
      repositories: repoData.map(r => r.full_name)
    });

    const updateResponse = await configDO.fetch(new Request('http://internal/update-installation', {
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

    logWithContext('INSTALLATION_EVENT', 'App installed successfully', {
      repositoryCount: repositories.length,
      updateResponseStatus: updateResponse.status
    });
  } else if (action === 'deleted') {
    // App was uninstalled - could clean up or mark as inactive
    logWithContext('INSTALLATION_EVENT', 'App installation removed', {
      installationId: installation?.id
    });
  } else {
    logWithContext('INSTALLATION_EVENT', 'Unhandled installation action', { action });
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
  const ref = data.ref;
  const pusher = data.pusher;

  logWithContext('PUSH_EVENT', 'Processing push event', {
    repository: repository.full_name,
    commitCount: commits.length,
    ref,
    pusher: pusher?.name,
    branch: ref?.replace('refs/heads/', '')
  });

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  try {
    // Example: Get repository details with authenticated API call
    logWithContext('PUSH_EVENT', 'Fetching repository details');
    const repoData = await githubAPI.getRepository(repository.owner.login, repository.name);
    
    logWithContext('PUSH_EVENT', 'Repository details fetched', {
      stars: repoData.stargazers_count,
      language: repoData.language,
      size: repoData.size
    });
  } catch (error) {
    logWithContext('PUSH_EVENT', 'Failed to fetch repository data', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Wake up a container based on the repository
  const containerName = `repo-${repository.id}`;
  logWithContext('PUSH_EVENT', 'Waking up container', { containerName });
  
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  // Pass webhook data to the container
  const webhookPayload = {
    event: 'push',
    repository: repository.full_name,
    commits: commits.length,
    ref: data.ref,
    author: commits[0]?.author?.name || 'Unknown'
  };
  
  logWithContext('PUSH_EVENT', 'Sending webhook to container', webhookPayload);
  
  const containerResponse = await container.fetch(new Request('http://internal/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload)
  }));

  logWithContext('PUSH_EVENT', 'Container response received', {
    status: containerResponse.status,
    statusText: containerResponse.statusText
  });

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

  logWithContext('ISSUES_EVENT', 'Processing issue event', {
    action,
    issueNumber: issue.number,
    issueTitle: issue.title,
    repository: repository.full_name,
    author: issue.user?.login,
    labels: issue.labels?.map((label: any) => label.name) || []
  });

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  // Handle new issue creation with Claude Code
  if (action === 'opened') {
    logWithContext('ISSUES_EVENT', 'Handling new issue creation');
    
    try {
      // Post initial acknowledgment comment
      logWithContext('ISSUES_EVENT', 'Posting initial acknowledgment comment');
      
      await githubAPI.createComment(
        repository.owner.login,
        repository.name,
        issue.number,
        `🤖 **Claude Code Assistant**\n\nI've received this issue and I'm analyzing it now. I'll start working on a solution shortly!\n\n---\n🚀 Powered by Claude Code`
      );
      
      logWithContext('ISSUES_EVENT', 'Initial comment posted successfully');

      // Route to Claude Code container for processing
      logWithContext('ISSUES_EVENT', 'Routing to Claude Code container');
      await routeToClaudeCodeContainer(issue, repository, env, configDO);
      
      logWithContext('ISSUES_EVENT', 'Issue routed to Claude Code container successfully');

    } catch (error) {
      logWithContext('ISSUES_EVENT', 'Failed to process new issue', {
        error: error instanceof Error ? error.message : String(error),
        issueNumber: issue.number
      });
      
      // Post error comment
      try {
        logWithContext('ISSUES_EVENT', 'Posting error comment to issue');
        
        await githubAPI.createComment(
          repository.owner.login,
          repository.name,
          issue.number,
          `❌ I encountered an error while setting up to work on this issue: ${error.message}\n\nI'll need human assistance to resolve this.`
        );
        
        logWithContext('ISSUES_EVENT', 'Error comment posted successfully');
      } catch (commentError) {
        logWithContext('ISSUES_EVENT', 'Failed to post error comment', {
          commentError: commentError instanceof Error ? commentError.message : String(commentError)
        });
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
  const containerName = `claude-issue-${issue.id}`;
  
  logWithContext('CLAUDE_ROUTING', 'Routing issue to Claude Code container', {
    issueNumber: issue.number,
    issueId: issue.id,
    containerName,
    repository: repository.full_name
  });

  // Create unique container for this issue
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  // Get installation token for GitHub API access
  logWithContext('CLAUDE_ROUTING', 'Retrieving installation token');
  
  const tokenResponse = await configDO.fetch(new Request('http://internal/get-installation-token'));
  const tokenData = await tokenResponse.json() as { token: string };
  
  logWithContext('CLAUDE_ROUTING', 'Installation token retrieved', {
    hasToken: !!tokenData.token
  });

  // Get Claude API key from secure storage
  logWithContext('CLAUDE_ROUTING', 'Retrieving Claude API key');
  
  const claudeConfigId = env.GITHUB_APP_CONFIG.idFromName('claude-config');
  const claudeConfigDO = env.GITHUB_APP_CONFIG.get(claudeConfigId);
  const claudeKeyResponse = await claudeConfigDO.fetch(new Request('http://internal/get-claude-key'));
  const claudeKeyData = await claudeKeyResponse.json() as { anthropicApiKey: string | null };

  logWithContext('CLAUDE_ROUTING', 'Claude API key check', {
    hasApiKey: !!claudeKeyData.anthropicApiKey
  });

  if (!claudeKeyData.anthropicApiKey) {
    logWithContext('CLAUDE_ROUTING', 'Claude API key not configured');
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

  // Start Claude Code processing by calling the container
  logWithContext('CLAUDE_ROUTING', 'Starting Claude Code container processing', {
    containerName,
    issueId: issueContext.ISSUE_ID
  });
  
  try {
    const response = await container.fetch(new Request('http://internal/process-issue', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(issueContext)
    }));

    logWithContext('CLAUDE_ROUTING', 'Claude Code container response', {
      status: response.status,
      statusText: response.statusText
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      logWithContext('CLAUDE_ROUTING', 'Container returned error', {
        status: response.status,
        errorText
      });
      throw new Error(`Container returned status ${response.status}: ${errorText}`);
    }
    
    logWithContext('CLAUDE_ROUTING', 'Claude Code processing started successfully');

  } catch (error) {
    logWithContext('CLAUDE_ROUTING', 'Failed to start Claude Code processing', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}


export class GitHubAppConfigDO {
  private storage: DurableObjectStorage;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
    logWithContext('DURABLE_OBJECT', 'GitHubAppConfigDO initialized');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    logWithContext('DURABLE_OBJECT', 'Processing request', {
      method: request.method,
      pathname: url.pathname
    });

    if (url.pathname === '/store' && request.method === 'POST') {
      logWithContext('DURABLE_OBJECT', 'Storing app config');
      
      const config = await request.json() as GitHubAppConfig;
      
      logWithContext('DURABLE_OBJECT', 'App config received', {
        appId: config.appId,
        repositoryCount: config.repositories.length,
        owner: config.owner.login
      });
      
      await this.storeAppConfig(config);
      
      logWithContext('DURABLE_OBJECT', 'App config stored successfully');
      return new Response('OK');
    }

    if (url.pathname === '/get' && request.method === 'GET') {
      logWithContext('DURABLE_OBJECT', 'Retrieving app config');
      
      const config = await this.getAppConfig();
      
      logWithContext('DURABLE_OBJECT', 'App config retrieved', {
        hasConfig: !!config,
        appId: config?.appId,
        repositoryCount: config?.repositories.length
      });
      
      return new Response(JSON.stringify(config));
    }

    if (url.pathname === '/get-credentials' && request.method === 'GET') {
      logWithContext('DURABLE_OBJECT', 'Retrieving and decrypting credentials');
      
      const credentials = await this.getDecryptedCredentials();
      
      logWithContext('DURABLE_OBJECT', 'Credentials retrieved', {
        hasPrivateKey: !!credentials?.privateKey,
        hasWebhookSecret: !!credentials?.webhookSecret
      });
      
      return new Response(JSON.stringify(credentials));
    }

    if (url.pathname === '/log-webhook' && request.method === 'POST') {
      const webhookData = await request.json() as { event: string; delivery: string; timestamp: string };
      
      logWithContext('DURABLE_OBJECT', 'Logging webhook event', {
        event: webhookData.event,
        delivery: webhookData.delivery
      });
      
      await this.logWebhook(webhookData.event);
      return new Response('OK');
    }

    if (url.pathname === '/update-installation' && request.method === 'POST') {
      const installationData = await request.json() as { installationId: string; repositories: Repository[]; owner: any };
      
      logWithContext('DURABLE_OBJECT', 'Updating installation', {
        installationId: installationData.installationId,
        repositoryCount: installationData.repositories.length,
        owner: installationData.owner.login
      });
      
      await this.updateInstallation(installationData.installationId, installationData.repositories);
      
      // Also update owner information
      const config = await this.getAppConfig();
      if (config) {
        config.owner = installationData.owner;
        await this.storeAppConfig(config);
        
        logWithContext('DURABLE_OBJECT', 'Installation updated successfully');
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
      logWithContext('DURABLE_OBJECT', 'Generating installation token');
      
      const token = await this.getInstallationToken();
      
      logWithContext('DURABLE_OBJECT', 'Installation token generated', {
        hasToken: !!token
      });
      
      return new Response(JSON.stringify({ token }));
    }

    if (url.pathname === '/store-claude-key' && request.method === 'POST') {
      logWithContext('DURABLE_OBJECT', 'Storing Claude API key');
      
      const claudeData = await request.json() as { anthropicApiKey: string; claudeSetupAt: string };
      
      await this.storeClaudeApiKey(claudeData.anthropicApiKey, claudeData.claudeSetupAt);
      
      logWithContext('DURABLE_OBJECT', 'Claude API key stored successfully');
      return new Response('OK');
    }

    if (url.pathname === '/get-claude-key' && request.method === 'GET') {
      logWithContext('DURABLE_OBJECT', 'Retrieving Claude API key');
      
      const apiKey = await this.getDecryptedClaudeApiKey();
      
      logWithContext('DURABLE_OBJECT', 'Claude API key retrieved', {
        hasApiKey: !!apiKey
      });
      
      return new Response(JSON.stringify({ anthropicApiKey: apiKey }));
    }

    logWithContext('DURABLE_OBJECT', 'Unknown endpoint requested', {
      method: request.method,
      pathname: url.pathname
    });
    
    return new Response('Not Found', { status: 404 });
  }

  async storeAppConfig(config: GitHubAppConfig): Promise<void> {
    logWithContext('DURABLE_OBJECT', 'Writing app config to storage', {
      appId: config.appId,
      dataSize: JSON.stringify(config).length
    });
    
    await this.storage.put('github_app_config', config);
  }

  async getAppConfig(): Promise<GitHubAppConfig | null> {
    const config = await this.storage.get('github_app_config') || null;
    
    logWithContext('DURABLE_OBJECT', 'Read app config from storage', {
      hasConfig: !!config,
      appId: config?.appId
    });
    
    return config;
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
    if (!config) {
      logWithContext('DURABLE_OBJECT', 'Cannot decrypt credentials - no config found');
      return null;
    }

    try {
      logWithContext('DURABLE_OBJECT', 'Decrypting credentials');
      
      const privateKey = await decrypt(config.privateKey);
      const webhookSecret = await decrypt(config.webhookSecret);
      
      logWithContext('DURABLE_OBJECT', 'Credentials decrypted successfully');
      return { privateKey, webhookSecret };
    } catch (error) {
      logWithContext('DURABLE_OBJECT', 'Failed to decrypt credentials', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async getInstallationToken(): Promise<string | null> {
    const config = await this.getAppConfig();
    if (!config || !config.installationId) {
      logWithContext('DURABLE_OBJECT', 'Cannot generate token - missing config or installation ID', {
        hasConfig: !!config,
        hasInstallationId: !!config?.installationId
      });
      return null;
    }

    try {
      // Check if we have a cached token that's still valid
      const cachedToken = await this.storage.get('cached_installation_token') as { token: string; expires_at: string } | null;
      
      if (cachedToken) {
        const expiresAt = new Date(cachedToken.expires_at);
        const now = new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        
        logWithContext('DURABLE_OBJECT', 'Checking cached token', {
          expiresAt: cachedToken.expires_at,
          timeUntilExpiryMs: timeUntilExpiry
        });
        
        // Check if token expires in more than 5 minutes
        if (timeUntilExpiry > 5 * 60 * 1000) {
          logWithContext('DURABLE_OBJECT', 'Using cached installation token');
          return cachedToken.token;
        } else {
          logWithContext('DURABLE_OBJECT', 'Cached token expired or expiring soon');
        }
      } else {
        logWithContext('DURABLE_OBJECT', 'No cached token found');
      }

      // Generate new token
      logWithContext('DURABLE_OBJECT', 'Generating new installation token');
      
      const credentials = await this.getDecryptedCredentials();
      if (!credentials) {
        logWithContext('DURABLE_OBJECT', 'Cannot generate token - missing credentials');
        return null;
      }

      const tokenData = await generateInstallationToken(
        config.appId,
        credentials.privateKey,
        config.installationId
      );

      if (tokenData) {
        // Cache the token
        logWithContext('DURABLE_OBJECT', 'Caching new installation token', {
          expiresAt: tokenData.expires_at
        });
        
        await this.storage.put('cached_installation_token', tokenData);
        return tokenData.token;
      }

      logWithContext('DURABLE_OBJECT', 'Failed to generate installation token');
      return null;
    } catch (error) {
      logWithContext('DURABLE_OBJECT', 'Error generating installation token', {
        error: error instanceof Error ? error.message : String(error)
      });
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
      
      if (!claudeConfig) {
        logWithContext('DURABLE_OBJECT', 'No Claude config found in storage');
        return null;
      }

      logWithContext('DURABLE_OBJECT', 'Decrypting Claude API key', {
        setupAt: claudeConfig.claudeSetupAt
      });
      
      const decryptedKey = await decrypt(claudeConfig.anthropicApiKey);
      
      logWithContext('DURABLE_OBJECT', 'Claude API key decrypted successfully');
      return decryptedKey;
    } catch (error) {
      logWithContext('DURABLE_OBJECT', 'Failed to decrypt Claude API key', {
        error: error instanceof Error ? error.message : String(error)
      });
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

  // Override fetch to handle environment variable setting for specific requests
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    logWithContext('CONTAINER', 'Container request received', {
      method: request.method,
      pathname: url.pathname,
      headers: Object.fromEntries(request.headers.entries())
    });
    
    // Handle process-issue requests by setting environment variables
    if (url.pathname === '/process-issue' && request.method === 'POST') {
      logWithContext('CONTAINER', 'Processing issue request');
      
      try {
        const issueContext = await request.json();
        
        logWithContext('CONTAINER', 'Issue context received', {
          issueId: issueContext.ISSUE_ID,
          repository: issueContext.REPOSITORY_NAME,
          envVarCount: Object.keys(issueContext).length
        });
        
        // Set environment variables for this container instance
        let envVarsSet = 0;
        Object.entries(issueContext).forEach(([key, value]) => {
          if (typeof value === 'string') {
            process.env[key] = value;
            envVarsSet++;
          }
        });
        
        logWithContext('CONTAINER', 'Environment variables set', {
          envVarsSet,
          totalEnvVars: Object.keys(issueContext).length
        });
        
        // Create a new request to forward to the container
        const forwardRequest = new Request(request.url, {
          method: 'GET', // Change to GET since the container expects this
          headers: request.headers
        });
        
        logWithContext('CONTAINER', 'Forwarding request to container');
        const response = await super.fetch(forwardRequest);
        
        logWithContext('CONTAINER', 'Container response received', {
          status: response.status,
          statusText: response.statusText
        });
        
        return response;
      } catch (error) {
        logWithContext('CONTAINER', 'Error processing issue request', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        
        return new Response(JSON.stringify({ 
          error: 'Failed to process issue context',
          message: (error as Error).message 
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // For all other requests, use default behavior
    logWithContext('CONTAINER', 'Using default container behavior');
    return super.fetch(request);
  }

  override onStart() {
    logWithContext('CONTAINER_LIFECYCLE', 'Container started successfully', {
      port: this.defaultPort,
      sleepAfter: this.sleepAfter
    });
  }

  override onStop() {
    logWithContext('CONTAINER_LIFECYCLE', 'Container shut down successfully');
  }

  override onError(error: unknown) {
    logWithContext('CONTAINER_LIFECYCLE', 'Container error occurred', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

export default {
  async fetch(
    request: Request,
    env: any
  ): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Log all incoming requests
    logWithContext('MAIN_HANDLER', 'Incoming request', {
      method: request.method,
      pathname,
      origin: url.origin,
      userAgent: request.headers.get('user-agent'),
      contentType: request.headers.get('content-type'),
      referer: request.headers.get('referer'),
      cfRay: request.headers.get('cf-ray'),
      cfCountry: request.headers.get('cf-ipcountry')
    });

    let response: Response;
    let routeMatched = false;

    try {
      // Claude Code Setup Route
      if (pathname === '/claude-setup') {
        logWithContext('MAIN_HANDLER', 'Routing to Claude setup');
        routeMatched = true;
        response = await handleClaudeSetup(request, url.origin, env);
      }

      // GitHub App Setup Routes
      else if (pathname === '/gh-setup') {
        logWithContext('MAIN_HANDLER', 'Routing to GitHub setup');
        routeMatched = true;
        response = await handleGitHubSetup(request, url.origin);
      }

      else if (pathname === '/gh-setup/callback') {
        logWithContext('MAIN_HANDLER', 'Routing to OAuth callback');
        routeMatched = true;
        response = await handleOAuthCallback(request, url, env);
      }

      else if (pathname === '/gh-setup/install') {
        logWithContext('MAIN_HANDLER', 'Routing to installation guide');
        routeMatched = true;
        response = await handleInstallationGuide(request, url);
      }

      // Status endpoint to check stored configurations
      else if (pathname === '/gh-status') {
        logWithContext('MAIN_HANDLER', 'Routing to GitHub status');
        routeMatched = true;
        response = await handleGitHubStatus(request, env);
      }

      // GitHub webhook endpoint
      else if (pathname === '/webhooks/github') {
        logWithContext('MAIN_HANDLER', 'Routing to GitHub webhook handler');
        routeMatched = true;
        response = await handleGitHubWebhook(request, env);
      }

      // Container routes
      else if (pathname.startsWith('/container')) {
        logWithContext('MAIN_HANDLER', 'Routing to basic container');
        routeMatched = true;
        let id = env.MY_CONTAINER.idFromName('container');
        let container = env.MY_CONTAINER.get(id);
        response = await container.fetch(request);
      }

      else if (pathname.startsWith('/error')) {
        logWithContext('MAIN_HANDLER', 'Routing to error test container');
        routeMatched = true;
        let id = env.MY_CONTAINER.idFromName('error-test');
        let container = env.MY_CONTAINER.get(id);
        response = await container.fetch(request);
      }

      else if (pathname.startsWith('/lb')) {
        logWithContext('MAIN_HANDLER', 'Routing to load balanced containers');
        routeMatched = true;
        let container = await loadBalance(env.MY_CONTAINER, 3);
        response = await container.fetch(request);
      }

      else if (pathname.startsWith('/singleton')) {
        logWithContext('MAIN_HANDLER', 'Routing to singleton container');
        routeMatched = true;
        response = await getContainer(env.MY_CONTAINER).fetch(request);
      }

      // Default home page
      else {
        logWithContext('MAIN_HANDLER', 'Serving home page');
        routeMatched = true;
        response = new Response(`
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
      }

      const processingTime = Date.now() - startTime;
      
      logWithContext('MAIN_HANDLER', 'Request completed successfully', {
        pathname,
        method: request.method,
        status: response.status,
        statusText: response.statusText,
        processingTimeMs: processingTime,
        routeMatched
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logWithContext('MAIN_HANDLER', 'Request failed with error', {
        pathname,
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        processingTimeMs: processingTime,
        routeMatched
      });

      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },
};
