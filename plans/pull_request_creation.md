# Pull Request Creation for Claude Code GitHub Integration

## Overview

This plan outlines the implementation of pull request creation functionality for the Claude Code GitHub issue processor. Currently, the system analyzes GitHub issues and posts solutions as comments. This enhancement will enable creating pull requests with actual code changes when Claude Code generates file modifications.

## Current State Analysis

### ✅ What Works Today
- GitHub webhook processing for issues
- Claude Code execution in containers  
- Issue analysis and solution generation
- Comment posting to original issues
- GitHub App authentication and token management

### ❌ Current Limitations
- **Read-only repository access** - `contents: 'read'` permission
- **No PR creation** - Only comment posting
- **No branch management** - Cannot create feature branches
- **No file commits** - Cannot apply Claude's code changes
- **No diff application** - Solutions only posted as text

## Phase 1: Core PR Creation Infrastructure

### 1.1 GitHub App Permissions Update

**Files to Modify:**
- `src/handlers/github_setup.ts:107` - Update `default_permissions`

**Required Changes:**
```typescript
default_permissions: {
  contents: 'write',        // UPGRADE: read → write for branch/file operations
  metadata: 'read',         // Keep existing
  pull_requests: 'write',   // Keep existing  
  issues: 'write'           // Keep existing
}
```

**Impact:** Existing GitHub App installations will need re-authorization for additional permissions.

### 1.2 GitHub API Client Enhancement

**Files to Modify:**
- `src/github_client.ts` - Add new PR-related methods

**New Methods to Implement:**
```typescript
// Branch Operations
async createBranch(owner: string, repo: string, branchName: string, baseSha: string): Promise<void>

// PR Operations
async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string): Promise<GitHubPullRequest>
```

### 1.3 Container Git-Based Change Detection

**Files to Modify:**
- `container_src/src/main.ts` - Add git-based change tracking

**Implementation Strategy:**
1. **Initialize Git**: Set up git in workspace after repo download
2. **Initial Commit**: Commit downloaded repo state as baseline
3. **Claude Execution**: Let Claude Code make changes via SDK
4. **PR Summary Generation**: Prompt Claude to write PR summary to `.claude-pr-summary.md`
5. **Git Diff**: Use `git diff --name-status` and `git status --porcelain` to detect changes
6. **Commit Changes**: Single commit with all Claude's modifications

**New Functions:**
```typescript
async function initializeGitWorkspace(workspaceDir: string): Promise<void>
async function detectGitChanges(workspaceDir: string): Promise<boolean>
async function commitChanges(workspaceDir: string, message: string): Promise<string>
async function readPRSummary(workspaceDir: string): Promise<string | null>
```

## Phase 2: PR Creation Logic

### 2.1 Branch Naming Strategy

**Convention:** `claude-code/issue-{issueNumber}-{timestamp}`
- Example: `claude-code/issue-42-20240120-143022`
- Prevents conflicts with multiple attempts
- Clear traceability to original issue

### 2.2 PR Creation Workflow

**Files to Create:**
- `src/handlers/github_webhooks/pr_creator.ts` - Core PR creation logic

**Workflow Steps:**
1. **Change Detection**: Identify modified files from Claude Code execution
2. **Branch Creation**: Create feature branch from default branch (main/master)
3. **File Commits**: Single commit with all changes from Claude Code
4. **PR Creation**: Create pull request with structured title and description
5. **Issue Linking**: Link PR back to original issue via comment

**Error Handling:**
- Branch already exists → Generate new timestamp-based name
- File conflicts → Rebase on latest default branch
- Permission errors → Fall back to comment-only mode
- Network failures → Retry with exponential backoff

### 2.3 PR Title and Description Generation

**Title Format:** `{focused_solution_title}` (e.g. "Add user authentication middleware")
**Description Template:**
```markdown
{claude_generated_pr_summary}

---
Fixes #{issueNumber}

🤖 This pull request was generated automatically by [Claude Code](https://claude.ai/code) in response to the issue above.
```

## Phase 3: Enhanced Container Integration

### 3.1 Container Response Protocol

