import * as http from 'http';
import { promises as fs } from 'fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import simpleGit from 'simple-git';
import * as path from 'path';
import { spawn } from 'child_process';
import { ContainerGitHubClient } from './github_client.js';

const PORT = 8080;

// Simplified container response interface
interface ContainerResponse {
  success: boolean;
  message: string;
  error?: string;
}

// Environment variables
const MESSAGE = process.env.MESSAGE || 'Hello from Claude Code Container';
const INSTANCE_ID = process.env.CLOUDFLARE_DEPLOYMENT_ID || 'unknown';

// Types
interface IssueContext {
  issueId: string;
  issueNumber: string;
  title: string;
  description: string;
  labels: string[];
  repositoryUrl: string;
  repositoryName: string;
  author: string;
}

interface HealthStatus {
  status: string;
  message: string;
  instanceId: string;
  timestamp: string;
  claudeCodeAvailable: boolean;
  githubTokenAvailable: boolean;
}



// Enhanced logging utility with context
function logWithContext(context: string, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${context}] ${message}`;

  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
}

// Basic health check handler
async function healthHandler(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  logWithContext('HEALTH', 'Health check requested');

  const response: HealthStatus = {
    status: 'healthy',
    message: MESSAGE,
    instanceId: INSTANCE_ID,
    timestamp: new Date().toISOString(),
    claudeCodeAvailable: !!process.env.ANTHROPIC_API_KEY,
    githubTokenAvailable: !!process.env.GITHUB_TOKEN
  };

  logWithContext('HEALTH', 'Health check response', {
    status: response.status,
    claudeCodeAvailable: response.claudeCodeAvailable,
    githubTokenAvailable: response.githubTokenAvailable,
    instanceId: response.instanceId
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

// Error handler for testing
async function errorHandler(_req: http.IncomingMessage, _res: http.ServerResponse): Promise<void> {
  throw new Error('This is a test error from the container');
}

// Setup isolated workspace for issue processing using proper git clone
async function setupWorkspace(repositoryUrl: string, issueNumber: string): Promise<string> {
  const workspaceDir = `/tmp/workspace/issue-${issueNumber}`;

  logWithContext('WORKSPACE', 'Setting up workspace with git clone', {
    workspaceDir,
    repositoryUrl,
    issueNumber
  });

  try {
    // Create parent workspace directory
    await fs.mkdir(path.dirname(workspaceDir), { recursive: true });
    logWithContext('WORKSPACE', 'Parent workspace directory created');

    const cloneStartTime = Date.now();

    // Get GitHub token for authenticated cloning
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GitHub token not available for cloning');
    }

    // Construct authenticated clone URL
    const authenticatedUrl = repositoryUrl.replace(
      'https://github.com/',
      `https://x-access-token:${githubToken}@github.com/`
    );

    logWithContext('WORKSPACE', 'Starting git clone');

    // Clone repository using git command
    await new Promise<void>((resolve, reject) => {
      const gitProcess = spawn('git', ['clone', authenticatedUrl, workspaceDir], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      gitProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      gitProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      gitProcess.on('close', (code: number) => {
        if (code === 0) {
          logWithContext('WORKSPACE', 'Git clone completed successfully', {
            stdout: stdout.substring(0, 200),
            stderr: stderr.substring(0, 200)
          });
          resolve();
        } else {
          logWithContext('WORKSPACE', 'Git clone failed', {
            code,
            stdout,
            stderr
          });
          reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
        }
      });
    });

    const cloneTime = Date.now() - cloneStartTime;

    // Initialize git workspace for our workflow
    await initializeGitWorkspace(workspaceDir);

    logWithContext('WORKSPACE', 'Git repository cloned and configured successfully', {
      cloneTimeMs: cloneTime
    });

    return workspaceDir;
  } catch (error) {
    logWithContext('WORKSPACE', 'Error setting up workspace', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      repositoryUrl,
      workspaceDir
    });
    throw error;
  }
}

