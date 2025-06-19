import * as http from 'http';
import { promises as fs } from 'fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { Octokit } from '@octokit/rest';
import simpleGit from 'simple-git';
import * as path from 'path';

const PORT = 8080;

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

// Use the SDK's actual message type
type ClaudeMessage = SDKMessage;

// Initialize GitHub client function (to be called with updated token)
function getGitHubClient(): Octokit | null {
  const token = process.env.GITHUB_TOKEN;
  return token ? new Octokit({ auth: token }) : null;
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

// Legacy log function for backward compatibility
function log(message: string, data: any = null): void {
  logWithContext('CONTAINER', message, data);
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

// Setup isolated workspace for issue processing using GitHub API
async function setupWorkspace(repositoryUrl: string, issueNumber: string): Promise<string> {
  const workspaceDir = `/tmp/workspace/issue-${issueNumber}`;

  logWithContext('WORKSPACE', 'Setting up workspace', {
    workspaceDir,
    repositoryUrl,
    issueNumber
  });

  try {
    // Create workspace directory
    await fs.mkdir(workspaceDir, { recursive: true });
    logWithContext('WORKSPACE', 'Workspace directory created');

    // Extract owner and repo from URL
    const urlMatch = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub repository URL');
    }

    const owner = urlMatch[1];
    const repo = urlMatch[2].replace('.git', '');

    logWithContext('WORKSPACE', 'Parsed repository info', { owner, repo });

    // Download repository content using GitHub API
    const octokit = getGitHubClient();
    if (!octokit) {
      throw new Error('GitHub token not available');
    }

    const downloadStartTime = Date.now();

    // Get the default branch
    logWithContext('WORKSPACE', 'Getting repository metadata');
    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoInfo.data.default_branch;

    logWithContext('WORKSPACE', 'Repository metadata retrieved', {
      defaultBranch,
      isPrivate: repoInfo.data.private
    });

    // Download repository archive
    logWithContext('WORKSPACE', 'Downloading repository archive');
    const archiveResponse = await octokit.rest.repos.downloadZipballArchive({
      owner,
      repo,
      ref: defaultBranch
    });

    // Save archive to temporary file
    const archivePath = `/tmp/repo-${issueNumber}.zip`;
    await fs.writeFile(archivePath, Buffer.from(archiveResponse.data as ArrayBuffer));

    logWithContext('WORKSPACE', 'Archive downloaded and saved', {
      archivePath,
      sizeBytes: Buffer.from(archiveResponse.data as ArrayBuffer).length
    });

    // Extract archive using unzip command (assuming it's available in container)
    const { spawn } = require('child_process');
    await new Promise<void>((resolve, reject) => {
      const unzipProcess = spawn('unzip', ['-q', archivePath, '-d', workspaceDir], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';
      unzipProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      unzipProcess.on('close', (code: number) => {
        if (code === 0) {
          logWithContext('WORKSPACE', 'Archive extracted successfully');
          resolve();
        } else {
          logWithContext('WORKSPACE', 'Archive extraction failed', {
            code,
            stderr
          });
          reject(new Error(`Unzip failed with code ${code}: ${stderr}`));
        }
      });
    });

    // Find the extracted directory (GitHub creates a directory with commit hash)
    const entries = await fs.readdir(workspaceDir);
    const extractedDir = entries.find(entry => entry.startsWith(`${owner}-${repo}-`));

    if (!extractedDir) {
      throw new Error('Could not find extracted repository directory');
    }

    const extractedPath = path.join(workspaceDir, extractedDir);

    // Move contents to workspace root
    const contentEntries = await fs.readdir(extractedPath);
    for (const entry of contentEntries) {
      const srcPath = path.join(extractedPath, entry);
      const destPath = path.join(workspaceDir, entry);
      await fs.rename(srcPath, destPath);
    }

    // Remove the now-empty extracted directory and archive
    await fs.rmdir(extractedPath);
    await fs.unlink(archivePath);

    const downloadTime = Date.now() - downloadStartTime;

    logWithContext('WORKSPACE', 'Repository downloaded and extracted successfully', {
      downloadTimeMs: downloadTime,
      filesExtracted: contentEntries.length
    });

    // Initialize git in the workspace for potential commits
    const git = simpleGit(workspaceDir);
    await git.init();
    await git.addConfig('user.name', 'Claude Code Bot');
    await git.addConfig('user.email', 'claude-code@anthropic.com');

    logWithContext('WORKSPACE', 'Git repository initialized');

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

Work step by step and provide clear explanations of your approach.
`;
}

// Post progress comment to GitHub
async function postProgressComment(repositoryName: string, issueNumber: string, message: string): Promise<void> {
  const octokit = getGitHubClient();
  if (!octokit) {
    logWithContext('GITHUB_COMMENT', 'GitHub token not available, skipping comment');
    return;
  }

  try {
    const [owner, repo] = repositoryName.split('/');

    logWithContext('GITHUB_COMMENT', 'Posting progress comment', {
      owner,
      repo,
      issueNumber,
      messageLength: message.length
    });

    const response = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(issueNumber),
      body: `🤖 **Claude Code Progress Update**\n\n${message}`
    });

    logWithContext('GITHUB_COMMENT', 'Progress comment posted successfully', {
      commentId: response.data.id,
      commentUrl: response.data.html_url
    });
  } catch (error) {
    logWithContext('GITHUB_COMMENT', 'Error posting progress comment', {
      error: (error as Error).message,
      repositoryName,
      issueNumber
    });
  }
}

// Process issue with Claude Code
async function processIssue(issueContext: IssueContext): Promise<void> {
  const startTime = Date.now();

  logWithContext('ISSUE_PROCESSOR', 'Starting issue processing', {
    issueId: issueContext.issueId,
    issueNumber: issueContext.issueNumber,
    repository: issueContext.repositoryName,
    title: issueContext.title,
    author: issueContext.author,
    labels: issueContext.labels
  });

  try {
    // 1. Setup workspace and clone repository
    logWithContext('ISSUE_PROCESSOR', 'Setting up workspace');
    const workspaceDir = await setupWorkspace(issueContext.repositoryUrl, issueContext.issueNumber);

    logWithContext('ISSUE_PROCESSOR', 'Workspace setup completed', {
      workspaceDir
    });

    // 2. Post initial progress comment
    logWithContext('ISSUE_PROCESSOR', 'Posting initial progress comment');
    await postProgressComment(
      issueContext.repositoryName,
      issueContext.issueNumber,
      'I\'ve started working on this issue. Analyzing the codebase and requirements...'
    );

    // 3. Prepare prompt for Claude Code
    const prompt = prepareClaudePrompt(issueContext);
    logWithContext('ISSUE_PROCESSOR', 'Claude prompt prepared', {
      promptLength: prompt.length
    });

    // 4. Run Claude Code
    logWithContext('ISSUE_PROCESSOR', 'Starting Claude Code execution');
    const results: ClaudeMessage[] = [];
    let turnCount = 0;

    // Set working directory by changing process directory
    const originalCwd = process.cwd();
    logWithContext('ISSUE_PROCESSOR', 'Changing working directory', {
      from: originalCwd,
      to: workspaceDir
    });

    process.chdir(workspaceDir);

    try {
      const claudeStartTime = Date.now();

      for await (const message of query({ prompt })) {
        turnCount++;
        results.push(message);

        // Log message details (message structure depends on SDK version)
        logWithContext('CLAUDE_CODE', `Turn ${turnCount} completed`, {
          type: message.type,
          messagePreview: JSON.stringify(message).substring(0, 200) + '...',
          turnCount,
        });

        // Stream progress back to GitHub for assistant messages
        if (message.type === 'assistant' && turnCount % 2 === 0) {
          const messageText = getMessageText(message);

          logWithContext('CLAUDE_CODE', 'Posting progress update to GitHub', {
            turnCount,
            messageLength: messageText.length
          });

          await postProgressComment(
            issueContext.repositoryName,
            issueContext.issueNumber,
            `Working on the solution... (Turn ${turnCount})\n\n${messageText.substring(0, 500)}${messageText.length > 500 ? '...' : ''}`
          );
        }
      }

      const claudeTime = Date.now() - claudeStartTime;
      logWithContext('CLAUDE_CODE', 'Claude Code execution completed', {
        totalTurns: turnCount,
        executionTimeMs: claudeTime,
        resultsCount: results.length
      });

    } finally {
      // Restore original working directory
      logWithContext('ISSUE_PROCESSOR', 'Restoring original working directory', {
        restoringTo: originalCwd
      });
      process.chdir(originalCwd);
    }

    // 5. Process final results
    logWithContext('ISSUE_PROCESSOR', 'Processing final results');
    await processFinalResults(issueContext, results);

    const totalTime = Date.now() - startTime;
    logWithContext('ISSUE_PROCESSOR', 'Issue processing completed successfully', {
      totalProcessingTimeMs: totalTime,
      totalTurns: turnCount
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;

    logWithContext('ISSUE_PROCESSOR', 'Error processing issue', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      issueId: issueContext.issueId,
      processingTimeMs: totalTime
    });

    // Post error comment to GitHub
    try {
      logWithContext('ISSUE_PROCESSOR', 'Posting error comment to GitHub');

      await postProgressComment(
        issueContext.repositoryName,
        issueContext.issueNumber,
        `❌ **Error occurred while processing this issue:**\n\n\`\`\`\n${(error as Error).message}\n\`\`\`\n\nI'll need human assistance to resolve this.`
      );

      logWithContext('ISSUE_PROCESSOR', 'Error comment posted successfully');
    } catch (commentError) {
      logWithContext('ISSUE_PROCESSOR', 'Failed to post error comment', {
        commentError: (commentError as Error).message
      });
    }

    throw error;
  }
}

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
    return message.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join(' ');
  }
  return JSON.stringify(message);
}

