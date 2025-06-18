import * as http from 'http';
import { promises as fs } from 'fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { Octokit } from '@octokit/rest';
import simpleGit from 'simple-git';

const PORT = 8080;

// Environment variables
const MESSAGE = process.env.MESSAGE || 'Hello from Claude Code Container';
const INSTANCE_ID = process.env.CLOUDFLARE_DEPLOYMENT_ID || 'unknown';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Issue context (passed via environment variables)
const ISSUE_ID = process.env.ISSUE_ID;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_TITLE = process.env.ISSUE_TITLE;
const ISSUE_BODY = process.env.ISSUE_BODY;
const ISSUE_LABELS = process.env.ISSUE_LABELS ? JSON.parse(process.env.ISSUE_LABELS) : [];
const REPOSITORY_URL = process.env.REPOSITORY_URL;
const REPOSITORY_NAME = process.env.REPOSITORY_NAME;
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR;

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

// Initialize GitHub client
const octokit = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null;

// Logging utility
function log(message: string, data: any = null): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data || '');
}

// Basic health check handler
async function healthHandler(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const response: HealthStatus = {
    status: 'healthy',
    message: MESSAGE,
    instanceId: INSTANCE_ID,
    timestamp: new Date().toISOString(),
    claudeCodeAvailable: !!ANTHROPIC_API_KEY,
    githubTokenAvailable: !!GITHUB_TOKEN
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

// Error handler for testing
async function errorHandler(_req: http.IncomingMessage, _res: http.ServerResponse): Promise<void> {
  throw new Error('This is a test error from the container');
}

// Setup isolated workspace for issue processing
async function setupWorkspace(repositoryUrl: string, issueNumber: string): Promise<string> {
  const workspaceDir = `/tmp/workspace/issue-${issueNumber}`;

  log(`Setting up workspace: ${workspaceDir}`);

  // Create workspace directory
  await fs.mkdir(workspaceDir, { recursive: true });

  // Clone repository
  const git = simpleGit();
  log(`Cloning repository: ${repositoryUrl}`);

  try {
    await git.clone(repositoryUrl, workspaceDir);
    log('Repository cloned successfully');

    // Configure git for potential commits
    const gitInWorkspace = simpleGit(workspaceDir);
    await gitInWorkspace.addConfig('user.name', 'Claude Code Bot');
    await gitInWorkspace.addConfig('user.email', 'claude-code@anthropic.com');

    return workspaceDir;
  } catch (error) {
    log('Error cloning repository:', (error as Error).message);
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
  if (!octokit) {
    log('GitHub token not available, skipping comment');
    return;
  }

  try {
    const [owner, repo] = repositoryName.split('/');
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: parseInt(issueNumber),
      body: `🤖 **Claude Code Progress Update**\n\n${message}`
    });
    log('Posted progress comment to GitHub');
  } catch (error) {
    log('Error posting progress comment:', (error as Error).message);
  }
}

// Process issue with Claude Code
async function processIssue(issueContext: IssueContext): Promise<void> {
  log('Starting issue processing', issueContext);

  try {
    // 1. Setup workspace and clone repository
    const workspaceDir = await setupWorkspace(issueContext.repositoryUrl, issueContext.issueNumber);

    // 2. Post initial progress comment
    await postProgressComment(
      issueContext.repositoryName,
      issueContext.issueNumber,
      'I\'ve started working on this issue. Analyzing the codebase and requirements...'
    );

    // 3. Prepare prompt for Claude Code
    const prompt = prepareClaudePrompt(issueContext);

    // 4. Run Claude Code
    log('Starting Claude Code execution');
    const results: ClaudeMessage[] = [];
    let turnCount = 0;

    // Set working directory by changing process directory
    const originalCwd = process.cwd();
    process.chdir(workspaceDir);

    try {
      for await (const message of query({
        prompt,
        options: {
          maxTurns: 5
        }
      })) {
        turnCount++;
        results.push(message);

        // Log message details (message structure depends on SDK version)
        log(`Claude Code turn ${turnCount}:`, {
          type: message.type,
          messagePreview: JSON.stringify(message).substring(0, 200) + '...'
        });

        // Stream progress back to GitHub for assistant messages
        if (message.type === 'assistant' && turnCount % 2 === 0) {
          const messageText = getMessageText(message);
          await postProgressComment(
            issueContext.repositoryName,
            issueContext.issueNumber,
            `Working on the solution... (Turn ${turnCount}/5)\n\n${messageText.substring(0, 500)}${messageText.length > 500 ? '...' : ''}`
          );
        }
      }
    } finally {
      // Restore original working directory
      process.chdir(originalCwd);
    }

    // 5. Process final results
    await processFinalResults(issueContext, results);

    log('Issue processing completed successfully');

  } catch (error) {
    log('Error processing issue:', error);

    // Post error comment to GitHub
    await postProgressComment(
      issueContext.repositoryName,
      issueContext.issueNumber,
      `❌ **Error occurred while processing this issue:**\n\n\`\`\`\n${(error as Error).message}\n\`\`\`\n\nI'll need human assistance to resolve this.`
    );

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
  const lastResult = results[results.length - 1];

  if (lastResult) {
    const messageText = getMessageText(lastResult);
    if (messageText) {
      // Post final summary comment
      await postProgressComment(
        issueContext.repositoryName,
        issueContext.issueNumber,
        `✅ **Analysis Complete**\n\n${messageText}\n\n---\n🤖 Generated with Claude Code`
      );
    }
  }

  // TODO: In future iterations, implement:
  // - Branch creation with changes
  // - Pull request creation
  // - Test execution
  // - Code quality checks
}

// Main issue processing handler
async function processIssueHandler(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  log(`🎯 [APP] Process issue handler called`);

  // Log all environment variables we're expecting
  log(`🔍 [APP] Environment variables check:`);
  log(`   - ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY ? 'Set' : 'Missing'}`);
  log(`   - GITHUB_TOKEN: ${GITHUB_TOKEN ? 'Set' : 'Missing'}`);
  log(`   - ISSUE_ID: ${ISSUE_ID || 'Missing'}`);
  log(`   - ISSUE_NUMBER: ${ISSUE_NUMBER || 'Missing'}`);
  log(`   - ISSUE_TITLE: ${ISSUE_TITLE || 'Missing'}`);
  log(`   - REPOSITORY_URL: ${REPOSITORY_URL || 'Missing'}`);
  log(`   - REPOSITORY_NAME: ${REPOSITORY_NAME || 'Missing'}`);
  log(`   - ISSUE_AUTHOR: ${ISSUE_AUTHOR || 'Missing'}`);

  if (!ANTHROPIC_API_KEY) {
    log(`❌ [APP] ANTHROPIC_API_KEY not provided`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'ANTHROPIC_API_KEY not provided',
      debug: 'Environment variable ANTHROPIC_API_KEY is missing or empty'
    }));
    return;
  }

  if (!ISSUE_ID || !REPOSITORY_URL) {
    log(`❌ [APP] Missing required issue context - ISSUE_ID: ${!!ISSUE_ID}, REPOSITORY_URL: ${!!REPOSITORY_URL}`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Issue context not provided',
      debug: {
        ISSUE_ID: !!ISSUE_ID,
        REPOSITORY_URL: !!REPOSITORY_URL,
        missing: [
          !ISSUE_ID && 'ISSUE_ID',
          !REPOSITORY_URL && 'REPOSITORY_URL'
        ].filter(Boolean)
      }
    }));
    return;
  }

  const issueContext: IssueContext = {
    issueId: ISSUE_ID!,
    issueNumber: ISSUE_NUMBER!,
    title: ISSUE_TITLE!,
    description: ISSUE_BODY!,
    labels: ISSUE_LABELS,
    repositoryUrl: REPOSITORY_URL!,
    repositoryName: REPOSITORY_NAME!,
    author: ISSUE_AUTHOR!
  };

  log(`✅ [APP] Issue context created successfully:`, {
    issueId: issueContext.issueId,
    issueNumber: issueContext.issueNumber,
    repositoryName: issueContext.repositoryName,
    author: issueContext.author,
    labelsCount: issueContext.labels.length
  });

  // Start processing asynchronously
  log(`🚀 [APP] Starting async issue processing...`);
  processIssue(issueContext).catch(error => {
    log('❌ [APP] Async issue processing failed:', error);
  });

  // Return immediate response
  log(`✅ [APP] Returning success response to caller`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'processing',
    message: 'Issue processing started',
    issueNumber: ISSUE_NUMBER,
    timestamp: new Date().toISOString(),
    debug: {
      hasClaudeKey: !!ANTHROPIC_API_KEY,
      hasGitHubToken: !!GITHUB_TOKEN,
      issueId: ISSUE_ID,
      repositoryUrl: REPOSITORY_URL
    }
  }));
}