// Initialize git workspace for proper developer workflow
async function initializeGitWorkspace(workspaceDir: string): Promise<void> {
  logWithContext('GIT_WORKSPACE', 'Configuring git workspace for development', { workspaceDir });

  const git = simpleGit(workspaceDir);

  try {
    // Configure git user (this is already a cloned repo, so no need to init)
    await git.addConfig('user.name', 'Claude Code Bot');
    await git.addConfig('user.email', 'claude-code@anthropic.com');

    // Fetch latest changes to ensure we're up to date
    await git.fetch('origin');

    // Get current branch info
    const status = await git.status();
    const currentBranch = status.current;

    logWithContext('GIT_WORKSPACE', 'Git workspace configured', {
      currentBranch,
      isClean: status.isClean(),
      ahead: status.ahead,
      behind: status.behind
    });

    // Ensure we're on the latest default branch
    if (status.behind > 0) {
      logWithContext('GIT_WORKSPACE', 'Pulling latest changes from remote');
      await git.pull('origin', currentBranch || 'main');
    }

  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'Error configuring git workspace', {
      error: (error as Error).message
    });
    throw error;
  }
}

// Detect if there are any new commits on the current branch
async function detectNewCommits(workspaceDir: string): Promise<boolean> {
  logWithContext('GIT_WORKSPACE', 'Detecting new commits', { workspaceDir });

  const git = simpleGit(workspaceDir);

  try {
    // Get the current branch status
    const status = await git.status();
    const hasNewCommits = status.ahead > 0;

    // Also get recent commits to see what was added
    const log = await git.log({ maxCount: 5 });

    logWithContext('GIT_WORKSPACE', 'New commit detection result', {
      hasNewCommits,
      ahead: status.ahead,
      behind: status.behind,
      currentBranch: status.current,
      recentCommits: log.all.slice(0, 3).map(commit => ({
        hash: commit.hash.substring(0, 8),
        message: commit.message,
        author: commit.author_name,
        date: commit.date
      }))
    });

    return hasNewCommits;
  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'Error detecting new commits', {
      error: (error as Error).message
    });
    return false;
  }
}

// Push existing commits to remote (Claude handles commits, we handle push)
async function pushCommitsToRemote(workspaceDir: string): Promise<string> {
  logWithContext('GIT_WORKSPACE', 'Pushing commits to remote', { workspaceDir });

  const git = simpleGit(workspaceDir);

  try {
    // Get current branch info
    const status = await git.status();
    const currentBranch = status.current;

    if (!currentBranch) {
      throw new Error('No current branch detected');
    }

    // Get the latest commit hash
    const log = await git.log({ maxCount: 1 });
    const latestCommit = log.latest;

    if (!latestCommit) {
      throw new Error('No commits found');
    }

    logWithContext('GIT_WORKSPACE', 'Pushing current branch to remote', {
      branch: currentBranch,
      commitHash: latestCommit.hash.substring(0, 8),
      commitMessage: latestCommit.message,
      ahead: status.ahead
    });

    // Push current branch to remote with upstream tracking
    await git.push('origin', currentBranch, ['--set-upstream']);

    logWithContext('GIT_WORKSPACE', 'Commits pushed to remote successfully', {
      branch: currentBranch,
      commitCount: status.ahead
    });

    return latestCommit.hash;
  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'Error pushing commits to remote', {
      error: (error as Error).message
    });
    throw error;
  }
}

// Read PR summary from .claude-pr-summary.md file in /tmp directory
async function readPRSummary(issueNumber: string): Promise<string | null> {
  const summaryPath = `/tmp/.claude-pr-summary.md`;

  try {
    const content = await fs.readFile(summaryPath, 'utf8');
    logWithContext('GIT_WORKSPACE', 'PR summary read successfully', {
      contentLength: content.length,
      summaryPath
    });
    return content.trim();
  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'No PR summary file found or error reading', {
      summaryPath,
      error: (error as Error).message
    });
    return null;
  }
}

