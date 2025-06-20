import * as http from 'http';
import { promises as fs } from 'fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import simpleGit from 'simple-git';
import * as path from 'path';
import { spawn } from 'child_process';

const PORT = 8080;

// Container response interface for PR creation
interface ContainerResponse {
  success: boolean;
  solution: string;
  hasFileChanges: boolean;
  changedFiles?: Array<{ path: string; content: string }>;
  prSummary?: string;
  commitSha?: string;
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

// Detect if there are any git changes from the default branch
async function detectGitChanges(workspaceDir: string): Promise<boolean> {
  logWithContext('GIT_WORKSPACE', 'Detecting git changes', { workspaceDir });

  const git = simpleGit(workspaceDir);

  try {
    const status = await git.status();
    const hasChanges = !status.isClean();

    logWithContext('GIT_WORKSPACE', 'Git change detection result', {
      hasChanges,
      isClean: status.isClean(),
      files: status.files.map(f => ({ file: f.path, status: f.working_dir })),
      ahead: status.ahead,
      behind: status.behind
    });

    return hasChanges;
  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'Error detecting git changes', {
      error: (error as Error).message
    });
    return false;
  }
}

// Create feature branch, commit changes, and return commit SHA
async function createFeatureBranchAndCommit(workspaceDir: string, branchName: string, message: string): Promise<string> {
  logWithContext('GIT_WORKSPACE', 'Creating feature branch and committing changes', {
    workspaceDir,
    branchName,
    message
  });

  const git = simpleGit(workspaceDir);

  try {
    // Create and checkout new feature branch
    await git.checkoutLocalBranch(branchName);
    logWithContext('GIT_WORKSPACE', 'Feature branch created and checked out', { branchName });

    // Add all changes
    await git.add('.');

    // Commit changes
    const result = await git.commit(message);
    const commitSha = result.commit;

    logWithContext('GIT_WORKSPACE', 'Changes committed to feature branch', {
      commitSha,
      branchName,
      summary: result.summary
    });

    return commitSha;
  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'Error creating branch and committing changes', {
      error: (error as Error).message,
      branchName
    });
    throw error;
  }
}

// Get list of changed files from git
async function getChangedFiles(workspaceDir: string): Promise<Array<{ path: string; content: string }>> {
  logWithContext('GIT_WORKSPACE', 'Getting changed files from git', { workspaceDir });

  const git = simpleGit(workspaceDir);
  const changedFiles: Array<{ path: string; content: string }> = [];

  try {
    const status = await git.status();

    // Get all modified, added, and renamed files
    const filePaths = status.files.map(file => file.path);

    logWithContext('GIT_WORKSPACE', 'Found changed files', {
      fileCount: filePaths.length,
      files: filePaths
    });

    // Read content of each changed file
    for (const filePath of filePaths) {
      try {
        const fullPath = path.join(workspaceDir, filePath);
        const content = await fs.readFile(fullPath, 'utf8');
        changedFiles.push({ path: filePath, content });
      } catch (error) {
        logWithContext('GIT_WORKSPACE', 'Error reading changed file', {
          filePath,
          error: (error as Error).message
        });
        // Skip files that can't be read (binary, deleted, etc.)
      }
    }

    return changedFiles;
  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'Error getting changed files', {
      error: (error as Error).message
    });
    return [];
  }
}

// Read PR summary from .claude-pr-summary.md file
async function readPRSummary(workspaceDir: string): Promise<string | null> {
  const summaryPath = path.join(workspaceDir, '.claude-pr-summary.md');

  try {
    const content = await fs.readFile(summaryPath, 'utf8');
    logWithContext('GIT_WORKSPACE', 'PR summary read successfully', {
      contentLength: content.length
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

**IMPORTANT: If you make any file changes, please create a file called '.claude-pr-summary.md' in the root directory with a concise summary (1-3 sentences) of what changes you made and why. This will be used for the pull request description.**

Work step by step and provide clear explanations of your approach.
`;
}


// Process issue with Claude Code and return structured response
async function processIssue(issueContext: IssueContext): Promise<ContainerResponse> {
  logWithContext('ISSUE_PROCESSOR', 'Starting issue processing', {
    repositoryName: issueContext.repositoryName,
    issueNumber: issueContext.issueNumber,
    title: issueContext.title
  });

  const results: SDKMessage[] = [];
  let turnCount = 0;

  try {
    // 1. Setup workspace with repository download and git initialization
    const workspaceDir = await setupWorkspace(issueContext.repositoryUrl, issueContext.issueNumber);

    logWithContext('ISSUE_PROCESSOR', 'Workspace setup completed', {
      workspaceDir
    });

    // 2. Prepare prompt for Claude Code
    const prompt = prepareClaudePrompt(issueContext);
    logWithContext('ISSUE_PROCESSOR', 'Claude prompt prepared', {
      promptLength: prompt.length
    });

    // 3. Query Claude Code in the workspace directory
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

      // 4. Check for file changes using git
      const hasChanges = await detectGitChanges(workspaceDir);
      logWithContext('ISSUE_PROCESSOR', 'Change detection completed', { hasChanges });

      let commitSha: string | undefined;
      let prSummary: string | undefined = undefined;
      let changedFiles: Array<{ path: string; content: string }> = [];

      if (hasChanges) {
        // Generate branch name
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/g, '-').split('.')[0];
        const branchName = `claude-code/issue-${issueContext.issueNumber}-${timestamp}`;

        // Create feature branch and commit changes
        commitSha = await createFeatureBranchAndCommit(
          workspaceDir,
          branchName,
          `Fix issue #${issueContext.issueNumber}: ${issueContext.title}`
        );

        // Get changed files for PR creation
        changedFiles = await getChangedFiles(workspaceDir);

        // Try to read PR summary
        const prSummaryResult = await readPRSummary(workspaceDir);
        prSummary = prSummaryResult || undefined;

        logWithContext('ISSUE_PROCESSOR', 'Changes committed to feature branch', {
          commitSha,
          branchName,
          filesChanged: changedFiles.length,
          hasPRSummary: !!prSummary
        });
      }

      // 5. Prepare response with solution text
      let solution = '';
      if (results.length > 0) {
        const lastResult = results[results.length - 1];
        solution = getMessageText(lastResult);
      }

      const response: ContainerResponse = {
        success: true,
        solution,
        hasFileChanges: hasChanges,
        changedFiles: hasChanges ? changedFiles : undefined,
        prSummary,
        commitSha
      };

      logWithContext('ISSUE_PROCESSOR', 'Issue processing completed successfully', {
        hasFileChanges: response.hasFileChanges,
        solutionLength: response.solution.length,
        hasPRSummary: !!response.prSummary
      });

      return response;

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
      solution: '',
      hasFileChanges: false,
      error: (error as Error).message
    };
  }
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
    const containerResponse = await processIssue(issueContext);

    logWithContext('ISSUE_HANDLER', 'Issue processing completed', {
      success: containerResponse.success,
      hasFileChanges: containerResponse.hasFileChanges,
      hasPRSummary: !!containerResponse.prSummary,
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
      solution: '',
      hasFileChanges: false,
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
