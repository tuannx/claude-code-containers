export async function handleInstallationGuide(_request: Request, _url: URL): Promise<Response> {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Install GitHub App</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
        }
        .step {
            margin: 20px 0;
            padding: 15px;
            border-left: 4px solid #0969da;
            background: #f8f9fa;
        }
    </style>
</head>
<body>
    <h1>📦 Install Your GitHub App</h1>

    <p>Follow these steps to complete the setup:</p>

    <div class="step">
        <h3>1. Choose Repositories</h3>
        <p>Select which repositories should send webhooks to your worker. You can choose:</p>
        <ul>
            <li><strong>All repositories</strong> - Current and future repos</li>
            <li><strong>Selected repositories</strong> - Choose specific repos</li>
        </ul>
    </div>

    <div class="step">
        <h3>2. Complete Installation</h3>
        <p>Click "Install" to finish the setup process.</p>
    </div>

    <div class="step">
        <h3>3. Test Webhooks</h3>
        <p>Once installed, try:</p>
        <ul>
            <li>Push a commit to trigger a webhook</li>
            <li>Open/close a pull request</li>
            <li>Create an issue</li>
        </ul>
    </div>

    <p><strong>✅ Once installation is complete, your worker will start receiving GitHub webhooks!</strong></p>

    <p><a href="/gh-setup">← Back to Setup</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}