// Prepare prompt for Claude Code
function prepareClaudePrompt(issueContext: IssueContext): string {
  return `
You are working on GitHub issue #${issueContext.issueNumber}: "${issueContext.title}"

Issue Description:
${issueContext.description}

Labels: ${issueContext.labels.join(', ')}
Author: ${issueContext.author}

The repository has been cloned to your current working directory. Please:
1. Explore the codebase to understand the structure and relevant files
2. Analyze the issue requirements thoroughly
3. Implement a solution that addresses the issue
4. Write appropriate tests if needed
5. Ensure code quality and consistency with existing patterns
6. **CREATE A NEW BRANCH AND COMMIT YOUR CHANGES**: After making changes, create a new branch and commit your changes using good commit message practices. DO NOT PUSH to remote - just commit locally.

## Git Commit Best Practices

When you commit your changes, please follow these seven rules of a great Git commit message:

1. Separate subject from body with a blank line
2. Limit the subject line to 50 characters
3. Capitalize the subject line
4. Do not end the subject line with a period
5. Use the imperative mood in the subject line
6. Wrap the body at 72 characters
7. Use the body to explain what and why vs. how

Example format:
\`\`\`
Summarize changes in around 50 characters or less

More detailed explanatory text, if necessary. Wrap it to about 72
characters or so. In some contexts, the first line is treated as the
subject of the commit and the rest of the text as the body. The
blank line separating the summary from the body is critical (unless
you omit the body entirely); various tools like 'log', 'shortlog'
and 'rebase' can get confused if you run the two together.

Explain the problem that this commit is solving. Focus on why you
are making this change as opposed to how (the code explains that).
Are there side effects or other unintuitive consequences of this
change? Here's the place to explain them.

Further paragraphs come after blank lines.

 - Bullet points are okay, too
 - Typically a hyphen or asterisk is used for the bullet, preceded
   by a single space, with blank lines in between, but conventions
   vary here

Resolves: #${issueContext.issueNumber}
See also: #456, #789 (if applicable)
\`\`\`

**IMPORTANT: After you create a new branch and commit your changes locally (DO NOT PUSH), please create a file called '.claude-pr-summary.md' in the /tmp directory with a pull request summary. The first line should be the PR title (under 50 characters), and the rest should be the PR description. Include 'Fixes #${issueContext.issueNumber}' in the description. For example:**

\`\`\`
Fix authentication timeout bug

This commit resolves the authentication timeout issue that was causing
users to be logged out unexpectedly after 5 minutes of inactivity.

- Updated session timeout from 5 minutes to 30 minutes
- Added proper cleanup for expired sessions
- Improved error handling for timeout scenarios

Fixes #${issueContext.issueNumber}
\`\`\`

**WORKFLOW SUMMARY:**
1. Implement your solution
2. Create a new branch (e.g., \`git checkout -b fix-issue-${issueContext.issueNumber}\`)
3. Commit your changes with a good commit message (following the rules above)
4. Create the PR summary file in /tmp directory
5. DO NOT PUSH - our system will handle pushing and PR creation automatically

Work step by step and provide clear explanations of your approach.
`;
}


