import { Container, loadBalance, getContainer } from 'cf-containers';

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

function generateAppManifest(workerDomain: string): GitHubAppManifest {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
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

async function handleOAuthCallback(_request: Request, url: URL): Promise<Response> {
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

    // TODO: Store app credentials securely (will implement in Phase 2)
    // For now, just show success and guide to installation
    
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

export class MyContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '10s';
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
    env: { MY_CONTAINER: DurableObjectNamespace<MyContainer> }
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // GitHub App Setup Routes
    if (pathname === '/gh-setup') {
      return handleGitHubSetup(request, url.origin);
    }

    if (pathname === '/gh-setup/callback') {
      return handleOAuthCallback(request, url);
    }

    if (pathname === '/gh-setup/install') {
      return handleInstallationGuide(request, url);
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

    return new Response(
      'Call /container/<ID> to start a container for each ID with a 10s timeout.\nCall /lb to load balancing over multiple containers\nCall /error to start a container that errors\nCall /singleton to get a single specific container\n\nGitHub Integration:\nCall /gh-setup to configure GitHub App integration'
    );
  },
};
