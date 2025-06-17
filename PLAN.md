# GitHub App Integration Plan for Cloudflare Workers

## Overview

This plan outlines how to implement GitHub app setup and webhook handling for a Cloudflare Workers project with Containers support. The goal is to allow users to easily configure GitHub webhooks that will wake up the worker whenever repository events occur.

**Key Innovation**: Using GitHub App Manifests for one-click app creation, eliminating manual configuration complexity and providing a seamless user experience.

## High-Level Plan for GitHub App Integration

### Phase 1: GitHub App Manifest Setup UI (`/gh-setup` route)

**Goal**: Provide one-click GitHub app creation using App Manifests

**Components needed**:

1. **Setup Landing Page**: Show webhook URL and "Create GitHub App" button
2. **App Manifest Configuration**: Pre-configured JSON manifest with all settings
3. **OAuth Callback Handler**: Process GitHub's response after app creation
4. **Installation Guide**: Help users install the newly created app
5. **Status Dashboard**: Show installation status and webhook activity

**Key Implementation Details**:

- **App Manifest Structure**: Pre-define all permissions, webhook events, and URLs
- **Dynamic Webhook URL**: Include user's worker domain in manifest (`https://{worker-domain}/webhooks/github`)
- **One-Click Creation**: Button redirects to `https://github.com/settings/apps/new?manifest=<encoded-manifest>`
- **Automatic Credential Retrieval**: OAuth callback provides App ID, private key, webhook secret
- **Installation Flow**: Guide users to install the newly created app on their repositories

**App Manifest Template**:

```json
{
  "name": "Worker GitHub Integration - {timestamp}",
  "url": "https://{worker-domain}",
  "hook_attributes": {
    "url": "https://{worker-domain}/webhooks/github"
  },
  "redirect_url": "https://{worker-domain}/gh-setup/callback",
  "callback_urls": ["https://{worker-domain}/gh-setup/callback"],
  "setup_url": "https://{worker-domain}/gh-setup/install",
  "public": false,
  "default_permissions": {
    "contents": "read",
    "metadata": "read",
    "pull_requests": "write",
    "issues": "write"
  },
  "default_events": [
    "push",
    "pull_request",
    "issues",
    "installation",
    "installation_repositories"
  ]
}
```

### Phase 2: Credentials Storage & Management

**Storage Strategy**:

- **Durable Objects** (recommended): Store app configurations with built-in consistency
- Each user/deployment gets its own GitHub app and isolated storage
- App configurations are scoped by worker domain/deployment

**What to store**:

- GitHub App ID
- Private key (encrypted)
- Webhook secret (encrypted)
- Installation ID(s)
- Repository information
- User/organization data
- App creation timestamp and metadata
- Webhook delivery logs (for debugging)

**Storage Schema**:

```typescript
interface GitHubAppConfig {
  appId: string;
  privateKey: string; // encrypted with worker-specific key
  webhookSecret: string; // encrypted
  installationId?: string;
  repositories: Repository[];
  owner: {
    login: string;
    type: "User" | "Organization";
    id: number;
  };
  permissions: {
    contents: string;
    metadata: string;
    pull_requests: string;
    issues: string;
  };
  events: string[];
  createdAt: string;
  lastWebhookAt?: string;
  webhookCount: number;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}
```

### Phase 3: GitHub OAuth & App Creation Flow

**Components**:

1. **Manifest Generator**: Create manifests with correct worker URLs
2. **OAuth Callback Handler**: Process GitHub's OAuth response after app creation
3. **Installation Callback Handler**: Handle app installation on repositories
4. **Token Management**: Generate and refresh JWT tokens for GitHub API calls
5. **Setup Status Tracker**: Monitor and display setup progress

**Detailed App Creation Flow**:

