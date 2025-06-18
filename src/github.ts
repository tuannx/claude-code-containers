// GitHub API client with authentication
export class GitHubAPI {
  private configDO: any;

  constructor(configDO: any) {
    this.configDO = configDO;
  }

  async makeAuthenticatedRequest(path: string, options: RequestInit = {}): Promise<Response> {
    const tokenResponse = await this.configDO.fetch(new Request('http://internal/get-installation-token'));
    const tokenData = await tokenResponse.json() as { token: string };

    if (!tokenData.token) {
      throw new Error('No valid installation token available');
    }

    const headers = {
      'Authorization': `Bearer ${tokenData.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Worker-GitHub-Integration',
      ...options.headers
    };

    return fetch(`https://api.github.com${path}`, {
      ...options,
      headers
    });
  }

  // Get repository information
  async getRepository(owner: string, repo: string) {
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}`);
    return response.json();
  }

  // Comment on an issue or pull request
  async createComment(owner: string, repo: string, issueNumber: number, body: string) {
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
    return response.json();
  }

  // Get installation repositories
  async getInstallationRepositories() {
    const response = await this.makeAuthenticatedRequest('/installation/repositories');
    return response.json();
  }
}
