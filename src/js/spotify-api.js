class SpotifyAPI {
    constructor(auth) {
        this.auth = auth;
        this.baseUrl = 'https://api.spotify.com/v1';
    }

    async makeRequest(endpoint, options = {}) {
        const token = await this.auth.getValidAccessToken();
        if (!token) {
            throw new Error('No valid access token');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        const response = await fetch(url, config);

        if (response.status === 401) {
            // Token expired, try to refresh
            try {
                await this.auth.refreshAccessToken();
                config.headers['Authorization'] = `Bearer ${this.auth.accessToken}`;
                return fetch(url, config);
            } catch (error) {
                throw new Error('Authentication failed');
            }
        }

        if (!response.ok && response.status !== 204) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        // Handle no content responses
        if (response.status === 204) {
            return null;
        }

        return response.json();
    }

    // Player endpoints
    async getCurrentPlayback() {
        try {
            return await this.makeRequest('/me/player');
        } catch (error) {
            if (error.message.includes('404')) {
                return null; // No active device
            }
            throw error;
        }
    }

    async getCurrentTrack() {
        try {
            return await this.makeRequest('/me/player/currently-playing');
        } catch (error) {
            if (error.message.includes('404')) {
                return null; // No track playing
            }
            throw error;
        }
    }

    async getDevices() {
        return await this.makeRequest('/me/player/devices');
    }

    async transferPlayback(deviceId, play = true) {
        return await this.makeRequest('/me/player', {
            method: 'PUT',
            body: JSON.stringify({
                device_ids: [deviceId],
                play: play
            })
        });
    }

    // Playback control
    async play(contextUri = null, deviceId = null) {
        const params = deviceId ? `?device_id=${deviceId}` : '';
        const body = contextUri ? { context_uri: contextUri } : {};
        
        return await this.makeRequest(`/me/player/play${params}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    async pause(deviceId = null) {
        const params = deviceId ? `?device_id=${deviceId}` : '';
        return await this.makeRequest(`/me/player/pause${params}`, {
            method: 'PUT'
        });
    }

    async next(deviceId = null) {
        const params = deviceId ? `?device_id=${deviceId}` : '';
        return await this.makeRequest(`/me/player/next${params}`, {
            method: 'POST'
        });
    }

    async previous(deviceId = null) {
        const params = deviceId ? `?device_id=${deviceId}` : '';
        return await this.makeRequest(`/me/player/previous${params}`, {
            method: 'POST'
        });
    }

    async seek(positionMs, deviceId = null) {
        const params = new URLSearchParams({ position_ms: positionMs });
        if (deviceId) params.append('device_id', deviceId);
        
        return await this.makeRequest(`/me/player/seek?${params}`, {
            method: 'PUT'
        });
    }

    async setVolume(volumePercent, deviceId = null) {
        const params = new URLSearchParams({ volume_percent: volumePercent });
        if (deviceId) params.append('device_id', deviceId);
        
        return await this.makeRequest(`/me/player/volume?${params}`, {
            method: 'PUT'
        });
    }

    async setShuffle(state, deviceId = null) {
        const params = new URLSearchParams({ state: state });
        if (deviceId) params.append('device_id', deviceId);
        
        return await this.makeRequest(`/me/player/shuffle?${params}`, {
            method: 'PUT'
        });
    }

    async setRepeat(state, deviceId = null) {
        const params = new URLSearchParams({ state: state }); // off, track, context
        if (deviceId) params.append('device_id', deviceId);
        
        return await this.makeRequest(`/me/player/repeat?${params}`, {
            method: 'PUT'
        });
    }

    // Library endpoints
    async checkSavedTracks(trackIds) {
        const ids = Array.isArray(trackIds) ? trackIds.join(',') : trackIds;
        return await this.makeRequest(`/me/tracks/contains?ids=${ids}`);
    }

    async saveTrack(trackId) {
        return await this.makeRequest('/me/tracks', {
            method: 'PUT',
            body: JSON.stringify({
                ids: [trackId]
            })
        });
    }

    async removeSavedTrack(trackId) {
        return await this.makeRequest('/me/tracks', {
            method: 'DELETE',
            body: JSON.stringify({
                ids: [trackId]
            })
        });
    }

    // User profile
    async getCurrentUser() {
        return await this.makeRequest('/me');
    }

    // Search
    async search(query, type = 'track', limit = 20, offset = 0) {
        const params = new URLSearchParams({
            q: query,
            type: type, // track, album, artist, playlist
            limit: limit,
            offset: offset
        });
        
        return await this.makeRequest(`/search?${params}`);
    }

    // Recently played
    async getRecentlyPlayed(limit = 20) {
        const params = new URLSearchParams({ limit: limit });
        return await this.makeRequest(`/me/player/recently-played?${params}`);
    }

    // Queue
    async getQueue() {
        return await this.makeRequest('/me/player/queue');
    }

    async addToQueue(uri, deviceId = null) {
        const params = new URLSearchParams({ uri: uri });
        if (deviceId) params.append('device_id', deviceId);
        
        return await this.makeRequest(`/me/player/queue?${params}`, {
            method: 'POST'
        });
    }

    // Playlists (basic methods for miniplayer)
    async getUserPlaylists(limit = 20, offset = 0) {
        const params = new URLSearchParams({
            limit: limit,
            offset: offset
        });
        
        return await this.makeRequest(`/me/playlists?${params}`);
    }

    async getPlaylist(playlistId, fields = null) {
        const params = fields ? `?fields=${fields}` : '';
        return await this.makeRequest(`/playlists/${playlistId}${params}`);
    }

    async getPlaylistTracks(playlistId, limit = 100, offset = 0) {
        const params = new URLSearchParams({
            limit: limit,
            offset: offset
        });
        
        return await this.makeRequest(`/playlists/${playlistId}/tracks?${params}`);
    }

    // Albums
    async getAlbum(albumId) {
        return await this.makeRequest(`/albums/${albumId}`);
    }

    async getAlbumTracks(albumId, limit = 50, offset = 0) {
        const params = new URLSearchParams({
            limit: limit,
            offset: offset
        });
        
        return await this.makeRequest(`/albums/${albumId}/tracks?${params}`);
    }

    // Artists
    async getArtist(artistId) {
        return await this.makeRequest(`/artists/${artistId}`);
    }

    async getArtistTopTracks(artistId, market = 'US') {
        return await this.makeRequest(`/artists/${artistId}/top-tracks?market=${market}`);
    }

    // Helper methods for miniplayer
    formatTrackDuration(durationMs) {
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    formatProgress(progressMs, durationMs) {
        const current = this.formatTrackDuration(progressMs);
        const total = this.formatTrackDuration(durationMs);
        return { current, total };
    }

    getImageUrl(images, size = 'medium') {
        if (!images || images.length === 0) return null;
        
        // Return appropriate size image
        if (size === 'small' && images.length > 2) return images[2].url;
        if (size === 'large') return images[0].url;
        return images[1]?.url || images[0]?.url; // medium or fallback to largest
    }

    // Utility method to extract track ID from Spotify URI
    extractTrackId(uri) {
        if (!uri) return null;
        return uri.split(':').pop();
    }

    // Check if current user is premium (required for playback control)
    async isPremiumUser() {
        try {
            const user = await this.getCurrentUser();
            return user.product === 'premium';
        } catch (error) {
            console.error('Error checking user subscription:', error);
            return false;
        }
    }
}

module.exports = SpotifyAPI;