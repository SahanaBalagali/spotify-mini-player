class SpotifyAuth {
    constructor() {
        // Replace with your actual Spotify app credentials
        this.clientId = '5abd564556f34664b5e7dd625d345055';
        this.redirectUri = 'http://127.0.0.1:3000/callback';
        
        // Log initialization
        console.log('🔑 SpotifyAuth initialized with Client ID:', this.clientId);
        
        if (this.clientId === '5abd564556f34664b5e7dd625d345055') {
            console.warn('⚠️  You are using the default Client ID! Please update it with your actual Spotify app Client ID.');
        }
        
        // Required scopes for miniplayer functionality
        this.scopes = [
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-read-currently-playing',
            'user-read-recently-played',
            'user-library-read',
            'user-library-modify',
            'playlist-read-private',
            'playlist-read-collaborative',
            'streaming'
        ].join(' ');

        // Auth state
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.codeVerifier = null;
        this.state = null;

        // Load saved tokens on initialization
        this.loadTokens();
    }

    // Generate PKCE code verifier and challenge (browser-safe version)
    generateCodeVerifier() {
        // Use browser-safe crypto API instead of Node.js crypto
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    async generateCodeChallenge(verifier) {
        // Use Web Crypto API instead of Node.js crypto
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this.base64URLEncode(new Uint8Array(digest));
    }

    generateState() {
        // Use browser-safe crypto API
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Helper function for base64URL encoding
    base64URLEncode(buffer) {
        return btoa(String.fromCharCode(...buffer))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    // Build authorization URL
    async buildAuthUrl() {
        this.codeVerifier = this.generateCodeVerifier();
        this.state = this.generateState();
        
        const codeChallenge = await this.generateCodeChallenge(this.codeVerifier);
        
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            state: this.state,
            scope: this.scopes
        });

        const authUrl = `https://accounts.spotify.com/authorize?${params}`;
        console.log('🔗 Generated auth URL:', authUrl);
        return authUrl;
    }

    // Start OAuth flow
    async startAuth() {
        try {
            const authUrl = await this.buildAuthUrl();
            console.log('🌐 Attempting to open browser...');
            
            // Use IPC to open browser via main process
            const opened = await ipcRenderer.invoke('open-external-url', authUrl);
            
            if (opened) {
                console.log('✅ Browser opened successfully');
                return true;
            } else {
                console.log('❌ Failed to open browser');
                console.log('📋 Manual authorization URL:', authUrl);
                console.log('👆 Copy the URL above and paste it into your browser');
                throw new Error('Failed to open browser automatically');
            }
        } catch (error) {
            console.error('❌ Error opening browser:', error);
            console.log('📋 Manual authorization URL:', await this.buildAuthUrl());
            console.log('👆 Copy the URL above and paste it into your browser');
            throw error;
        }
    }

    // Exchange authorization code for access token
    async exchangeCodeForToken(code) {
        const tokenUrl = 'https://accounts.spotify.com/api/token';
        
        const body = new URLSearchParams({
            client_id: this.clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.redirectUri,
            code_verifier: this.codeVerifier
        });

        try {
            console.log('🔄 Exchanging authorization code for access token...');
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Token exchange error:', errorData);
                throw new Error(errorData.error_description || 'Token exchange failed');
            }

            const data = await response.json();
            
            this.accessToken = data.access_token;
            this.refreshToken = data.refresh_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            // Save tokens
            this.saveTokens();
            
            console.log('✅ Authentication successful!');
            
            // Emit auth success event
            if (this.onAuthSuccess) {
                this.onAuthSuccess();
            }

            return data;
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            throw error;
        }
    }

    // Refresh access token
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        const tokenUrl = 'https://accounts.spotify.com/api/token';
        
        const body = new URLSearchParams({
            client_id: this.clientId,
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken
        });

        try {
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error_description || 'Token refresh failed');
            }

            const data = await response.json();
            
            this.accessToken = data.access_token;
            if (data.refresh_token) {
                this.refreshToken = data.refresh_token;
            }
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);

            // Save updated tokens
            this.saveTokens();
            
            return data.access_token;
        } catch (error) {
            console.error('Error refreshing token:', error);
            // Clear invalid tokens
            this.clearTokens();
            throw error;
        }
    }

    // Get valid access token (refresh if needed)
    async getValidAccessToken() {
        if (!this.accessToken) {
            return null;
        }

        // Check if token is expired (with 5 minute buffer)
        if (this.tokenExpiry && Date.now() >= (this.tokenExpiry - 5 * 60 * 1000)) {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                return null;
            }
        }

        return this.accessToken;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!(this.accessToken && this.refreshToken);
    }

    // Save tokens to localStorage (Electron renderer process)
    saveTokens() {
        const tokenData = {
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            tokenExpiry: this.tokenExpiry
        };

        try {
            localStorage.setItem('spotify-tokens', JSON.stringify(tokenData));
        } catch (error) {
            console.error('Error saving tokens:', error);
        }
    }

    // Load tokens from localStorage
    loadTokens() {
        try {
            const tokenData = localStorage.getItem('spotify-tokens');
            if (tokenData) {
                const parsed = JSON.parse(tokenData);
                this.accessToken = parsed.accessToken;
                this.refreshToken = parsed.refreshToken;
                this.tokenExpiry = parsed.tokenExpiry;
            }
        } catch (error) {
            console.error('Error loading tokens:', error);
        }
    }

    // Clear tokens
    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;

        try {
            localStorage.removeItem('spotify-tokens');
        } catch (error) {
            console.error('Error clearing tokens:', error);
        }

        // Emit auth cleared event
        if (this.onAuthCleared) {
            this.onAuthCleared();
        }
    }

    // Logout
    logout() {
        this.clearTokens();
    }

    // Set auth event callbacks
    setOnAuthSuccess(callback) {
        this.onAuthSuccess = callback;
    }

    setOnAuthCleared(callback) {
        this.onAuthCleared = callback;
    }
}

// Make sure the class is available globally
window.SpotifyAuth = SpotifyAuth;
console.log('📦 SpotifyAuth class loaded');