// Route handler
async function requestHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const { method, url } = req;

  log(`🌐 [APP] Incoming request: ${method} ${url}`);
  log(`🌐 [APP] Request headers:`, req.headers);

  try {
    if (url === '/' || url === '/container') {
      log(`🏥 [APP] Routing to health handler`);
      await healthHandler(req, res);
    } else if (url === '/error') {
      log(`💥 [APP] Routing to error handler`);
      await errorHandler(req, res);
    } else if (url === '/process-issue') {
      log(`📋 [APP] Routing to process-issue handler`);
      await processIssueHandler(req, res);
    } else {
      log(`❓ [APP] Unknown route requested: ${url}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Not found',
        path: url,
        availablePaths: ['/', '/container', '/error', '/process-issue']
      }));
    }
  } catch (error) {
    log('❌ [APP] Request handler error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal server error',
      message: (error as Error).message,
      stack: (error as Error).stack
    }));
  }
}

// Start server
const server = http.createServer(requestHandler);

server.listen(PORT, () => {
  log(`Claude Code container server running on port ${PORT}`);
  log('Configuration:', {
    claudeCodeAvailable: !!ANTHROPIC_API_KEY,
    githubTokenAvailable: !!GITHUB_TOKEN,
    issueContext: !!ISSUE_ID
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down gracefully');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});
