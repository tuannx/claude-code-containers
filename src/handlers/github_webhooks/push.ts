import { GitHubAPI } from "../../github_client";
import { logWithContext } from "../../log";
import { containerFetch } from "../../fetch";

// Handle push events
export async function handlePushEvent(data: any, env: any, configDO: any): Promise<Response> {
  const repository = data.repository;
  const commits = data.commits || [];
  const ref = data.ref;
  const pusher = data.pusher;

  logWithContext('PUSH_EVENT', 'Processing push event', {
    repository: repository.full_name,
    commitCount: commits.length,
    ref,
    pusher: pusher?.name,
    branch: ref?.replace('refs/heads/', '')
  });

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  try {
    // Example: Get repository details with authenticated API call
    logWithContext('PUSH_EVENT', 'Fetching repository details');
    const repoData = await githubAPI.getRepository(repository.owner.login, repository.name) as any;

    logWithContext('PUSH_EVENT', 'Repository details fetched', {
      stars: repoData.stargazers_count,
      language: repoData.language,
      size: repoData.size
    });
  } catch (error) {
    logWithContext('PUSH_EVENT', 'Failed to fetch repository data', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Wake up a container based on the repository
  const containerName = `repo-${repository.id}`;
  logWithContext('PUSH_EVENT', 'Waking up container', { containerName });

  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  // Pass webhook data to the container
  const webhookPayload = {
    event: 'push',
    repository: repository.full_name,
    commits: commits.length,
    ref: data.ref,
    author: commits[0]?.author?.name || 'Unknown'
  };

  logWithContext('PUSH_EVENT', 'Sending webhook to container', webhookPayload);

  const containerResponse = await containerFetch(container, new Request('http://internal/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload)
  }), {
    containerName,
    route: '/webhook',
    env
  });

  logWithContext('PUSH_EVENT', 'Container response received', {
    status: containerResponse.status,
    statusText: containerResponse.statusText
  });

  return new Response('Push event processed', { status: 200 });
}