1. **Landing Page**: User visits `/gh-setup`, sees their webhook URL and setup button
2. **Manifest Generation**: Worker generates manifest with user's specific domain
3. **GitHub Redirect**: Click "Create App" → redirect to GitHub with encoded manifest
4. **App Creation**: GitHub creates app with pre-configured settings
5. **OAuth Callback**: GitHub redirects to `/gh-setup/callback?code=xxx`
6. **Credential Exchange**: Worker exchanges code for permanent app credentials
7. **Secure Storage**: Worker encrypts and stores credentials in Durable Object
8. **Installation Guide**: Show user how to install app on their repositories
9. **Installation Webhook**: Worker receives installation event when user installs app
10. **Setup Complete**: Confirmation page shows app is ready to receive webhooks

**OAuth Callback Process Details**:

```typescript
// /gh-setup/callback handler
async function handleOAuthCallback(code: string, worker_domain: string) {
  // Exchange temporary code for app credentials
  const response = await fetch(
    "https://api.github.com/app-manifests/{code}/conversions",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Worker-GitHub-Integration",
      },
    }
  );

  const appData = await response.json();
  // appData contains: id, pem (private key), webhook_secret

  // Encrypt sensitive data
  const encryptedKey = await encrypt(appData.pem);
  const encryptedSecret = await encrypt(appData.webhook_secret);

  // Store in Durable Object
  await storeAppConfig({
    appId: appData.id.toString(),
    privateKey: encryptedKey,
    webhookSecret: encryptedSecret,
    // ... other fields
  });

  return redirectToInstallationGuide(appData.html_url);
}
```

### Phase 4: Webhook Processing Infrastructure

**Core Routes**:

- `/gh-setup` - Main setup landing page with "Create App" button
- `/gh-setup/callback` - OAuth callback after app creation
- `/gh-setup/install` - Installation guide and status
- `/gh-status` - Check installation status and webhook activity
- `/webhooks/github` - Main webhook endpoint

**Enhanced Webhook Handling**:

- **Signature Verification**: Verify GitHub HMAC signatures using stored webhook secret
- **Event Type Routing**: Route different webhook events to appropriate handlers
- **Event Processing**: Process repository events and wake up containers
- **Delivery Tracking**: Log webhook deliveries for debugging
- **Error Handling**: Graceful handling of malformed or invalid webhooks

**Webhook Processing Flow**:

```typescript
async function processWebhook(request: Request, webhookSecret: string) {
  // Verify signature
  const signature = request.headers.get("x-hub-signature-256");
  const payload = await request.text();
  if (!verifySignature(payload, signature, webhookSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Parse event
  const event = request.headers.get("x-github-event");
  const data = JSON.parse(payload);

  // Route to appropriate handler
  switch (event) {
    case "push":
      return handlePushEvent(data);
    case "pull_request":
      return handlePullRequestEvent(data);
    case "installation":
      return handleInstallationEvent(data);
    // ... other events
  }
}
```

### Phase 5: Security & Authentication

**Enhanced Security Measures**:

1. **Webhook Signature Verification**: HMAC-SHA256 verification of all webhook payloads
2. **JWT Token Generation**: Proper GitHub App authentication for API calls
3. **Credential Encryption**: AES encryption of private keys and webhook secrets
4. **Rate Limiting**: Protect setup endpoints from abuse
5. **Domain Validation**: Ensure manifests only use legitimate worker domains
6. **Installation Validation**: Verify installation events match stored app data

**JWT Token Implementation**:

```typescript
async function generateInstallationToken(
  appId: string,
  privateKey: string,
  installationId: string
) {
  // Create JWT for GitHub App authentication
  const jwt = await createJWT(
    {
      iss: appId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    },
    privateKey
  );

  // Exchange for installation access token
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  return response.json(); // Contains token, expires_at, etc.
}
```

## Technical Architecture Considerations

### Dependencies to Add

- **JWT Library**: For GitHub App authentication (`@tsndr/cloudflare-worker-jwt` or similar)
- **Crypto Library**: For webhook signature verification and credential encryption
- **HTML Templating**: For setup UI pages (or inline HTML strings)
- **GitHub API Types**: TypeScript definitions for webhook payloads

### Environment Variables/Secrets

- **ENCRYPTION_KEY**: For encrypting stored credentials (required)
- **WORKER_DOMAIN**: Base domain for webhook URLs (auto-detected from request)

### Durable Object Design

