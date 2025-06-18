import { GitHubAPI } from "../../github";

// Handle issues events
export async function handleIssuesEvent(data: any, env: any, configDO: any): Promise<Response> {
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

            // Post detailed error comment with debugging info
            try {
                const timestamp = new Date().toISOString();
                await githubAPI.createComment(
                    repository.owner.login,
                    repository.name,
                    issue.number,
                    `❌ I encountered an error while setting up to work on this issue: ${error.message}

**Debug Information:**
- Timestamp: ${timestamp}
- Issue ID: ${issue.id}
- Repository: ${repository.full_name}
- Error Type: ${error.name || 'Unknown'}

**Next Steps:**
Please check the Cloudflare Worker logs for detailed error information. The logs will contain comprehensive debugging output to help identify the root cause.

I'll need human assistance to resolve this.`
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
  console.log(`🚀 [ROUTE] Starting container routing for issue #${issue.number} (ID: ${issue.id})`);
  console.log(`📋 [ROUTE] Issue title: "${issue.title}"`);
  console.log(`📦 [ROUTE] Repository: ${repository.full_name}`);

  // Create unique container for this issue
  const containerName = `claude-issue-${issue.id}`;
  console.log(`🔗 [ROUTE] Creating container: ${containerName}`);

  try {
    const id = env.MY_CONTAINER.idFromName(containerName);
    const container = env.MY_CONTAINER.get(id);
    console.log(`✅ [ROUTE] Container instance created successfully`);

    // Get installation token for GitHub API access
    console.log(`🔑 [ROUTE] Fetching GitHub installation token...`);
    const tokenResponse = await configDO.fetch(new Request('http://internal/get-installation-token'));
    console.log(`📊 [ROUTE] Token response status: ${tokenResponse.status}`);

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get installation token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as { token: string };
    console.log(`✅ [ROUTE] GitHub token retrieved (length: ${tokenData.token?.length || 0})`);

    // Get Claude API key from secure storage
    console.log(`🤖 [ROUTE] Fetching Claude API key...`);
    const claudeConfigId = env.GITHUB_APP_CONFIG.idFromName('claude-config');
    const claudeConfigDO = env.GITHUB_APP_CONFIG.get(claudeConfigId);
    const claudeKeyResponse = await claudeConfigDO.fetch(new Request('http://internal/get-claude-key'));
    console.log(`📊 [ROUTE] Claude key response status: ${claudeKeyResponse.status}`);

    if (!claudeKeyResponse.ok) {
      throw new Error(`Failed to get Claude API key: ${claudeKeyResponse.status}`);
    }

    const claudeKeyData = await claudeKeyResponse.json() as { anthropicApiKey: string | null };
    console.log(`✅ [ROUTE] Claude API key retrieved: ${claudeKeyData.anthropicApiKey ? 'Yes' : 'No'}`);

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

    console.log(`📝 [ROUTE] Issue context prepared:`);
    console.log(`   - Issue ID: ${issueContext.ISSUE_ID}`);
    console.log(`   - Issue Number: ${issueContext.ISSUE_NUMBER}`);
    console.log(`   - Repository URL: ${issueContext.REPOSITORY_URL}`);
    console.log(`   - Repository Name: ${issueContext.REPOSITORY_NAME}`);
    console.log(`   - Author: ${issueContext.ISSUE_AUTHOR}`);
    console.log(`   - Has Claude Key: ${!!issueContext.ANTHROPIC_API_KEY}`);
    console.log(`   - Has GitHub Token: ${!!issueContext.GITHUB_TOKEN}`);

    // Start Claude Code processing by calling the container
    console.log(`🚀 [ROUTE] Sending request to container...`);
    const response = await container.fetch(new Request('http://internal/process-issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(issueContext)
    }));

    console.log(`📊 [ROUTE] Container response received - Status: ${response.status}`);
    console.log(`📊 [ROUTE] Container response headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ [ROUTE] Container error response body:`, errorBody);
      throw new Error(`Container returned status ${response.status}: ${errorBody}`);
    }

    const responseBody = await response.text();
    console.log(`✅ [ROUTE] Container success response:`, responseBody);

  } catch (error) {
    console.error(`❌ [ROUTE] Failed to start Claude Code processing:`, error);
    console.error(`❌ [ROUTE] Error details:`, {
      message: (error as Error).message,
      stack: (error as Error).stack
    });
    throw error;
  }
}
