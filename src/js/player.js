const { ipcRenderer } = require('electron');

class PlayerController {
    constructor(spotifyAPI) {
        this.api = spotifyAPI;
        
        // Player state
        this.currentTrack = null;
        this.playbackState = null;
        this.devices = [];
        this.isPlaying = false;
        this.isPremium = false;
        this.progressMs = 0;
        this.durationMs = 0;
        this.volume = 50;
        this.shuffleState = false;
        this.repeatState = 'off'; // 'off', 'track', 'context'
        
        // Update intervals
        this.updateInterval = null;
        this.progressInterval = null;
        
        // Event callbacks
        this.callbacks = {
            onTrackChange: [],
            onPlayStateChange: [],
            onProgressUpdate: [],
            onVolumeChange: [],
            onShuffleChange: [],
            onRepeatChange: [],
            onError: []
        };

        // Bind methods
        this.updatePlayerState = this.updatePlayerState.bind(this);
        this.updateProgress = this.updateProgress.bind(this);
        
        // Initialize
        this.init();
    }

    async init() {
        try {
            // Check if user is premium
            this.isPremium = await this.api.isPremiumUser();
            
            if (!this.isPremium) {
                this.emit('error', 'Spotify Premium required for playback control');
                return;
            }

            // Get initial state
            await this.updatePlayerState();
            await this.getAvailableDevices();
            
            // Start update intervals
            this.startUpdateIntervals();
            
        } catch (error) {
            console.error('Error initializing player:', error);
            this.emit('error', error.message);
        }
    }

    // Start periodic updates
    startUpdateIntervals() {
        // Update player state every 5 seconds
        this.updateInterval = setInterval(() => {
            this.updatePlayerState();
        }, 5000);
        
        // Update progress every second when playing
        this.progressInterval = setInterval(() => {
            if (this.isPlaying) {
                this.updateProgress();
            }
        }, 1000);
    }

    // Stop update intervals
    stopUpdateIntervals() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    // Update player state from Spotify API
    async updatePlayerState() {
        try {
            const playbackState = await this.api.getCurrentPlayback();
            
            if (!playbackState) {
                // No active device
                this.playbackState = null;
                this.currentTrack = null;
                this.isPlaying = false;
                this.emit('playStateChange', false);
                return;
            }

            const previousTrack = this.currentTrack;
            const wasPlaying = this.isPlaying;
            
            // Update state
            this.playbackState = playbackState;
            this.currentTrack = playbackState.item;
            this.isPlaying = playbackState.is_playing;
            this.progressMs = playbackState.progress_ms || 0;
            this.durationMs = playbackState.item?.duration_ms || 0;
            this.volume = playbackState.device?.volume_percent || 50;
            this.shuffleState = playbackState.shuffle_state;
            this.repeatState = playbackState.repeat_state;
            
            // Emit events for changes
            if (previousTrack?.id !== this.currentTrack?.id) {
                this.emit('trackChange', this.currentTrack);
            }
            
            if (wasPlaying !== this.isPlaying) {
                this.emit('playStateChange', this.isPlaying);
            }
            
            this.emit('progressUpdate', this.progressMs, this.durationMs);
            
        } catch (error) {
            console.error('Error updating player state:', error);
            this.emit('error', error.message);
        }
    }

    // Update progress (local increment to avoid API spam)
    updateProgress() {
        if (this.isPlaying && this.durationMs > 0) {
            this.progressMs = Math.min(this.progressMs + 1000, this.durationMs);
            this.emit('progressUpdate', this.progressMs, this.durationMs);
        }
    }

    // Get available devices
    async getAvailableDevices() {
        try {
            const response = await this.api.getDevices();
            this.devices = response.devices || [];
            return this.devices;
        } catch (error) {
            console.error('Error getting devices:', error);
            this.emit('error', error.message);
            return [];
        }
    }

    // Playback controls
    async play() {
        try {
            await this.api.play();
            this.isPlaying = true;
            this.emit('playStateChange', true);
            
            // Force immediate state update
            setTimeout(() => this.updatePlayerState(), 500);
        } catch (error) {
            console.error('Error playing:', error);
            this.emit('error', error.message);
        }
    }

    async pause() {
        try {
            await this.api.pause();
            this.isPlaying = false;
            this.emit('playStateChange', false);
            
            // Force immediate state update
            setTimeout(() => this.updatePlayerState(), 500);
        } catch (error) {
            console.error('Error pausing:', error);
            this.emit('error', error.message);
        }
    }