// Process issue with Claude Code and handle GitHub operations directly
async function processIssue(issueContext: IssueContext, githubToken: string): Promise<ContainerResponse> {
  logWithContext('ISSUE_PROCESSOR', 'Starting issue processing', {
    repositoryName: issueContext.repositoryName,
    issueNumber: issueContext.issueNumber,
    title: issueContext.title
  });

  const results: SDKMessage[] = [];
  let turnCount = 0;

  try {
    // 1. Setup workspace with repository clone
    const workspaceDir = await setupWorkspace(issueContext.repositoryUrl, issueContext.issueNumber);

    logWithContext('ISSUE_PROCESSOR', 'Workspace setup completed', {
      workspaceDir
    });

    // 2. Initialize GitHub client
    const [owner, repo] = issueContext.repositoryName.split('/');
    const githubClient = new ContainerGitHubClient(githubToken, owner, repo);

    logWithContext('ISSUE_PROCESSOR', 'GitHub client initialized', {
      owner,
      repo
    });

    // 3. Prepare prompt for Claude Code
    const prompt = prepareClaudePrompt(issueContext);
    logWithContext('ISSUE_PROCESSOR', 'Claude prompt prepared', {
      promptLength: prompt.length
    });

    // 4. Query Claude Code in the workspace directory
    logWithContext('ISSUE_PROCESSOR', 'Starting Claude Code query');

    try {
      const claudeStartTime = Date.now();

      // Change working directory to the cloned repository
      const originalCwd = process.cwd();
      process.chdir(workspaceDir);

      logWithContext('CLAUDE_CODE', 'Changed working directory for Claude Code execution', {
        originalCwd,
        newCwd: workspaceDir
      });

      try {
        for await (const message of query({
          prompt,
          options: { permissionMode: 'bypassPermissions' }
        })) {
        turnCount++;
        results.push(message);

        // Log message details (message structure depends on SDK version)
        logWithContext('CLAUDE_CODE', `Turn ${turnCount} completed`, {
          type: message.type,
          messagePreview: JSON.stringify(message),
          turnCount,
        });
      }

      const claudeEndTime = Date.now();
      const claudeDuration = claudeEndTime - claudeStartTime;

      logWithContext('ISSUE_PROCESSOR', 'Claude Code query completed', {
        totalTurns: turnCount,
        duration: claudeDuration,
        resultsCount: results.length
      });

      // 5. Check for new commits (Claude should have created commits)
      const hasNewCommits = await detectNewCommits(workspaceDir);
      logWithContext('ISSUE_PROCESSOR', 'New commit detection completed', { hasNewCommits });

      // 6. Get solution text from Claude Code
      let solution = '';
      if (results.length > 0) {
        const lastResult = results[results.length - 1];
        solution = getMessageText(lastResult);
      }

      if (hasNewCommits) {
        // Push commits to remote (Claude created commits, we just push them)
        const commitSha = await pushCommitsToRemote(workspaceDir);

        logWithContext('ISSUE_PROCESSOR', 'Commits pushed to remote successfully', {
          commitSha: commitSha.substring(0, 8)
        });

        // Try to read PR summary from /tmp directory
        const prSummary = await readPRSummary(issueContext.issueNumber);

        // Create pull request
        try {
          const repoInfo = await githubClient.getRepository();
          const { title: prTitle, body: prBody } = parsePRSummary(prSummary, issueContext.issueNumber);

          // Get current branch name for the PR
          const git = simpleGit(workspaceDir);
          const status = await git.status();
          const currentBranch = status.current;

          if (!currentBranch) {
            throw new Error('No current branch detected for PR creation');
          }

          const pullRequest = await githubClient.createPullRequest(
            prTitle,
            prBody,
            currentBranch,
            repoInfo.default_branch
          );

          logWithContext('ISSUE_PROCESSOR', 'Pull request created successfully', {
            prNumber: pullRequest.number,
            prUrl: pullRequest.html_url,
            prTitle,
            branch: currentBranch
          });

          // Post comment linking to the PR
          await githubClient.createComment(
            parseInt(issueContext.issueNumber),
            `🔧 I've created a pull request with a potential fix: ${pullRequest.html_url}\n\n${solution}\n\n---\n🤖 Generated with [Claude Code](https://claude.ai/code)`
          );

          return {
            success: true,
            message: `Pull request created successfully: ${pullRequest.html_url}`
          };
        } catch (prError) {
          logWithContext('ISSUE_PROCESSOR', 'Failed to create pull request, posting comment instead', {
            error: (prError as Error).message
          });

          // Fall back to posting a comment with the solution
          await githubClient.createComment(
            parseInt(issueContext.issueNumber),
            `${solution}\n\n---\n⚠️ **Note:** I attempted to create a pull request with code changes, but encountered an error: ${(prError as Error).message}\n\nThe solution above describes the changes that should be made.\n\n🤖 Generated with [Claude Code](https://claude.ai/code)`
          );

          return {
            success: true,
            message: 'Solution posted as comment (PR creation failed)'
          };
        }
      } else {
        // No new commits, just post solution as comment
        await githubClient.createComment(
          parseInt(issueContext.issueNumber),
          `${solution}\n\n---\n🤖 Generated with [Claude Code](https://claude.ai/code)`
        );

        return {
          success: true,
          message: 'Solution posted as comment (no new commits)'
        };
      }

      } catch (claudeError) {
        logWithContext('ISSUE_PROCESSOR', 'Error during Claude Code query', {
          error: (claudeError as Error).message,
          turnCount,
          resultsCount: results.length
        });
        throw claudeError;
      } finally {
        // Always restore the original working directory
        process.chdir(originalCwd);
        logWithContext('CLAUDE_CODE', 'Restored original working directory', { originalCwd });
      }

    } catch (outerError) {
      logWithContext('ISSUE_PROCESSOR', 'Error in Claude Code execution setup', {
        error: (outerError as Error).message,
        turnCount,
        resultsCount: results.length
      });
      throw outerError;
    }

  } catch (error) {
    logWithContext('ISSUE_PROCESSOR', 'Error processing issue', {
      error: (error as Error).message,
      repositoryName: issueContext.repositoryName,
      issueNumber: issueContext.issueNumber,
      turnCount,
      resultsCount: results.length
    });

    return {
      success: false,
      message: 'Failed to process issue',
      error: (error as Error).message
    };
  }
}

