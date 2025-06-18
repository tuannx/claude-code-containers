import { Container, getContainer, loadBalance } from 'cf-containers';
import { decrypt, generateInstallationToken } from './crypto';
import { handleClaudeSetup } from './handlers/claude';
import { handleGitHubSetup, handleGitHubStatus, handleGitHubWebhook } from './handlers/github';
import { handleInstallationGuide } from './handlers/guide';

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
      console.log(`🔐 [DO] Storing Claude API key...`);
      const claudeData = await request.json() as { anthropicApiKey: string; claudeSetupAt: string };
      console.log(`🔐 [DO] Received Claude data - Key length: ${claudeData.anthropicApiKey?.length || 0}, Timestamp: ${claudeData.claudeSetupAt}`);
      await this.storeClaudeApiKey(claudeData.anthropicApiKey, claudeData.claudeSetupAt);
      console.log(`✅ [DO] Claude API key stored successfully`);
      return new Response('OK');
    }

    if (url.pathname === '/get-claude-key' && request.method === 'GET') {
      console.log(`🔍 [DO] Retrieving Claude API key...`);
      const apiKey = await this.getDecryptedClaudeApiKey();
      console.log(`🔍 [DO] Retrieved API key: ${apiKey ? 'Found' : 'Not Found'} (length: ${apiKey?.length || 0})`);
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
    console.log(`💾 [DO] Starting storage of Claude API key...`);
    console.log(`💾 [DO] Encrypted key length: ${encryptedApiKey.length}`);
    console.log(`💾 [DO] Timestamp: ${setupTimestamp}`);
    
    // Store in a separate key for easier management
    const claudeConfig = {
      anthropicApiKey: encryptedApiKey,
      claudeSetupAt: setupTimestamp
    };
    
    await this.storage.put('claude_config', claudeConfig);
    console.log(`✅ [DO] Claude config stored in 'claude_config' key`);
    
    // Verify storage by reading it back
    const verification = await this.storage.get('claude_config');
    console.log(`🔍 [DO] Storage verification - Found: ${!!verification}`);
  }

  async getDecryptedClaudeApiKey(): Promise<string | null> {
    try {
      console.log(`🔍 [DO] Looking for Claude config in storage...`);
      const claudeConfig = await this.storage.get('claude_config') as { anthropicApiKey: string; claudeSetupAt: string } | null;
      console.log(`🔍 [DO] Claude config found: ${!!claudeConfig}`);
      
      if (!claudeConfig) {
        console.log(`❌ [DO] No Claude config found in storage`);
        // Let's also check what keys exist in storage
        const allKeys = await this.storage.list();
        console.log(`🔍 [DO] Available storage keys:`, Object.keys(allKeys));
        return null;
      }

      console.log(`🔐 [DO] Attempting to decrypt API key...`);
      console.log(`🔐 [DO] Encrypted key length: ${claudeConfig.anthropicApiKey?.length || 0}`);
      const decryptedKey = await decrypt(claudeConfig.anthropicApiKey);
      console.log(`✅ [DO] Decryption successful - Key length: ${decryptedKey?.length || 0}`);
      return decryptedKey;
    } catch (error) {
      console.error(`❌ [DO] Failed to decrypt Claude API key:`, error);
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
    console.log(`🔧 [CONTAINER] Received request: ${request.method} ${url.pathname}`);
    console.log(`🔧 [CONTAINER] Request headers:`, Object.fromEntries(request.headers.entries()));

    // Handle process-issue requests by setting environment variables
    if (url.pathname === '/process-issue' && request.method === 'POST') {
      console.log(`📋 [CONTAINER] Processing issue request...`);

      try {
        const requestBody = await request.text();
        console.log(`📄 [CONTAINER] Request body length: ${requestBody.length}`);
        console.log(`📄 [CONTAINER] Request body preview: ${requestBody.substring(0, 200)}...`);

        const issueContext = JSON.parse(requestBody);
        console.log(`📝 [CONTAINER] Parsed issue context:`, {
          ISSUE_ID: issueContext.ISSUE_ID,
          ISSUE_NUMBER: issueContext.ISSUE_NUMBER,
          REPOSITORY_NAME: issueContext.REPOSITORY_NAME,
          hasClaudeKey: !!issueContext.ANTHROPIC_API_KEY,
          hasGitHubToken: !!issueContext.GITHUB_TOKEN
        });

        // Set environment variables for this container instance
        let envVarsSet = 0;
        Object.entries(issueContext).forEach(([key, value]) => {
          if (typeof value === 'string') {
            process.env[key] = value;
            envVarsSet++;
          }
        });

        console.log(`✅ [CONTAINER] Environment variables set: ${envVarsSet} variables`);
        console.log(`🔧 [CONTAINER] Key environment variables:`);
        console.log(`   - ISSUE_ID: ${process.env.ISSUE_ID}`);
        console.log(`   - REPOSITORY_URL: ${process.env.REPOSITORY_URL}`);
        console.log(`   - ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Missing'}`);
        console.log(`   - GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? 'Set' : 'Missing'}`);

        // Create a new request to forward to the container
        console.log(`🚀 [CONTAINER] Forwarding to container application...`);
        const forwardRequest = new Request(request.url, {
          method: 'GET', // Change to GET since the container expects this
          headers: request.headers
        });

        const response = await super.fetch(forwardRequest);
        console.log(`📊 [CONTAINER] Container application response: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [CONTAINER] Container application error:`, errorText);
          return new Response(errorText, {
            status: response.status,
            headers: response.headers
          });
        }

        console.log(`✅ [CONTAINER] Container application success`);
        return response;

      } catch (error) {
        console.error(`❌ [CONTAINER] Error processing issue request:`, error);
        console.error(`❌ [CONTAINER] Error stack:`, (error as Error).stack);
        return new Response(JSON.stringify({
          error: 'Failed to process issue context',
          message: (error as Error).message,
          stack: (error as Error).stack
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // For all other requests, use default behavior
    console.log(`🔄 [CONTAINER] Forwarding non-process-issue request to default handler`);
    return super.fetch(request);
  }

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
