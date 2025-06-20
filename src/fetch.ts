import { Container } from '@cloudflare/containers';
import { logWithContext } from './log';

export interface ContainerFetchOptions {
  containerName?: string;
  route?: string;
  timeout?: number;
  env?: any;
}

/**
 * Check if the container issue hack is enabled via environment variable
 */
function isContainerHackEnabled(env?: any): boolean {
  if (!env) return false;
  
  const hackValue = env.WRANGLER_CONTAINERS_ISSUE_HACK;
  return hackValue === 'true' || hackValue === '1' || hackValue === true;
}

/**
 * Wrapper for container.fetch calls with enhanced logging, error handling, and timing
 * Includes hack to bypass container.fetch and use localhost:8080 when WRANGLER_CONTAINERS_ISSUE_HACK is set
 */
export async function containerFetch(
  container: DurableObjectStub<Container<unknown>> | Container<unknown>,
  request: Request,
  options: ContainerFetchOptions = {}
): Promise<Response> {
  const { containerName = 'unknown', route = 'unknown', timeout = 30000, env } = options;
  const startTime = Date.now();
  
  // Check if hack is enabled
  const useHack = isContainerHackEnabled(env);
  
  if (useHack) {
    logWithContext('CONTAINER_FETCH', `Using localhost hack for ${containerName} (WRANGLER_CONTAINERS_ISSUE_HACK enabled)`, {
      url: request.url,
      method: request.method,
      containerName,
      route,
      hackEnabled: true
    });
  } else {
    logWithContext('CONTAINER_FETCH', `Starting fetch to ${containerName} for route ${route}`, {
      url: request.url,
      method: request.method,
      containerName,
      route,
      hackEnabled: false
    });
  }

  try {
    let response: Response;
    
    if (useHack) {
      // Use localhost:8080 instead of container.fetch
      const url = new URL(request.url);
      const localhostUrl = `http://localhost:8080${url.pathname}${url.search}`;
      
      // Create a new request with the localhost URL
      const localhostRequest = new Request(localhostUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        // @ts-ignore - duplex might not be in all environments
        duplex: 'half'
      });
      
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Localhost fetch timeout after ${timeout}ms`)), timeout);
      });

      // Race between the actual fetch and timeout
      response = await Promise.race([
        fetch(localhostRequest),
        timeoutPromise
      ]);
    } else {
      // Original container.fetch logic
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Container fetch timeout after ${timeout}ms`)), timeout);
      });

      // Race between the actual fetch and timeout
      response = await Promise.race([
        container.fetch(request),
        timeoutPromise
      ]);
    }

    const duration = Date.now() - startTime;
    
    logWithContext('CONTAINER_FETCH', `${useHack ? 'Localhost' : 'Container'} fetch completed successfully`, {
      containerName,
      route,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      hackEnabled: useHack
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logWithContext('CONTAINER_FETCH', `${useHack ? 'Localhost' : 'Container'} fetch failed`, {
      containerName,
      route,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
      hackEnabled: useHack
    });

    // Return a proper error response instead of throwing
    return new Response(
      JSON.stringify({
        error: `${useHack ? 'Localhost' : 'Container'} fetch failed`,
        message: error instanceof Error ? error.message : String(error),
        containerName,
        route,
        hackEnabled: useHack
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

/**
 * Helper function to extract route information from request URL
 */
export function getRouteFromRequest(request: Request): string {
  try {
    const url = new URL(request.url);
    return url.pathname;
  } catch {
    return 'unknown';
  }
}