// Parse PR summary to extract title and body
function parsePRSummary(prSummary: string | null, issueNumber: string): { title: string; body: string } {
  if (!prSummary) {
    return {
      title: `Fix issue #${issueNumber}`,
      body: `Automated fix generated by Claude Code.\n\nFixes #${issueNumber}\n\n🤖 This pull request was generated automatically by [Claude Code](https://claude.ai/code) in response to the issue above.`
    };
  }

  const lines = prSummary.trim().split('\n');
  const title = lines[0].trim();
  const body = lines.slice(1).join('\n').trim();

  // Ensure the body includes the fix reference if not already present
  let finalBody = body;
  if (!finalBody.toLowerCase().includes(`fixes #${issueNumber}`) && !finalBody.toLowerCase().includes(`resolves #${issueNumber}`)) {
    finalBody += `\n\nFixes #${issueNumber}`;
  }

  // Add automation footer
  finalBody += `\n\n🤖 This pull request was generated automatically by [Claude Code](https://claude.ai/code) in response to the issue above.`;

  return { title, body: finalBody };
}

// Main issue processing handler
async function processIssueHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  logWithContext('ISSUE_HANDLER', 'Processing issue request');

  // Read request body to get environment variables if they're passed in the request
  let requestBody = '';
  for await (const chunk of req) {
    requestBody += chunk;
  }

  let issueContextFromRequest: any = {};
  if (requestBody) {
    try {
      issueContextFromRequest = JSON.parse(requestBody);
      logWithContext('ISSUE_HANDLER', 'Received issue context in request body', {
        hasAnthropicKey: !!issueContextFromRequest.ANTHROPIC_API_KEY,
        hasGithubToken: !!issueContextFromRequest.GITHUB_TOKEN,
        keysReceived: Object.keys(issueContextFromRequest)
      });

      // Set environment variables from request body if they exist
      if (issueContextFromRequest.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = issueContextFromRequest.ANTHROPIC_API_KEY;
      }
      if (issueContextFromRequest.GITHUB_TOKEN) {
        process.env.GITHUB_TOKEN = issueContextFromRequest.GITHUB_TOKEN;
      }
      if (issueContextFromRequest.ISSUE_ID) {
        process.env.ISSUE_ID = issueContextFromRequest.ISSUE_ID;
      }
      if (issueContextFromRequest.ISSUE_NUMBER) {
        process.env.ISSUE_NUMBER = issueContextFromRequest.ISSUE_NUMBER;
      }
      if (issueContextFromRequest.ISSUE_TITLE) {
        process.env.ISSUE_TITLE = issueContextFromRequest.ISSUE_TITLE;
      }
      if (issueContextFromRequest.ISSUE_BODY) {
        process.env.ISSUE_BODY = issueContextFromRequest.ISSUE_BODY;
      }
      if (issueContextFromRequest.ISSUE_LABELS) {
        process.env.ISSUE_LABELS = issueContextFromRequest.ISSUE_LABELS;
      }
      if (issueContextFromRequest.REPOSITORY_URL) {
        process.env.REPOSITORY_URL = issueContextFromRequest.REPOSITORY_URL;
      }
      if (issueContextFromRequest.REPOSITORY_NAME) {
        process.env.REPOSITORY_NAME = issueContextFromRequest.REPOSITORY_NAME;
      }
      if (issueContextFromRequest.ISSUE_AUTHOR) {
        process.env.ISSUE_AUTHOR = issueContextFromRequest.ISSUE_AUTHOR;
      }

      logWithContext('ISSUE_HANDLER', 'Environment variables updated from request', {
        anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
        githubTokenSet: !!process.env.GITHUB_TOKEN,
        issueIdSet: !!process.env.ISSUE_ID
      });
    } catch (error) {
      logWithContext('ISSUE_HANDLER', 'Error parsing request body', {
        error: (error as Error).message,
        bodyLength: requestBody.length
      });
    }
  }

  // Check for API key (now potentially updated from request)
  if (!process.env.ANTHROPIC_API_KEY) {
    logWithContext('ISSUE_HANDLER', 'Missing Anthropic API key');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not provided' }));
    return;
  }

  if (!process.env.ISSUE_ID || !process.env.REPOSITORY_URL) {
    logWithContext('ISSUE_HANDLER', 'Missing issue context', {
      hasIssueId: !!process.env.ISSUE_ID,
      hasRepositoryUrl: !!process.env.REPOSITORY_URL
    });
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Issue context not provided' }));
    return;
  }

  const issueContext: IssueContext = {
    issueId: process.env.ISSUE_ID!,
    issueNumber: process.env.ISSUE_NUMBER!,
    title: process.env.ISSUE_TITLE!,
    description: process.env.ISSUE_BODY!,
    labels: process.env.ISSUE_LABELS ? JSON.parse(process.env.ISSUE_LABELS) : [],
    repositoryUrl: process.env.REPOSITORY_URL!,
    repositoryName: process.env.REPOSITORY_NAME!,
    author: process.env.ISSUE_AUTHOR!
  };

  logWithContext('ISSUE_HANDLER', 'Issue context prepared', {
    issueId: issueContext.issueId,
    issueNumber: issueContext.issueNumber,
    repository: issueContext.repositoryName,
    author: issueContext.author,
    labelsCount: issueContext.labels.length
  });

  // Process issue and return structured response
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN is required but not provided');
    }

    const containerResponse = await processIssue(issueContext, githubToken);

    logWithContext('ISSUE_HANDLER', 'Issue processing completed', {
      success: containerResponse.success,
      message: containerResponse.message,
      hasError: !!containerResponse.error
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(containerResponse));
  } catch (error) {
    logWithContext('ISSUE_HANDLER', 'Issue processing failed', {
      error: error instanceof Error ? error.message : String(error),
      issueId: issueContext.issueId
    });

    const errorResponse: ContainerResponse = {
      success: false,
      message: 'Failed to process issue',
      error: error instanceof Error ? error.message : String(error)
    };

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
  }
}