    async togglePlayPause() {
        if (this.isPlaying) {
            await this.pause();
        } else {
            await this.play();
        }
    }

    async next() {
        try {
            await this.api.next();
            
            // Force immediate state update after a short delay
            setTimeout(() => this.updatePlayerState(), 1000);
        } catch (error) {
            console.error('Error skipping to next:', error);
            this.emit('error', error.message);
        }
    }

    async previous() {
        try {
            await this.api.previous();
            
            // Force immediate state update after a short delay
            setTimeout(() => this.updatePlayerState(), 1000);
        } catch (error) {
            console.error('Error skipping to previous:', error);
            this.emit('error', error.message);
        }
    }

    async seek(positionMs) {
        try {
            await this.api.seek(positionMs);
            this.progressMs = positionMs;
            this.emit('progressUpdate', this.progressMs, this.durationMs);
        } catch (error) {
            console.error('Error seeking:', error);
            this.emit('error', error.message);
        }
    }

    async setVolume(volumePercent) {
        try {
            await this.api.setVolume(volumePercent);
            this.volume = volumePercent;
            this.emit('volumeChange', volumePercent);
        } catch (error) {
            console.error('Error setting volume:', error);
            this.emit('error', error.message);
        }
    }

    async toggleShuffle() {
        try {
            const newState = !this.shuffleState;
            await this.api.setShuffle(newState);
            this.shuffleState = newState;
            this.emit('shuffleChange', newState);
        } catch (error) {
            console.error('Error toggling shuffle:', error);
            this.emit('error', error.message);
        }
    }

    async cycleRepeat() {
        try {
            const states = ['off', 'context', 'track'];
            const currentIndex = states.indexOf(this.repeatState);
            const nextState = states[(currentIndex + 1) % states.length];
            
            await this.api.setRepeat(nextState);
            this.repeatState = nextState;
            this.emit('repeatChange', nextState);
        } catch (error) {
            console.error('Error cycling repeat:', error);
            this.emit('error', error.message);
        }
    }

    // Like/unlike current track
    async toggleLike() {
        if (!this.currentTrack) return;
        
        try {
            const trackId = this.api.extractTrackId(this.currentTrack.uri);
            const [isLiked] = await this.api.checkSavedTracks(trackId);
            
            if (isLiked) {
                await this.api.removeSavedTrack(trackId);
            } else {
                await this.api.saveTrack(trackId);
            }
            
            // Update UI
            this.emit('trackChange', this.currentTrack);
            
        } catch (error) {
            console.error('Error toggling like:', error);
            this.emit('error', error.message);
        }
    }

    async isCurrentTrackLiked() {
        if (!this.currentTrack) return false;
        
        try {
            const trackId = this.api.extractTrackId(this.currentTrack.uri);
            const [isLiked] = await this.api.checkSavedTracks(trackId);
            return isLiked;
        } catch (error) {
            console.error('Error checking if track is liked:', error);
            return false;
        }
    }

    // Transfer playback to device
    async transferToDevice(deviceId) {
        try {
            await this.api.transferPlayback(deviceId, this.isPlaying);
            
            // Update devices and state
            setTimeout(() => {
                this.getAvailableDevices();
                this.updatePlayerState();
            }, 1000);
            
        } catch (error) {
            console.error('Error transferring playback:', error);
            this.emit('error', error.message);
        }
    }

    // Event handling
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
    }

    off(event, callback) {
        if (this.callbacks[event]) {
            const index = this.callbacks[event].indexOf(callback);
            if (index > -1) {
                this.callbacks[event].splice(index, 1);
            }
        }
    }

    emit(event, ...args) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in ${event} callback:`, error);
                }
            });
        }
    }

    // Utility methods
    getProgressPercentage() {
        if (this.durationMs === 0) return 0;
        return (this.progressMs / this.durationMs) * 100;
    }

    getFormattedTime() {
        return this.api.formatProgress(this.progressMs, this.durationMs);
    }

    getCurrentTrackImage(size = 'medium') {
        if (!this.currentTrack?.album?.images) return null;
        return this.api.getImageUrl(this.currentTrack.album.images, size);
    }

    getArtistsString() {
        if (!this.currentTrack?.artists) return '';
        return this.currentTrack.artists.map(artist => artist.name).join(', ');
    }

    // Cleanup
    destroy() {
        this.stopUpdateIntervals();
        this.callbacks = {};
    }
}

module.exports = PlayerController;