// Process final results from Claude Code
async function processFinalResults(issueContext: IssueContext, results: ClaudeMessage[]): Promise<void> {
  logWithContext('FINAL_PROCESSOR', 'Processing final results', {
    resultsCount: results.length,
    issueNumber: issueContext.issueNumber
  });

  const lastResult = results[results.length - 1];

  if (lastResult) {
    const messageText = getMessageText(lastResult);

    logWithContext('FINAL_PROCESSOR', 'Last result extracted', {
      hasMessage: !!messageText,
      messageLength: messageText?.length || 0,
      messageType: lastResult.type
    });

    if (messageText) {
      // Post final summary comment
      logWithContext('FINAL_PROCESSOR', 'Posting final summary comment');

      await postProgressComment(
        issueContext.repositoryName,
        issueContext.issueNumber,
        `✅ **Analysis Complete**\n\n${messageText}\n\n---\n🤖 Generated with Claude Code`
      );

      logWithContext('FINAL_PROCESSOR', 'Final summary comment posted');
    }
  } else {
    logWithContext('FINAL_PROCESSOR', 'No results to process');
  }

  logWithContext('FINAL_PROCESSOR', 'Final results processing completed');

  // TODO: In future iterations, implement:
  // - Branch creation with changes
  // - Pull request creation
  // - Test execution
  // - Code quality checks
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

  // Start processing asynchronously
  processIssue(issueContext).catch(error => {
    logWithContext('ISSUE_HANDLER', 'Async issue processing failed', {
      error: error instanceof Error ? error.message : String(error),
      issueId: issueContext.issueId
    });
  });

  // Return immediate response
  const responseData = {
    status: 'processing',
    message: 'Issue processing started',
    issueNumber: process.env.ISSUE_NUMBER,
    timestamp: new Date().toISOString()
  };

  logWithContext('ISSUE_HANDLER', 'Returning immediate response', responseData);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(responseData));
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
