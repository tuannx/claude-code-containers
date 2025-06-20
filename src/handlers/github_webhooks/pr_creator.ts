import { GitHubAPI } from '../../github_client';
import { logWithContext } from '../../log';

export interface ContainerResponse {
  success: boolean;
  solution: string;
  hasFileChanges: boolean;
  changedFiles?: Array<{ path: string; content: string }>;
  prSummary?: string;
  commitSha?: string;
  error?: string;
}

export interface PRCreationResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  fallbackCommentPosted?: boolean;
}

export class PRCreator {
  private githubApi: GitHubAPI;

  constructor(githubApi: GitHubAPI) {
    this.githubApi = githubApi;
  }

  // Generate branch name following the convention: claude-code/issue-{issueNumber}-{timestamp}
  private generateBranchName(issueNumber: number): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/g, '-').split('.')[0];
    return `claude-code/issue-${issueNumber}-${timestamp}`;
  }

  // Create pull request from container response
  async createPullRequest(
    owner: string,
    repo: string,
    issueNumber: number,
    containerResponse: ContainerResponse,
    files: Array<{ path: string; content: string }>
  ): Promise<PRCreationResult> {
    logWithContext('PR_CREATOR', 'Starting PR creation process', {
      owner,
      repo,
      issueNumber,
      hasFileChanges: containerResponse.hasFileChanges,
      filesCount: files.length
    });

    if (!containerResponse.hasFileChanges || files.length === 0) {
      logWithContext('PR_CREATOR', 'No file changes detected, skipping PR creation');
      return { success: false, error: 'No file changes to create PR' };
    }

    try {
      // 1. Get default branch SHA
      const baseSha = await this.githubApi.getDefaultBranchSha(owner, repo);
      logWithContext('PR_CREATOR', 'Retrieved default branch SHA', { baseSha });

      // 2. Generate unique branch name
      const branchName = this.generateBranchName(issueNumber);
      logWithContext('PR_CREATOR', 'Generated branch name', { branchName });

      // 3. Create new branch
      await this.githubApi.createBranch(owner, repo, branchName, baseSha);
      logWithContext('PR_CREATOR', 'Branch created successfully', { branchName });

      // 4. Update files in the new branch
      for (const file of files) {
        try {
          // Check if file exists to get its SHA
          const existingFile = await this.githubApi.getFileContent(owner, repo, file.path, branchName);
          const fileSha = existingFile?.sha;

          await this.githubApi.updateFile(
            owner,
            repo,
            file.path,
            file.content,
            `Update ${file.path} - Fix issue #${issueNumber}`,
            branchName,
            fileSha
          );

          logWithContext('PR_CREATOR', 'File updated successfully', {
            path: file.path,
            isNewFile: !fileSha
          });
        } catch (fileError) {
          logWithContext('PR_CREATOR', 'Error updating file', {
            path: file.path,
            error: (fileError as Error).message
          });
          throw fileError;
        }
      }

      // 5. Create pull request
      const prTitle = this.generatePRTitle(containerResponse, issueNumber);
      const prBody = this.generatePRBody(containerResponse, issueNumber);

      // Get repository info to determine default branch
      const repoInfo = await this.githubApi.getRepository(owner, repo) as any;
      const defaultBranch = repoInfo.default_branch;

      const pullRequest = await this.githubApi.createPullRequest(
        owner,
        repo,
        prTitle,
        prBody,
        branchName,
        defaultBranch
      );

      logWithContext('PR_CREATOR', 'Pull request created successfully', {
        prNumber: pullRequest.number,
        prUrl: pullRequest.html_url,
        branchName,
        defaultBranch
      });

      return {
        success: true,
        prUrl: pullRequest.html_url,
        prNumber: pullRequest.number
      };

    } catch (error) {
      logWithContext('PR_CREATOR', 'Error creating pull request', {
        error: (error as Error).message,
        owner,
        repo,
        issueNumber
      });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  // Generate PR title from container response
  private generatePRTitle(containerResponse: ContainerResponse, issueNumber: number): string {
    // If we have a PR summary, try to extract a concise title from it
    if (containerResponse.prSummary) {
      const firstLine = containerResponse.prSummary.split('\n')[0].trim();
      if (firstLine.length > 0 && firstLine.length <= 100) {
        return firstLine;
      }
    }

    // Fallback to generic title
    return `Fix issue #${issueNumber}`;
  }

  // Generate PR body from container response
  private generatePRBody(containerResponse: ContainerResponse, issueNumber: number): string {
    let body = '';

    // Add PR summary if available
    if (containerResponse.prSummary) {
      body = containerResponse.prSummary.trim();
    } else {
      body = 'Automated fix generated by Claude Code.';
    }

    // Add footer
    body += `\n\n---\nFixes #${issueNumber}\n\n🤖 This pull request was generated automatically by [Claude Code](https://claude.ai/code) in response to the issue above.`;

    return body;
  }

  // Post fallback comment when PR creation fails
  async postFallbackComment(
    owner: string,
    repo: string,
    issueNumber: number,
    containerResponse: ContainerResponse,
    prError?: string
  ): Promise<boolean> {
    try {
      let commentBody = containerResponse.solution;

      if (prError) {
        commentBody += `\n\n---\n⚠️ **Note:** I attempted to create a pull request with code changes, but encountered an error: ${prError}\n\nThe solution above describes the changes that should be made.`;
      }

      commentBody += '\n\n---\n🤖 Generated with [Claude Code](https://claude.ai/code)';

      await this.githubApi.createComment(owner, repo, issueNumber, commentBody);

      logWithContext('PR_CREATOR', 'Fallback comment posted successfully', {
        owner,
        repo,
        issueNumber
      });

      return true;
    } catch (error) {
      logWithContext('PR_CREATOR', 'Error posting fallback comment', {
        error: (error as Error).message,
        owner,
        repo,
        issueNumber
      });
      return false;
    }
  }

  // Main orchestration method
  async handleContainerResponse(
    owner: string,
    repo: string,
    issueNumber: number,
    containerResponse: ContainerResponse,
    files: Array<{ path: string; content: string }> = []
  ): Promise<PRCreationResult> {
    logWithContext('PR_CREATOR', 'Handling container response', {
      owner,
      repo,
      issueNumber,
      success: containerResponse.success,
      hasFileChanges: containerResponse.hasFileChanges,
      filesCount: files.length
    });

    if (!containerResponse.success) {
      // Post error comment
      const fallbackCommentPosted = await this.postFallbackComment(
        owner,
        repo,
        issueNumber,
        containerResponse
      );

      return {
        success: false,
        error: containerResponse.error,
        fallbackCommentPosted
      };
    }

    if (containerResponse.hasFileChanges && files.length > 0) {
      // Try to create PR
      const prResult = await this.createPullRequest(
        owner,
        repo,
        issueNumber,
        containerResponse,
        files
      );

      if (prResult.success) {
        // Also post a comment linking to the PR
        await this.githubApi.createComment(
          owner,
          repo,
          issueNumber,
          `🔧 I've created a pull request with a potential fix: ${prResult.prUrl}\n\n${containerResponse.solution}\n\n---\n🤖 Generated with [Claude Code](https://claude.ai/code)`
        );

        return prResult;
      } else {
        // PR creation failed, post fallback comment
        const fallbackCommentPosted = await this.postFallbackComment(
          owner,
          repo,
          issueNumber,
          containerResponse,
          prResult.error
        );

        return {
          success: false,
          error: prResult.error,
          fallbackCommentPosted
        };
      }
    } else {
      // No file changes, just post solution as comment
      const fallbackCommentPosted = await this.postFallbackComment(
        owner,
        repo,
        issueNumber,
        containerResponse
      );

      return {
        success: true,
        fallbackCommentPosted
      };
    }
  }
}