// Route handler
async function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const { method, url } = req;
  const startTime = Date.now();

  logWithContext('REQUEST_HANDLER', 'Incoming request', {
    method,
    url,
    headers: req.headers,
    remoteAddress: req.socket.remoteAddress
  });

  try {
    if (url === '/' || url === '/container') {
      logWithContext('REQUEST_HANDLER', 'Routing to health handler');
      await healthHandler(req, res);
    } else if (url === '/error') {
      logWithContext('REQUEST_HANDLER', 'Routing to error handler');
      await errorHandler(req, res);
    } else if (url === '/process-issue') {
      logWithContext('REQUEST_HANDLER', 'Routing to process issue handler');
      await processIssueHandler(req, res);
    } else {
      logWithContext('REQUEST_HANDLER', 'Route not found', { url });
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }

    const processingTime = Date.now() - startTime;
    logWithContext('REQUEST_HANDLER', 'Request completed successfully', {
      method,
      url,
      processingTimeMs: processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;

    logWithContext('REQUEST_HANDLER', 'Request handler error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      method,
      url,
      processingTimeMs: processingTime
    });

    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal server error',
      message: (error as Error).message
    }));
  }
}

// Start server
const server = http.createServer(requestHandler);

server.listen(PORT, () => {
  logWithContext('SERVER', 'Claude Code container server started', {
    port: PORT,
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  });

  logWithContext('SERVER', 'Configuration check', {
    claudeCodeAvailable: !!process.env.ANTHROPIC_API_KEY,
    githubTokenAvailable: !!process.env.GITHUB_TOKEN,
    issueContext: !!process.env.ISSUE_ID,
    environment: {
      instanceId: INSTANCE_ID,
      message: MESSAGE,
      issueId: process.env.ISSUE_ID,
      repositoryName: process.env.REPOSITORY_NAME
    }
  });
});

// Error handling for server
server.on('error', (error) => {
  logWithContext('SERVER', 'Server error', {
    error: error.message,
    code: (error as any).code,
    stack: error.stack
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logWithContext('SERVER', 'Received SIGTERM, shutting down gracefully');

  server.close(() => {
    logWithContext('SERVER', 'Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logWithContext('SERVER', 'Received SIGINT, shutting down gracefully');

  server.close(() => {
    logWithContext('SERVER', 'Server closed successfully');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logWithContext('SERVER', 'Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logWithContext('SERVER', 'Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise)
  });
});

// Helper function to extract text from SDK message
function getMessageText(message: SDKMessage): string {
  // Handle different message types from the SDK
  if ('content' in message && typeof message.content === 'string') {
    return message.content;
  }
  if ('text' in message && typeof message.text === 'string') {
    return message.text;
  }
  // If message has content array, extract text from it
  if ('content' in message && Array.isArray(message.content)) {
    const textContent = message.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n\n');

    if (textContent.trim()) {
      return textContent;
    }
  }

  // Try to extract from message object if it has a message property
  if ('message' in message && message.message && typeof message.message === 'object') {
    const msg = message.message as any;
    if ('content' in msg && Array.isArray(msg.content)) {
      const textContent = msg.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n\n');

      if (textContent.trim()) {
        return textContent;
      }
    }
  }

  // Last resort: return a generic message instead of JSON
  return JSON.stringify(message);
}
