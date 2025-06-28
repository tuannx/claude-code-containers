import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import * as http from 'http';
import { promises as fs } from 'fs';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import simpleGit from 'simple-git';
import * as path from 'path';
import { spawn } from 'child_process';
import { ContainerGitHubClient } from './github_client.js';
import { JSONRPCServer, JSONRPCErrorCode, JSONRPCErrorException } from 'json-rpc-2.0';
import { v4 as uuidv4 } from 'uuid';
import { InMemoryTaskStore, Task, TaskState, TaskMessage as A2ATaskMessage } from './a2a_task_store.js'; // Ensure .js extension if using ES modules
import OAuth2Server, { Request as OAuthRequest, Response as OAuthResponse } from 'oauth2-server';
import oauthModel from './a2a_oauth_model.js'; // Import the OAuth model

const PORT = process.env.PORT || 8080; // Use environment variable for port if available
const app = express();
const server = http.createServer(app); // Create HTTP server with Express app

// --- OAuth Server Setup ---
const oauth = new OAuth2Server({
  model: oauthModel,
  accessTokenLifetime: 60 * 60, // 1 hour
  allowBearerTokensInQueryString: false // Standard practice
});

// Middleware to authenticate requests for protected routes
const authenticateRequest = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  logWithContext('OAUTH_AUTH', 'Authenticating request for A2A endpoint', { path: req.path });
  const request = new OAuthRequest(req);
  const response = new OAuthResponse(res);

  return oauth.authenticate(request, response)
    .then((token) => {
      // @ts-ignore // Add token to request for use in handlers if needed
      req.token = token;
      logWithContext('OAUTH_AUTH', 'Authentication successful', { client: token.client.id, user: token.user?.id });
      next();
    })
    .catch((err) => {
      logWithContext('OAUTH_AUTH', 'Authentication failed', { error: err.message, code: err.code, path: req.path });
      res.status(err.code || 500).json(err);
    });
};

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

// --- A2A Specific Setup ---
const taskStore = new InMemoryTaskStore();
const rpcServer = new JSONRPCServer();