**Current:** Container posts issue comment directly
**New:** Container returns structured response with changes

**Response Format:**
```typescript
interface ContainerResponse {
  success: boolean;
  solution: string;           // Human-readable solution description
  hasFileChanges: boolean;    // Whether code changes were made
  prSummary?: string;         // PR summary from .claude-pr-summary.md
  commitSha?: string;         // Git commit SHA if changes were made
  error?: string;            // Error details if failed
}
```

### 3.2 Container Execution Mode

**Files to Modify:**
- `src/handlers/github_webhooks/issue.ts` - Update container invocation
- `container_src/src/main.ts` - Return structured response instead of posting comment

**New Flow:**
1. **Container Execution** → Returns response object (doesn't post comment)
2. **Worker Processing** → Receives container response
3. **Decision Logic** → Create PR if changes exist, otherwise post comment
4. **Feedback** → Post appropriate response to original issue

## Phase 4: Simple Decision Logic

**Decision Rule:** 
- If Claude Code makes file changes → Create pull request
- If no file changes → Post solution as issue comment
- No configuration needed - keep it simple and automatic

## Phase 5: Error Handling and Monitoring

### 5.1 Error Scenarios

**Common Failure Cases:**
1. **Permission Denied** → Fall back to comment mode + notify user
2. **Branch Conflicts** → Attempt rebase or create with new timestamp
3. **Large Change Sets** → Create PR as-is (no artificial limits)
5. **Network Timeouts** → Implement retry logic with exponential backoff

### 5.2 Monitoring and Logging

**Metrics to Track:**
- PR creation success/failure rates
- Average processing time for PR creation
- Most common error types
- File change patterns (languages, sizes, types)

**Logging Enhancements:**
- Structured logging for PR creation steps
- Detailed error context for debugging
- Performance timing for optimization

## Phase 6: Long-term Enhancements

### 6.1 PR Comment Handling

**Future Scope:** Handle comments on generated pull requests
- New webhook handler for `pull_request_review_comment`
- Context-aware Claude Code execution with PR context
- Iterative improvement based on feedback

### 6.2 Advanced PR Features

**Potential Enhancements:**
- **Draft PR Creation** - For complex changes requiring review
- **Automated Testing** - Wait for CI/CD before moving out of draft
- **Review Assignment** - Auto-assign reviewers based on file changes
- **Conflict Resolution** - Intelligent handling of merge conflicts

## Implementation Timeline

### Week 1: Foundation
- [ ] Update GitHub App permissions
- [ ] Enhance GitHub API client with PR methods
- [ ] Implement basic file change detection

### Week 2: Core PR Creation
- [ ] Build PR creation workflow
- [ ] Update container response protocol
- [ ] Implement branch and file operations

### Week 3: Integration and Testing
- [ ] Integrate PR creation with issue workflow
- [ ] Add error handling and fallback logic
- [ ] Test with various issue types and repositories

### Week 4: Polish and Monitoring
- [ ] Implement monitoring and logging
- [ ] Documentation and deployment

## Technical Considerations

### Security
- **Permission Validation** - Verify write permissions before attempting PR creation
- **Branch Protection** - Respect protected branch rules
- **Rate Limiting** - Implement GitHub API rate limit handling

### Performance
- **Concurrent Processing** - Handle multiple issues simultaneously
- **Change Optimization** - Batch file operations efficiently
- **Caching** - Cache repository metadata and branch information
- **Timeout Management** - Set appropriate timeouts for longer operations

### Compatibility
- **Backward Compatibility** - Ensure existing comment-only mode still works
- **Repository Diversity** - Handle different repository structures and languages
- **GitHub App Migration** - Smooth upgrade path for existing installations

## Success Metrics

1. **PR Creation Rate** - % of issues that result in PRs vs comments
2. **PR Acceptance Rate** - % of generated PRs that get merged
3. **Time to Resolution** - Average time from issue to merged PR
4. **User Satisfaction** - Feedback on PR quality and usefulness
5. **Error Rate** - % of failed PR creation attempts

This comprehensive plan provides a structured approach to implementing pull request creation while maintaining the existing functionality and ensuring robust error handling and monitoring.