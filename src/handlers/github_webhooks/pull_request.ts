import { GitHubAPI } from "../../github_client";
import { containerFetch } from "../../fetch";

// Handle pull request events
export async function handlePullRequestEvent(data: any, env: any, configDO: any): Promise<Response> {
  const action = data.action;
  const pullRequest = data.pull_request;
  const repository = data.repository;

  console.log(`Pull request ${action}: #${pullRequest.number} in ${repository.full_name}`);

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  // Example: Comment on PR when it's opened
  if (action === 'opened') {
    try {
      await githubAPI.createComment(
        repository.owner.login,
        repository.name,
        pullRequest.number,
        `🚀 Thanks for the pull request! This event was processed by our Worker container.`
      );
      console.log(`Commented on PR #${pullRequest.number}`);
    } catch (error) {
      console.error('Failed to comment on PR:', (error as Error).message);
    }
  }

  // Wake up container for all PR events
  const containerName = `repo-${repository.id}`;
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  const webhookPayload = {
    event: 'pull_request',
    action,
    repository: repository.full_name,
    pr_number: pullRequest.number,
    pr_title: pullRequest.title,
    pr_author: pullRequest.user.login
  };

  await containerFetch(container, new Request('http://internal/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload)
  }), {
    containerName,
    route: '/webhook',
    env
  });

  return new Response('Pull request event processed', { status: 200 });
}