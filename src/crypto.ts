import jwt from '@tsndr/cloudflare-worker-jwt';

// Encryption utilities
export async function encrypt(text: string, key?: CryptoKey): Promise<string> {
    if (!key) {
        // Generate a simple key from static data for now
        // In production, this should use proper key management
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode('github-app-encryption-key-32char'),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );
        key = keyMaterial;
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(text);

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedText
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedText: string, key?: CryptoKey): Promise<string> {
    if (!key) {
        // Generate the same key
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode('github-app-encryption-key-32char'),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
        key = keyMaterial;
    }

    const combined = new Uint8Array(
        atob(encryptedText)
            .split('')
            .map(char => char.charCodeAt(0))
    );

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}

// JWT token generation for GitHub App authentication
async function generateAppJWT(appId: string, privateKey: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
        iss: appId,
        iat: now - 60, // Issue time (1 minute ago to account for clock skew)
        exp: now + 600, // Expiration time (10 minutes from now)
    };

    // GitHub requires RS256 algorithm for App JWT tokens
    const token = await jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    return token;
}

// Generate installation access token for making GitHub API calls
export async function generateInstallationToken(
    appId: string,
    privateKey: string,
    installationId: string
): Promise<{ token: string; expires_at: string } | null> {
    try {
        // First, generate App JWT
        const appJWT = await generateAppJWT(appId, privateKey);

        // Exchange for installation access token
        const response = await fetch(
            `https://api.github.com/app/installations/${installationId}/access_tokens`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${appJWT}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Worker-GitHub-Integration'
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to generate installation token: ${response.status} ${errorText}`);
            return null;
        }

        const tokenData = await response.json() as { token: string; expires_at: string };
        return tokenData;
    } catch (error) {
        console.error('Error generating installation token:', error);
        return null;
    }
}