// --- Claude Code Execution Logic for A2A ---
async function executeClaudeCodeTask(taskId: string, prompt: string, taskContext?: any) {
  logWithContext('A2A_CLAUDE_EXEC', `Starting Claude execution for task ${taskId}`, { prompt, taskContext });

  let workspaceDir: string | undefined;
  const originalCwd = process.cwd();
  let results: SDKMessage[] = [];
  let turnCount = 0;

  try {
    await taskStore.updateTask(taskId, "working", { message: { role: "agent", parts: [{ text: "Preparing environment for Claude Code..." }] } });

    // Minimal context for now, primarily focused on the direct prompt
    // Workspace setup could be added here if taskContext.repositoryUrl is provided
    // For simplicity, let's assume Claude can operate on a general prompt first
    // or that the necessary files are already in a known location if needed by the prompt.

    // If a repository URL is provided in the A2A context, set up a workspace
    if (taskContext?.repositoryUrl) {
        // Construct a unique identifier for the workspace, e.g. using task ID
        const issueNumberForWorkspace = `a2a-${taskId}`;
        workspaceDir = await setupWorkspace(taskContext.repositoryUrl, issueNumberForWorkspace);
        process.chdir(workspaceDir);
        logWithContext('A2A_CLAUDE_EXEC', `Changed working directory to ${workspaceDir} for task ${taskId}`);
        await taskStore.updateTask(taskId, "working", { message: { role: "agent", parts: [{ text: `Cloned repository ${taskContext.repositoryUrl}. Starting Claude Code...` }] } });
    } else {
        await taskStore.updateTask(taskId, "working", { message: { role: "agent", parts: [{ text: "Starting Claude Code with provided prompt..." }] } });
    }

    const claudeStartTime = Date.now();
    for await (const message of query({
      prompt, // Use the direct prompt from A2A task
      options: { permissionMode: 'bypassPermissions' } // As used in original processIssue
    })) {
      turnCount++;
      results.push(message);
      logWithContext('A2A_CLAUDE_EXEC', `Task ${taskId}: Claude turn ${turnCount}`, { type: message.type });
      // Optionally update task store with intermediate messages if streaming is implemented later
      // For now, we'll just collect results.
    }
    const claudeDuration = Date.now() - claudeStartTime;
    logWithContext('A2A_CLAUDE_EXEC', `Task ${taskId}: Claude query completed`, { totalTurns: turnCount, duration: claudeDuration });

    const solutionText = results.length > 0 ? getMessageText(results[results.length - 1]) : "No textual output from Claude.";

    // Here, we could check for file changes if workspaceDir is defined, similar to detectGitChanges
    // and then package them as artifacts. For now, just the text output.
    const artifacts = [];
    if (workspaceDir) {
        const hasChanges = await detectGitChanges(workspaceDir);
        if (hasChanges) {
            // This part would need more logic to package changes as artifacts.
            // For now, we'll just note that changes were made.
            logWithContext('A2A_CLAUDE_EXEC', `Task ${taskId}: File changes detected in workspace. Artifact creation would go here.`);
            artifacts.push({
                name: "code_changes_summary.txt",
                mimeType: "text/plain",
                parts: [{ text: "Code changes were made in the workspace. Diff/patch artifact generation is pending." }]
            });
        }
    }


    await taskStore.updateTask(taskId, "completed", {
      message: { role: "agent", parts: [{ text: "Claude Code processing complete." }] },
      artifacts: [
        ...artifacts,
        { name: "claude_output.txt", mimeType: "text/plain", parts: [{ text: solutionText }] }
      ]
    });
    logWithContext('A2A_CLAUDE_EXEC', `Task ${taskId} completed successfully.`);

  } catch (error) {
    logWithContext('A2A_CLAUDE_EXEC', `Error during Claude execution for task ${taskId}`, { error: (error as Error).message, stack: (error as Error).stack });
    await taskStore.updateTask(taskId, "failed", {
      message: { role: "agent", parts: [{ text: "An error occurred during Claude Code processing." }] },
      error: { code: -32001, message: (error as Error).message } // Custom error code for Claude execution failure
    });
  } finally {
    if (workspaceDir) {
      process.chdir(originalCwd);
      logWithContext('A2A_CLAUDE_EXEC', `Restored original working directory from ${workspaceDir} for task ${taskId}`);
      // Optionally, clean up workspaceDir: await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  }
}


// A2A Method: tasks/send
rpcServer.addMethod("tasks/send", async (params: any) => {
  logWithContext('A2A_RPC', 'tasks/send called', params);
  if (!params || typeof params !== 'object' || !params.id || !params.message || !params.message.parts || !params.message.parts[0]?.text) {
    throw new JSONRPCErrorException("Invalid params: 'id', 'message.parts[0].text' are required.", JSONRPCErrorCode.InvalidParams);
  }

  const { id, message, context } = params as { id: string, message: A2ATaskMessage, context?: any };
  const promptText = message.parts[0].text!;

  try {
    await taskStore.createTask(id, params, context, message);
    await taskStore.updateTask(id, "submitted", { message: { role: "agent", parts: [{ text: "Task submitted. Queued for Claude Code processing." }] } });

    // Execute Claude Code task asynchronously
    executeClaudeCodeTask(id, promptText, context).catch(err => {
        // Ensure critical errors during async execution are logged if not handled by executeClaudeCodeTask's own try/catch
        logWithContext('A2A_RPC_EXEC_UNHANDLED', `Unhandled error in async executeClaudeCodeTask for ${id}`, {error: (err as Error).message});
    });

    const currentTaskState = await taskStore.getTask(id); // Should reflect "submitted" or "working" quickly
    logWithContext('A2A_RPC', 'tasks/send initiated Claude execution', currentTaskState);
    return { // Return immediately after queuing
      id: currentTaskState?.id,
      state: currentTaskState?.state,
      message: currentTaskState?.message
    };
  } catch (error) {
    logWithContext('A2A_RPC', 'Error in tasks/send setup', { error: (error as Error).message });
    // This catch is for errors during task creation or initial update, not for the async Claude execution
    throw new JSONRPCErrorException("Internal server error setting up task.", JSONRPCErrorCode.InternalError, error);
  }
});

// A2A Method: tasks/get
rpcServer.addMethod("tasks/get", async (params: any) => {
  logWithContext('A2A_RPC', 'tasks/get called', params);
  if (!params || typeof params !== 'object' || !params.id) {
    throw new JSONRPCErrorException("Invalid params: 'id' is required.", JSONRPCErrorCode.InvalidParams);
  }
  const { id } = params as { id: string };
  const task = await taskStore.getTask(id);
  if (!task) {
    throw new JSONRPCErrorException("Task not found.", -32000); // Custom error code for Task not found
  }
  logWithContext('A2A_RPC', 'tasks/get completed', task);
  return task; // Return the full task object as per A2A spec (potentially)
});

// --- Express Middleware and Routes ---
app.use(express.json()); // Middleware to parse JSON bodies

// Serve Agent Card statically
app.use('/.well-known', express.static(path.join(__dirname, '../public/.well-known')));


// A2A RPC Endpoint
app.post("/rpc", (req, res) => {
  const jsonRPCRequest = req.body;
  logWithContext('A2A_HTTP', 'Received A2A RPC request', jsonRPCRequest);
  rpcServer.receive(jsonRPCRequest).then((jsonRPCResponse) => {
    if (jsonRPCResponse) {
      res.json(jsonRPCResponse);
      logWithContext('A2A_HTTP', 'Sent A2A RPC response', jsonRPCResponse);
    } else {
      // Notification, no response needed
      res.sendStatus(204);
      logWithContext('A2A_HTTP', 'A2A RPC request was a notification.');
    }
  }).catch(error => {
      logWithContext('A2A_HTTP', 'Error processing A2A RPC request', { error });
      // This catch is for errors during rpcServer.receive() itself, not for errors within methods
      res.status(500).json({ error: "Internal Server Error during RPC processing" });
  });
});


// Basic health check handler (Express style)
app.get(['/', '/container', '/health'], async (_req, res) => {
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
  res.status(200).json(response);
});

// Error handler for testing (Express style)
app.get('/error', async (_req, _res) => {
  logWithContext('ERROR_ROUTE', 'Error test route triggered');
  throw new Error('This is a test error from the container');
});


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

// Create feature branch, commit changes, and push to remote
async function createFeatureBranchCommitAndPush(workspaceDir: string, branchName: string, message: string): Promise<string> {
  logWithContext('GIT_WORKSPACE', 'Creating feature branch, committing, and pushing changes', {
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

    // Push branch to remote
    await git.push('origin', branchName, ['--set-upstream']);
    logWithContext('GIT_WORKSPACE', 'Branch pushed to remote successfully', { branchName });

    return commitSha;
  } catch (error) {
    logWithContext('GIT_WORKSPACE', 'Error creating branch, committing, or pushing changes', {
      error: (error as Error).message,
      branchName
    });
    throw error;
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

      // 5. Check for file changes using git
      const hasChanges = await detectGitChanges(workspaceDir);
      logWithContext('ISSUE_PROCESSOR', 'Change detection completed', { hasChanges });

      // 6. Get solution text from Claude Code
      let solution = '';
      if (results.length > 0) {
        const lastResult = results[results.length - 1];
        solution = getMessageText(lastResult);
      }

      if (hasChanges) {
        // Generate branch name
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/g, '-').split('.')[0];
        const branchName = `claude-code/issue-${issueContext.issueNumber}-${timestamp}`;
        
        // Create feature branch, commit changes, and push to remote
        const commitSha = await createFeatureBranchCommitAndPush(
          workspaceDir, 
          branchName,
          `Fix issue #${issueContext.issueNumber}: ${issueContext.title}`
        );
        
        logWithContext('ISSUE_PROCESSOR', 'Changes committed and pushed to feature branch', {
          commitSha,
          branchName
        });

        // Try to read PR summary
        const prSummary = await readPRSummary(workspaceDir);
        
        // Create pull request
        try {
          const repoInfo = await githubClient.getRepository();
          const prTitle = prSummary ? prSummary.split('\n')[0].trim() : `Fix issue #${issueContext.issueNumber}`;
          const prBody = generatePRBody(prSummary, solution, issueContext.issueNumber);
          
          const pullRequest = await githubClient.createPullRequest(
            prTitle,
            prBody,
            branchName,
            repoInfo.default_branch
          );
          
          logWithContext('ISSUE_PROCESSOR', 'Pull request created successfully', {
            prNumber: pullRequest.number,
            prUrl: pullRequest.html_url
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
        // No file changes, just post solution as comment
        await githubClient.createComment(
          parseInt(issueContext.issueNumber),
          `${solution}\n\n---\n🤖 Generated with [Claude Code](https://claude.ai/code)`
        );

        return {
          success: true,
          message: 'Solution posted as comment (no file changes)'
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

// Generate PR body from summary and solution
function generatePRBody(prSummary: string | null, _solution: string, issueNumber: string): string {
  let body = '';
  
  if (prSummary) {
    body = prSummary.trim();
  } else {
    body = 'Automated fix generated by Claude Code.';
  }
  
  // Add footer
  body += `\n\n---\nFixes #${issueNumber}\n\n🤖 This pull request was generated automatically by [Claude Code](https://claude.ai/code) in response to the issue above.`;
  
  return body;
}

// Main issue processing handler (Express style)
app.post('/process-issue', async (req, res) => {
  logWithContext('ISSUE_HANDLER', 'Processing issue request');

  const requestBody = req.body; // Assuming express.json() middleware is used
  let issueContextFromRequest: any = {};

  if (requestBody) {
    try {
      issueContextFromRequest = requestBody; // Already parsed by express.json()
      logWithContext('ISSUE_HANDLER', 'Received issue context in request body', {
        hasAnthropicKey: !!issueContextFromRequest.ANTHROPIC_API_KEY,
        hasGithubToken: !!issueContextFromRequest.GITHUB_TOKEN,
        keysReceived: Object.keys(issueContextFromRequest)
      });

      // Set environment variables from request body if they exist
      if (issueContextFromRequest.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = issueContextFromRequest.ANTHROPIC_API_KEY;
      if (issueContextFromRequest.GITHUB_TOKEN) process.env.GITHUB_TOKEN = issueContextFromRequest.GITHUB_TOKEN;
      if (issueContextFromRequest.ISSUE_ID) process.env.ISSUE_ID = issueContextFromRequest.ISSUE_ID;
      if (issueContextFromRequest.ISSUE_NUMBER) process.env.ISSUE_NUMBER = issueContextFromRequest.ISSUE_NUMBER;
      if (issueContextFromRequest.ISSUE_TITLE) process.env.ISSUE_TITLE = issueContextFromRequest.ISSUE_TITLE;
      if (issueContextFromRequest.ISSUE_BODY) process.env.ISSUE_BODY = issueContextFromRequest.ISSUE_BODY;
      if (issueContextFromRequest.ISSUE_LABELS) process.env.ISSUE_LABELS = issueContextFromRequest.ISSUE_LABELS;
      if (issueContextFromRequest.REPOSITORY_URL) process.env.REPOSITORY_URL = issueContextFromRequest.REPOSITORY_URL;
      if (issueContextFromRequest.REPOSITORY_NAME) process.env.REPOSITORY_NAME = issueContextFromRequest.REPOSITORY_NAME;
      if (issueContextFromRequest.ISSUE_AUTHOR) process.env.ISSUE_AUTHOR = issueContextFromRequest.ISSUE_AUTHOR;

      logWithContext('ISSUE_HANDLER', 'Environment variables updated from request', {
        anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
        githubTokenSet: !!process.env.GITHUB_TOKEN,
        issueIdSet: !!process.env.ISSUE_ID
      });
    } catch (error) {
      logWithContext('ISSUE_HANDLER', 'Error processing request body (should not happen with express.json)', {
        error: (error as Error).message
      });
    }
  }

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    logWithContext('ISSUE_HANDLER', 'Missing Anthropic API key');
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY not provided' });
  }

  if (!process.env.ISSUE_ID || !process.env.REPOSITORY_URL) {
    logWithContext('ISSUE_HANDLER', 'Missing issue context', {
      hasIssueId: !!process.env.ISSUE_ID,
      hasRepositoryUrl: !!process.env.REPOSITORY_URL
    });
    return res.status(400).json({ error: 'Issue context not provided' });
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
    res.status(200).json(containerResponse);
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
    res.status(500).json(errorResponse);
  }
});


// Catch-all error handler for Express
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logWithContext('EXPRESS_ERROR', 'Unhandled error in Express route', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});


// Start server
server.listen(PORT, () => { // Removed '0.0.0.0' as it's often default or handled by Express/Node
  logWithContext('SERVER', 'Claude Code container server started with Express', {
    port: PORT,
    host: '0.0.0.0',
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
