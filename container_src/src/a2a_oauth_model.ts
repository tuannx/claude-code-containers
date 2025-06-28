import {
  ClientCredentialsModel,
  User, Client, Token, Falsey, AuthorizationCode,
} from 'oauth2-server';
import { v4 as uuidv4 } from 'uuid';

// For simplicity, using in-memory storage for clients and tokens.
// In a production environment, use a persistent database.

interface OAuthClient extends Client {
  id: string;
  clientSecret: string;
  grants: string[];
  // redirectUris: string[]; // Not strictly needed for client_credentials
}

interface OAuthToken extends Token {
  accessToken: string;
  accessTokenExpiresAt?: Date;
  scope?: string | string[];
  client: OAuthClient;
  user: User; // Not used in client_credentials but required by type
}

// Hardcoded client for demonstration purposes
const clients: OAuthClient[] = [
  {
    id: 'a2a-claude-client-123', // Example client_id
    clientSecret: 'verysecretclientkey', // Example client_secret
    grants: ['client_credentials'],
    // redirectUris: [],
  },
];

const tokens: OAuthToken[] = [];

const model: ClientCredentialsModel = {
  getClient: async (clientId: string, clientSecret: string | null): Promise<OAuthClient | Falsey> => {
    console.log(`OAuthModel: getClient called for clientId: ${clientId}`);
    const client = clients.find(c => c.id === clientId);
    if (!client) {
      console.warn(`OAuthModel: Client not found: ${clientId}`);
      return false;
    }
    if (clientSecret && client.clientSecret !== clientSecret) {
      console.warn(`OAuthModel: Client secret mismatch for: ${clientId}`);
      return false;
    }
    console.log(`OAuthModel: Client found: ${clientId}`);
    return client;
  },

  saveToken: async (token: Token, client: Client, user: User): Promise<Token | Falsey> => {
    console.log('OAuthModel: saveToken called', { accessToken: token.accessToken, clientId: client.id });
    const newToken: OAuthToken = {
      ...token,
      client: client as OAuthClient,
      user, // User is not really used in client_credentials but the type expects it
    };
    tokens.push(newToken);
    return newToken;
  },

  getAccessToken: async (accessToken: string): Promise<Token | Falsey> => {
    console.log(`OAuthModel: getAccessToken called for token: ${accessToken.substring(0,10)}...`);
    const token = tokens.find(t => t.accessToken === accessToken);
    if (!token) {
      console.warn('OAuthModel: Access token not found');
      return false;
    }
    if (token.accessTokenExpiresAt && token.accessTokenExpiresAt < new Date()) {
      console.warn('OAuthModel: Access token expired');
      // Optionally, remove expired tokens from the store
      // tokens = tokens.filter(t => t.accessToken !== accessToken);
      return false;
    }
    console.log(`OAuthModel: Access token found for client: ${token.client.id}`);
    return token;
  },

  verifyScope: async (token: Token, scope: string | string[]): Promise<boolean> => {
    console.log('OAuthModel: verifyScope called', { accessToken: token.accessToken.substring(0,10)+'...' , requiredScope: scope });
    if (!token.scope) {
      console.warn('OAuthModel: No scope associated with token.');
      return false; // Or true if you allow access to unscoped tokens
    }
    const tokenScopes = Array.isArray(token.scope) ? token.scope : [token.scope];
    const requiredScopes = Array.isArray(scope) ? scope : [scope];

    const hasAllScopes = requiredScopes.every(s => tokenScopes.includes(s));
    console.log(`OAuthModel: Scope verification result: ${hasAllScopes}`);
    return hasAllScopes;
  },

  // generateAccessToken(client, user, scope) is optional and will be implicitly provided by the library.
  // It's useful if you want to customize token generation.
  // For client_credentials, user is usually null or a system user.

  // The following are not used by client_credentials but are part of the comprehensive model interface
  // To make this model strictly for ClientCredentials, one might need to use a partial type or specific model from the library
  // However, `oauth2-server` often expects a more complete model object.

  // getAuthorizationCode: async (authorizationCode: string): Promise<AuthorizationCode | Falsey> => {
  //   console.warn('OAuthModel: getAuthorizationCode not implemented for client_credentials');
  //   return false;
  // },
  // saveAuthorizationCode: async (code: Pick<AuthorizationCode, "authorizationCode" | "expiresAt" | "redirectUri" | "scope">, client: Client, user: User): Promise<AuthorizationCode | Falsey> => {
  //   console.warn('OAuthModel: saveAuthorizationCode not implemented for client_credentials');
  //   return false;
  // },
  // revokeAuthorizationCode: async (code: AuthorizationCode): Promise<boolean> => {
  //   console.warn('OAuthModel: revokeAuthorizationCode not implemented for client_credentials');
  //   return false;
  // },
  // revokeToken: async (token: Token): Promise<boolean> => {
  //   console.log(`OAuthModel: revokeToken called for token: ${token.accessToken.substring(0,10)}...`);
  //   const index = tokens.findIndex(t => t.accessToken === token.accessToken);
  //   if (index !== -1) {
  //     tokens.splice(index, 1);
  //     console.log('OAuthModel: Token revoked successfully');
  //     return true;
  //   }
  //   console.warn('OAuthModel: Token not found for revocation');
  //   return false;
  // }
};

export default model;
