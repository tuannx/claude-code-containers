# Claude Code Integration Plan for GitHub Issues

## Overview

This plan outlines how to integrate Claude Code (Anthropic's AI coding assistant) into our Cloudflare Workers Container project to automatically handle GitHub issues. When users create new issues, Claude Code will run in a container to analyze and work on the issue.

**Key Innovation**: Leveraging Claude Code SDK in containers to provide AI-powered issue resolution with full access to the repository codebase.

## High-Level Architecture

```
GitHub Issue Created → Webhook → Worker → Container with Claude Code → Work on Issue → Comment/PR
```

## Phase 1: Container Enhancement for Claude Code

### Goal: Prepare containers to run Claude Code SDK

**Components needed:**

1. **Enhanced Container Image**: Update Dockerfile to include Claude Code dependencies
2. **Claude Code SDK Installation**: Install TypeScript SDK in container
3. **Environment Configuration**: Set up API keys and authentication
4. **Git Integration**: Configure git access within containers
5. **Workspace Setup**: Create isolated workspace per issue

**Container Requirements:**
- Node.js runtime (already available)
- Claude Code CLI installed globally
- Git configured with GitHub authentication
- Python 3.10+ (for Claude Code dependencies)
- Proper environment variable handling

**Updated Dockerfile Structure:**
```dockerfile
FROM node:18-alpine AS base

# Install Python and Claude Code dependencies
RUN apk add --no-cache python3 py3-pip git

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Copy application code
COPY container_src/ /app/
WORKDIR /app

# Install npm dependencies (including Claude Code SDK)
RUN npm install @anthropic-ai/claude-code

EXPOSE 8080
CMD ["node", "main.js"]
```

### Enhanced Container Capabilities

**Isolated Workspace Management:**
- Each container gets unique workspace directory: `/workspace/issue-{issueNumber}/`
- Clone repository into isolated workspace per issue
- Prevents conflicts when multiple issues processed simultaneously
- Create issue-specific branches for changes

**Git Repository Management:**
- Clone repository into isolated workspace
- Configure git with proper authentication
- Create branches specific to each issue (e.g., `claude-code/issue-123`)
- Handle repository permissions and access

**Issue Context Processing:**
- Parse GitHub webhook payloads for issue details
- Extract issue description, labels, assignees
- Let Claude Code explore repository structure and find relevant files autonomously
- Prepare simple, focused prompt for Claude Code

## Phase 2: Webhook Enhancement for Issue Events

### Goal: Detect and route GitHub issue events to Claude Code containers

**Enhanced Webhook Handler (`/webhooks/github`):**

```typescript
async function handleIssuesEvent(data: GitHubIssuesWebhook, env: Env) {
  if (data.action === 'opened') {
    // Extract issue details
    const issue = {
      id: data.issue.id,
      number: data.issue.number,
      title: data.issue.title,
      body: data.issue.body,
      labels: data.issue.labels,
      repository: data.repository,
      author: data.issue.user
    };

    // Route to Claude Code container
    return await routeToClaudeCodeContainer(issue, env);
  }
  
  // Handle other issue actions (closed, edited, etc.)
  return new Response('Issue event processed', { status: 200 });
}
```

**Container Routing Strategy:**
- Create dedicated container instance per issue
- Pass issue context as environment variables
- Configure container with repository access
- Set up isolated workspace for each issue

## Phase 3: Claude Code Integration Layer

### Goal: Integrate Claude Code SDK to process issues intelligently

**Core Integration Components:**

1. **Issue Context Parser**: Extract issue details from GitHub webhook
2. **Workspace Manager**: Setup isolated workspace and clone repository
3. **Claude Code Executor**: Run Claude Code with simple, focused prompts
4. **Result Processor**: Handle Claude Code outputs and responses
5. **GitHub Updater**: Post results back to GitHub using existing API integration

**Container Main Logic Enhancement:**
```typescript
// container_src/main.ts
import { query } from '@anthropic-ai/claude-code';

interface IssueContext {
  issueId: number;
  issueNumber: number;
  title: string;
  description: string;
  repository: string;
  author: string;
  labels: string[];
}

async function processIssue(context: IssueContext) {
  // 1. Setup isolated workspace and clone repository
  const workspaceDir = `/workspace/issue-${context.issueNumber}`;
  await setupWorkspace(context.repository, workspaceDir);
  
  // 2. Prepare simple prompt - let Claude explore autonomously
  const prompt = prepareClaudePrompt(context);
  
  // 3. Run Claude Code in the workspace
  const results = [];
  for await (const message of query({
    prompt,
    options: { 
      maxTurns: 5,
      workingDirectory: workspaceDir
    }
  })) {
    results.push(message);
    // Stream progress back to GitHub as comments
    if (message.type === 'progress') {
      await postProgressComment(context, message.content);
    }
  }
  
  // 4. Process final results
  await processFinalResults(context, results);
}
```

### Simplified Prompt Generation

**Let Claude Explore Autonomously:**
```typescript
function prepareClaudePrompt(context: IssueContext): string {
  return `
You are working on GitHub issue #${context.issueNumber}: "${context.title}"

Issue Description:
${context.description}

Labels: ${context.labels.join(', ')}
Author: ${context.author}

The repository has been cloned to your current working directory. Please:
1. Explore the codebase to understand the structure and relevant files
2. Analyze the issue requirements thoroughly
3. Implement a solution that addresses the issue
4. Write appropriate tests if needed
5. Ensure code quality and consistency with existing patterns

Work step by step and provide clear explanations of your approach.
`;
}
```

## Phase 4: Advanced Features

### Goal: Enhanced AI capabilities and GitHub integration

**Advanced Features:**

1. **Multi-Turn Conversations**: Handle complex issues requiring clarification
2. **Pull Request Creation**: Automatically create PRs with Claude's changes
3. **Code Review Integration**: Comment on existing PRs with suggestions
4. **Test Generation**: Automatically write tests for new features
5. **Documentation Updates**: Update docs when code changes
6. **Issue Labeling**: Automatically categorize and label issues

**GitHub API Integration with Octokit:**
```typescript
import { Octokit } from '@octokit/rest';

async function createPullRequest(context: IssueContext, changes: ClaudeCodeResult[]) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = context.repository.split('/');
  const branch = `claude-code/issue-${context.issueNumber}`;
  
  // Create branch with changes
  await createBranchWithChanges(branch, changes);
  
  // Create PR using octokit
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `Fix: ${context.title}`,
    body: `
Automatically generated solution for issue #${context.issueNumber}

${generatePRDescription(changes)}

---
🤖 Generated with Claude Code
`,
    head: branch,
    base: 'main'
  });
  
  // Link PR to issue using octokit
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: context.issueNumber,
    body: `I've created a pull request to address this issue: #${pr.number}`
  });
}
```

### Container Resource Management

**Optimized Container Usage:**
- Container pooling for faster response times
- Resource limits per issue processing
- Automatic cleanup after completion
- Memory management for large repositories
- Timeout handling for long-running tasks

## Phase 5: Monitoring and Quality Control

### Goal: Ensure reliable and high-quality AI assistance

**Quality Control Measures:**

1. **Result Validation**: Verify Claude's solutions before applying
2. **Human Review Gates**: Flag complex changes for human review
3. **Test Execution**: Run existing tests before creating PRs
4. **Code Quality Checks**: Lint and format generated code
5. **Security Scanning**: Check for security vulnerabilities

**Monitoring and Observability:**
```typescript
interface ProcessingMetrics {
  issueId: number;
  startTime: Date;
  endTime?: Date;
  status: 'processing' | 'completed' | 'failed';
  claudeTurns: number;
  changedFiles: string[];
  createdPR?: number;
  errorMessage?: string;
}
```

**Dashboard Features:**
- Real-time processing status
- Success/failure metrics
- Average resolution time
- Most common issue types
- Claude Code usage statistics

## Implementation Status

### ✅ COMPLETED: Foundation Setup
- **✅ Container Enhancement**: Updated Dockerfile with Node 22, Python, Git, and Claude Code CLI
- **✅ Dependency Management**: Added Claude Code SDK v1.0.27, Octokit, and simple-git to package.json
- **✅ Container Migration**: Replaced Go container with comprehensive Node.js implementation
- **✅ Workspace Setup**: Implemented isolated workspace creation (`/tmp/workspace/issue-{number}`)

### ✅ COMPLETED: User Setup Flow
- **✅ Claude API Key Setup**: Created `/claude-setup` route with secure form interface
- **✅ API Key Storage**: Implemented AES-256-GCM encryption for Anthropic API keys in Durable Objects
- **✅ GitHub Integration**: Enhanced existing `/gh-setup` flow to work with Claude Code
- **✅ Navigation Flow**: Seamless user experience between Claude and GitHub setup

### ✅ COMPLETED: Core Webhook Integration
- **✅ Issue Detection**: Enhanced `handleIssuesEvent` to detect new issue creation
- **✅ Container Routing**: Implemented `routeToClaudeCodeContainer` function
- **✅ Environment Variables**: Secure passing of API keys and issue context to containers
- **✅ Progress Comments**: Initial GitHub comment posting for user feedback

### 🔧 IN PROGRESS: Container Processing
- **✅ Container Logic**: Built comprehensive Claude Code integration in `container_src/main.js`
- **✅ GitHub API Integration**: Octokit implementation for progress comments
- **⚠️ DEBUGGING**: Durable Object access issue in container routing (current blocker)
- **⏳ PENDING**: Claude Code execution and repository analysis

### ⏳ TODO: Advanced Features
- **Pull Request Creation**: Automated PR generation from Claude's solutions
- **Code Quality**: Linting, testing, validation before creating PRs
- **Multi-turn Conversations**: Handle complex issues requiring clarification
- **Error Recovery**: Robust failure handling and user notifications

## Technical Requirements

### Environment Variables
```bash
# Container environment
ANTHROPIC_API_KEY=sk-ant-...           # Claude Code authentication
GITHUB_TOKEN=ghp_...                   # GitHub API access
ISSUE_ID=123                          # Current issue being processed
REPOSITORY_URL=https://github.com/...  # Repository to work on
WORKING_DIRECTORY=/workspace          # Isolated workspace
```

### Dependencies to Add
- `@anthropic-ai/claude-code` - Claude Code TypeScript SDK
- `@octokit/rest` - Enhanced GitHub API client with better TypeScript types
- `simple-git` - Git operations in Node.js
- `tmp` - Temporary directory management

### GitHub API Integration
- **Migrate to octokit/rest**: Replace direct fetch calls with octokit for better error handling and TypeScript support
- Benefits: Automatic retries, better rate limiting, cleaner API, comprehensive TypeScript types
- Will enhance existing GitHub integration (comments, PR creation, etc.)

### Security Considerations
- **API Key Management**: Secure storage of Anthropic API keys
- **Repository Access**: Proper GitHub token scoping
- **Container Isolation**: Prevent cross-issue contamination
- **Code Validation**: Verify generated code before application
- **Rate Limiting**: Manage Claude Code API usage

## Current Status Summary

**✅ What's Working:**
- User-friendly setup flow for both Claude API keys and GitHub integration
- Secure credential storage with AES-256-GCM encryption
- GitHub webhook detection and initial issue processing
- Container infrastructure with Claude Code SDK installed
- Progress comment posting to GitHub issues

**🔧 Current Blocker:**
- Durable Object access pattern needs debugging in `routeToClaudeCodeContainer`
- Container not receiving proper environment variables due to DO access issue

**🎯 Next Steps:**
1. Fix Durable Object access pattern for API key retrieval
2. Test end-to-end container spawning with proper environment variables
3. Verify Claude Code execution within containers
4. Implement pull request creation from Claude's solutions

## Success Criteria

1. **✅ Easy Setup**: User can configure both Claude and GitHub integration in under 2 minutes
2. **✅ Secure Storage**: API keys and credentials properly encrypted and isolated
3. **⏳ Automatic Processing**: Issues are automatically picked up and processed within 5 minutes
4. **⏳ Quality Code Generation**: Generated code passes existing tests and linting  
5. **⏳ User Experience**: Clear communication about progress and results
6. **⏳ Resource Efficiency**: Containers start quickly and use resources efficiently

## Example User Flow

1. **User creates issue**: "Add dark mode toggle to the settings page"
2. **Webhook triggers**: Container spins up with issue context
3. **Claude analyzes**: Understands requirements and explores codebase
4. **Implementation**: Claude writes the dark mode component and styles
5. **Testing**: Runs existing tests to ensure no regressions
6. **PR Creation**: Creates pull request with changes
7. **Notification**: Comments on issue with PR link and explanation
8. **Human Review**: Developer reviews and merges if satisfactory

## Risk Mitigation

### Technical Risks
- **Claude Code Reliability**: Implement fallback mechanisms for API failures
- **Resource Limits**: Set container timeouts and memory limits
- **Code Quality**: Always run validation before creating PRs
- **Security**: Sandbox container environments, validate all inputs

### Process Risks
- **Over-automation**: Provide easy opt-out mechanisms for users
- **Quality Control**: Implement human review for complex changes
- **Cost Management**: Monitor and limit Claude Code API usage
- **User Adoption**: Provide clear documentation and examples

This plan provides a comprehensive roadmap for integrating Claude Code into our GitHub issue workflow, creating an intelligent AI assistant that can automatically work on repository issues while maintaining high standards for code quality and user experience.