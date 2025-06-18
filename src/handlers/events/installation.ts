// Handle installation events (app installed/uninstalled)
async function handleInstallationEvent(data: any, configDO: any): Promise<Response> {
  const action = data.action;
  const installation = data.installation;

  if (action === 'created') {
    // App was installed - update configuration with installation details
    const repositories = data.repositories || [];
    const repoData = repositories.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private
    }));

    await configDO.fetch(new Request('http://internal/update-installation', {
      method: 'POST',
      body: JSON.stringify({
        installationId: installation.id.toString(),
        repositories: repoData,
        owner: {
          login: installation.account.login,
          type: installation.account.type,
          id: installation.account.id
        }
      })
    }));

    console.log(`App installed on ${repositories.length} repositories`);
  } else if (action === 'deleted') {
    // App was uninstalled - could clean up or mark as inactive
    console.log('App installation removed');
  }

  return new Response('Installation event processed', { status: 200 });
}