```typescript
export class GitHubAppConfig extends DurableObject {
  // Store app credentials and configuration
  async storeAppData(appConfig: GitHubAppConfig) { ... }
  async getAppData(): Promise<GitHubAppConfig | null> { ... }
  async updateInstallation(installationData: any) { ... }
  async logWebhook(event: string, timestamp: string) { ... }

  // Handle installation management
  async addRepository(repo: Repository) { ... }
  async removeRepository(repoId: number) { ... }

  // Generate API tokens when needed
  async getInstallationToken(): Promise<string> { ... }
}
```

## Implementation Order

1. **Start with `/gh-setup` UI**: Create setup page with manifest generation
2. **Add OAuth callback handler**: Process app creation responses from GitHub
3. **Implement credential storage**: Secure storage in Durable Objects with encryption
4. **Build webhook infrastructure**: Create webhook endpoints and signature verification
5. **Add installation tracking**: Handle installation events and repository management
6. **Implement token management**: JWT generation for GitHub API calls
7. **Polish UI and error handling**: Complete user experience and edge cases

## Streamlined User Experience Flow

1. User deploys worker to Cloudflare ✅ (already handled)
2. User visits `https://their-worker.workers.dev/gh-setup`
3. Page shows their webhook URL and a big "Create GitHub App" button
4. User clicks button → redirected to GitHub with pre-configured app settings
5. User chooses account/organization and clicks "Create GitHub App"
6. GitHub creates app and redirects back to worker with credentials
7. Worker automatically stores encrypted credentials
8. Page shows "Install your app" with direct link to installation page
9. User installs app on desired repositories
10. Worker receives installation webhook and confirms setup
11. ✅ Ready! Webhooks start flowing immediately

**Total user actions: 3 clicks + choosing repositories**

## Detailed Requirements

### GitHub App Permissions (Pre-configured in Manifest)

- **Repository permissions**:
  - Contents: Read (to access repository content)
  - Metadata: Read (to access repository metadata)
  - Pull requests: Write (to comment on/modify PRs)
  - Issues: Write (to comment on/modify issues)
- **Webhook events**:
  - push, pull_request, issues, installation, installation_repositories

### Security Considerations

- **Manifest Security**: Validate worker domains to prevent malicious redirects
- **Credential Encryption**: All private keys encrypted with deployment-specific keys
- **Webhook Verification**: HMAC-SHA256 signature validation for all webhook payloads
- **JWT Scope**: Installation tokens properly scoped to specific repositories
- **Rate Limiting**: Protect `/gh-setup` endpoints from abuse
- **Input Validation**: Sanitize all GitHub webhook payloads

### Error Handling & Edge Cases

- **GitHub API Downtime**: Graceful degradation with retry logic
- **Invalid Webhooks**: Proper validation and error responses
- **App Uninstallation**: Handle installation removal webhooks
- **Credential Rotation**: Support for GitHub app credential updates
- **Setup Abandonment**: Clean up incomplete setups after timeout
- **Multiple Installations**: Handle app installed on multiple repositories

### Monitoring & Debugging

- **Webhook Logs**: Track delivery success/failure rates
- **Setup Analytics**: Monitor completion rates of setup flow
- **Error Reporting**: Log GitHub API errors and webhook processing failures
- **Status Dashboard**: Show real-time installation and webhook status

## Success Criteria

1. **One-Click Setup**: User can complete GitHub app setup in under 60 seconds
2. **Zero Configuration Errors**: Pre-configured manifests eliminate user mistakes
3. **Immediate Webhook Processing**: Worker receives webhooks within seconds of repository events
4. **Reliable Security**: All credentials encrypted, signatures verified, tokens scoped
5. **Robust Error Handling**: System gracefully handles all edge cases and GitHub API issues
6. **Clear Status Visibility**: Users can easily see setup progress and webhook activity

## Manifest-Specific Benefits

- **Consistency**: Every user gets identical app configuration
- **No User Errors**: Eliminates copy-paste mistakes and permission misconfigurations
- **Faster Setup**: Reduces setup time from 10+ minutes to under 1 minute
- **Better UX**: Clear, guided process with immediate feedback
- **Easier Support**: Standardized setup reduces support complexity
