import { GitHubAPI } from "../../github";

// Handle push events
export async function handlePushEvent(data: any, env: any, configDO: any): Promise<Response> {
  const repository = data.repository;
  const commits = data.commits || [];

  console.log(`Push event: ${commits.length} commits to ${repository.full_name}`);

  // Create GitHub API client for authenticated requests
  const githubAPI = new GitHubAPI(configDO);

  try {
    // Example: Get repository details with authenticated API call
    const repoData = await githubAPI.getRepository(repository.owner.login, repository.name);
    console.log(`Repository stars: ${repoData.stargazers_count}`);
  } catch (error) {
    console.error('Failed to fetch repository data:', error);
  }

  // Wake up a container based on the repository
  const containerName = `repo-${repository.id}`;
  const id = env.MY_CONTAINER.idFromName(containerName);
  const container = env.MY_CONTAINER.get(id);

  // Pass webhook data to the container
  const containerResponse = await container.fetch(new Request('http://internal/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'push',
      repository: repository.full_name,
      commits: commits.length,
      ref: data.ref,
      author: commits[0]?.author?.name || 'Unknown'
    })
  }));

  console.log(`Container response status: ${containerResponse.status}`);

  return new Response('Push event processed', { status: 200 });
}
