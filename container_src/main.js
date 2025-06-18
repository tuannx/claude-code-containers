const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { execSync, spawn } = require('child_process');
const { query } = require('@anthropic-ai/claude-code');
const { Octokit } = require('@octokit/rest');
const simpleGit = require('simple-git');

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

// Initialize GitHub client
const octokit = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null;

// Logging utility
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data || '');
}

// Basic health check handler
async function healthHandler(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'healthy',
    message: MESSAGE,
    instanceId: INSTANCE_ID,
    timestamp: new Date().toISOString(),
    claudeCodeAvailable: !!ANTHROPIC_API_KEY,
    githubTokenAvailable: !!GITHUB_TOKEN
  }));
}

// Error handler for testing
async function errorHandler(req, res) {
  throw new Error('This is a test error from the container');
}

// Setup isolated workspace for issue processing
async function setupWorkspace(repositoryUrl, issueNumber) {
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
    log('Error cloning repository:', error.message);
    throw error;
  }
}

// Prepare prompt for Claude Code
function prepareClaudePrompt(issueContext) {
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
async function postProgressComment(repositoryName, issueNumber, message) {
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
    log('Error posting progress comment:', error.message);
  }
}

// Process issue with Claude Code
async function processIssue(issueContext) {
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
    const results = [];
    let turnCount = 0;
    
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 5,
        workingDirectory: workspaceDir
      }
    })) {
      turnCount++;
      results.push(message);
      
      log(`Claude Code turn ${turnCount}:`, { type: message.type, content: message.content?.substring(0, 200) + '...' });
      
      // Stream progress back to GitHub
      if (message.type === 'assistant' && turnCount % 2 === 0) {
        await postProgressComment(
          issueContext.repositoryName,
          issueContext.issueNumber,
          `Working on the solution... (Turn ${turnCount}/5)\\n\\n${message.content?.substring(0, 500)}${message.content?.length > 500 ? '...' : ''}`
        );
      }
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
      `❌ **Error occurred while processing this issue:**\\n\\n\`\`\`\\n${error.message}\\n\`\`\`\\n\\nI'll need human assistance to resolve this.`
    );
    
    throw error;
  }
}

// Process final results from Claude Code
async function processFinalResults(issueContext, results) {
  const lastResult = results[results.length - 1];
  
  if (lastResult && lastResult.content) {
    // Post final summary comment
    await postProgressComment(
      issueContext.repositoryName,
      issueContext.issueNumber,
      `✅ **Analysis Complete**\\n\\n${lastResult.content}\\n\\n---\\n🤖 Generated with Claude Code`
    );
  }
  
  // TODO: In future iterations, implement:
  // - Branch creation with changes
  // - Pull request creation
  // - Test execution
  // - Code quality checks
}

// Main issue processing handler
async function processIssueHandler(req, res) {
  if (!ANTHROPIC_API_KEY) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not provided' }));
    return;
  }
  
  if (!ISSUE_ID || !REPOSITORY_URL) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Issue context not provided' }));
    return;
  }
  
  const issueContext = {
    issueId: ISSUE_ID,
    issueNumber: ISSUE_NUMBER,
    title: ISSUE_TITLE,
    description: ISSUE_BODY,
    labels: ISSUE_LABELS,
    repositoryUrl: REPOSITORY_URL,
    repositoryName: REPOSITORY_NAME,
    author: ISSUE_AUTHOR
  };
  
  // Start processing asynchronously
  processIssue(issueContext).catch(error => {
    log('Async issue processing failed:', error);
  });
  
  // Return immediate response
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'processing',
    message: 'Issue processing started',
    issueNumber: ISSUE_NUMBER,
    timestamp: new Date().toISOString()
  }));
}

// Route handler
async function requestHandler(req, res) {
  const { method, url } = req;
  
  log(`${method} ${url}`);
  
  try {
    if (url === '/' || url === '/container') {
      await healthHandler(req, res);
    } else if (url === '/error') {
      await errorHandler(req, res);
    } else if (url === '/process-issue') {
      await processIssueHandler(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    log('Request handler error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
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