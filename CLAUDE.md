# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev          # Start local development server (http://localhost:8787)
npm run deploy       # Deploy to Cloudflare Workers
npm run cf-typegen   # Generate TypeScript types after wrangler config changes
```

**⚠️ Important:** Always run `npm run cf-typegen` after making changes to `wrangler.jsonc`. This regenerates the TypeScript types and updates `worker-configuration.d.ts` to match your bindings and configuration.

### Wrangler CLI Commands

```bash
npx wrangler dev                    # Start local development (same as npm run dev)
npx wrangler dev --remote          # Use remote Cloudflare resources
npx wrangler deploy                 # Deploy to production (same as npm run deploy)
npx wrangler login                  # Authenticate with Cloudflare
npx wrangler versions upload        # Upload new version with preview URL
```

## Tech Stack & Architecture

This is a **Cloudflare Workers Container project** that combines:
- **TypeScript Worker** (`src/index.ts`) - Main request router and GitHub integration
- **Go Container** (`container_src/main.go`) - Containerized application running on port 8080
- **Durable Objects** - Stateful container management via `MyContainer` class

### Key Architecture Points

**Request Flow:**
1. Worker receives requests and routes based on path
2. Container routes (`/container`, `/lb`, `/singleton`, `/error`) proxy to Go containers
3. GitHub routes (`/gh-setup/*`) handle app setup and OAuth callbacks

**Container Management:**
- Extends `cf-containers` library's `Container` class
- Default port 8080, 10-second sleep timeout
- Lifecycle hooks: `onStart()`, `onStop()`, `onError()`
- Load balancing support across multiple container instances

**GitHub Integration:**
- Uses GitHub App Manifests for one-click app creation
- Each deployment gets isolated GitHub app with dynamic webhook URLs
- OAuth flow: `/gh-setup` → GitHub → `/gh-setup/callback` → `/gh-setup/install`

## Configuration Files

- **`wrangler.jsonc`** - Workers configuration with container bindings and Durable Objects
- **`Dockerfile`** - Multi-stage build (golang:1.24-alpine → scratch)
- **`worker-configuration.d.ts`** - Auto-generated types (run `npm run cf-typegen` after config changes)
- **`.dev.vars`** - Local environment variables (not committed to git)

### Key Wrangler Configuration Patterns

```jsonc
{
  "compatibility_date": "2025-05-23",  // Controls API behavior and features
  "nodejs_compat": true,               // Enable Node.js API compatibility
  "vars": {                           // Environment variables
    "ENVIRONMENT": "development"
  },
  "durable_objects": {                // Durable Object bindings
    "bindings": [
      { "name": "MY_CONTAINER", "class_name": "MyContainer" }
    ]
  }
}
```

**After modifying bindings or vars in wrangler.jsonc:**
1. Run `npm run cf-typegen` to update TypeScript types
2. Check that `worker-configuration.d.ts` reflects your changes
3. Update your `Env` interface in TypeScript code if needed

## Development Patterns

**Testing Endpoints:**
- `/container/hello` - Basic container functionality
- `/error` - Test container error handling
- `/lb` - Load balancing across 3 containers
- `/singleton` - Single container instance
- `/gh-setup` - GitHub app setup flow

**Environment Variables:**
- Container receives `MESSAGE` and `CLOUDFLARE_DEPLOYMENT_ID` from Worker
- Configure in `wrangler.jsonc` vars section

## Cloudflare Workers Best Practices

### Worker Code Structure
```typescript
export interface Env {
  MY_CONTAINER: DurableObjectNamespace;
  // Add other bindings here
  API_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Worker logic here
    return new Response("Hello World");
  },
} satisfies ExportedHandler<Env>;
```

### Resource Bindings
- **Durable Objects**: Access via `env.MY_CONTAINER.get(id)`
- **Environment Variables**: Access via `env.VARIABLE_NAME`
- **KV/D1/R2**: Configure in wrangler.jsonc, access via env bindings

### Development Tips
- Use `console.log()` for debugging - visible in `wrangler dev` and deployed logs
- Workers must start within 400ms - keep imports and initialization lightweight
- Use `.dev.vars` for local secrets (never commit this file)
- Test with `--remote` flag to use actual Cloudflare resources during development

## Current Implementation Status

**Completed:** GitHub App Manifest setup (Phase 1)
**Next:** Credential storage in Durable Objects, webhook processing with signature verification

**Important:** Containers are a Beta feature - API may change. The `cf-containers` library version is pinned to 0.0.7.