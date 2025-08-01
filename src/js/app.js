// ipcRenderer is already available from the HTML script tag

class SpotifyMiniplayer {
    constructor() {
        this.auth = null;
        this.api = null;
        this.player = null;
        this.isAuthenticated = false;
        this.currentTrack = null;
        this.isPlaying = false;

        // Update intervals for smooth real-time updates
        this.stateUpdateInterval = null;
        this.progressUpdateInterval = null;
        this.lastProgressUpdate = 0;
        this.localProgressMs = 0;
        this.durationMs = 0;

        // UI Elements
        this.elements = {};

        // Initialize
        this.init();
    }

    async init() {
        // Get DOM elements
        this.cacheElements();

        // Set up event listeners
        this.setupEventListeners();

        // Wait a moment for the main process to be ready
        await new Promise(resolve => setTimeout(resolve, 500));

        // Initialize auth
        this.auth = new SpotifyAuth();
        this.api = new SpotifyAPI(this.auth);

        // Set up auth callbacks
        this.auth.onAuthSuccess = () => this.onAuthSuccess();
        this.auth.onAuthCleared = () => this.onAuthCleared();

        // Check if already authenticated
        if (this.auth.isAuthenticated()) {
            await this.onAuthSuccess();
        }

        // Listen for auth callback from main process
        ipcRenderer.on('auth-callback', (event, data) => {
            console.log('📨 Received auth callback:', data);
            this.handleAuthCallback(data);
        });

        console.log('🎵 Spotify Miniplayer initialized');
    }

    cacheElements() {
        console.log('📋 Caching DOM elements...');

        // Screens
        this.elements.authScreen = document.getElementById('authScreen');
        this.elements.playerContent = document.getElementById('playerContent');

        // Auth
        this.elements.connectBtn = document.getElementById('connectBtn');
        this.elements.manualUrl = document.getElementById('manualUrl');
        this.elements.manualUrlText = document.getElementById('manualUrlText');
        this.elements.manualUrlBox = document.getElementById('manualUrlBox');

        console.log('🔍 Connect button found:', !!this.elements.connectBtn);
        console.log('🔍 Auth screen found:', !!this.elements.authScreen);

        // Window controls
        this.elements.minimizeBtn = document.getElementById('minimizeBtn');
        this.elements.closeBtn = document.getElementById('closeBtn');
        this.elements.alwaysOnTopBtn = document.getElementById('alwaysOnTopBtn');

        // Track info and hover area
        this.elements.albumArt = document.getElementById('albumArt');
        this.elements.trackName = document.getElementById('trackName');
        this.elements.artistName = document.getElementById('artistName');
        this.elements.albumArtArea = document.getElementById('albumArtArea');
        this.elements.controlsOverlay = document.getElementById('controlsOverlay');
        this.elements.heartBtn = document.getElementById('heartBtn');

        // Controls
        this.elements.shuffleBtn = document.getElementById('shuffleBtn');
        this.elements.prevBtn = document.getElementById('prevBtn');
        this.elements.playPauseBtn = document.getElementById('playPauseBtn');
        this.elements.nextBtn = document.getElementById('nextBtn');
        this.elements.repeatBtn = document.getElementById('repeatBtn');

        // Progress
        this.elements.progressBar = document.getElementById('progressBar');
        this.elements.progressFill = document.getElementById('progressFill');
        this.elements.currentTime = document.getElementById('currentTime');
        this.elements.totalTime = document.getElementById('totalTime');
    }

    setupEventListeners() {
        // Window controls
        this.elements.minimizeBtn?.addEventListener('click', () => {
            ipcRenderer.invoke('minimize-window');
        });

        this.elements.closeBtn?.addEventListener('click', () => {
            ipcRenderer.invoke('quit-app');
        });

        this.elements.alwaysOnTopBtn?.addEventListener('click', async () => {
            const isOnTop = await ipcRenderer.invoke('toggle-always-on-top');
            this.elements.alwaysOnTopBtn.style.opacity = isOnTop ? '1' : '0.7';
        });

        // Auth
        this.elements.connectBtn?.addEventListener('click', () => {
            console.log('🖱️ Connect button clicked!');
            try {
                this.startAuth();
            } catch (error) {
                console.error('❌ Error in startAuth:', error);
            }
        });

        // Manual URL copy
        this.elements.manualUrlBox?.addEventListener('click', () => {
            this.copyToClipboard();
        });

        // Album art area hover effects
        this.elements.albumArtArea?.addEventListener('mouseenter', () => {
            this.showControls();
        });

        this.elements.albumArtArea?.addEventListener('mouseleave', () => {
            this.hideControls();
        });

        // Player controls with improved error handling
        this.elements.playPauseBtn?.addEventListener('click', () => {
            console.log('🖱️ Play/Pause button clicked!');
            this.togglePlayPauseWithRetry();
        });

        this.elements.nextBtn?.addEventListener('click', () => {
            this.nextTrackWithRetry();
        });

        this.elements.prevBtn?.addEventListener('click', () => {
            this.previousTrackWithRetry();
        });

        this.elements.shuffleBtn?.addEventListener('click', () => {
            this.toggleShuffleWithRetry();
        });

        this.elements.repeatBtn?.addEventListener('click', () => {
            this.cycleRepeatWithRetry();
        });

        // Heart button
        this.elements.heartBtn?.addEventListener('click', () => {
            this.toggleLikeWithRetry();
        });

        // Progress bar
        this.elements.progressBar?.addEventListener('click', (e) => {
            console.log('🎯 Progress bar clicked');
            this.seekToPosition(e);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlayPauseWithRetry();
            } else if (e.code === 'KeyR' && e.ctrlKey) {
                e.preventDefault();
                this.forceRefreshState();
            }
        });
    }

    // Start real-time update intervals
    startUpdateIntervals() {
        console.log('🔄 Starting update intervals...');

        // Clear any existing intervals
        this.stopUpdateIntervals();

        // Update player state every 5 seconds
        this.stateUpdateInterval = setInterval(() => {
            this.updatePlayerState();
        }, 5000);

        // Update progress every second when playing
        this.progressUpdateInterval = setInterval(() => {
            if (this.isPlaying && this.durationMs > 0) {
                this.updateLocalProgress();
            }
        }, 1000);

        console.log('✅ Update intervals started');
    }

    // Stop update intervals
    stopUpdateIntervals() {
        if (this.stateUpdateInterval) {
            clearInterval(this.stateUpdateInterval);
            this.stateUpdateInterval = null;
        }

        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
            this.progressUpdateInterval = null;
        }
    }

    // Update local progress counter for smooth UI
    updateLocalProgress() {
        if (this.isPlaying && this.durationMs > 0) {
            this.localProgressMs = Math.min(this.localProgressMs + 1000, this.durationMs);
            this.updateProgressUI(this.localProgressMs, this.durationMs);
        }
    }

    // Update progress UI elements
    updateProgressUI(progressMs, durationMs) {
        if (durationMs === 0) return;

        const percentage = (progressMs / durationMs) * 100;
        this.elements.progressFill.style.width = `${percentage}%`;

        this.elements.currentTime.textContent = this.formatTime(progressMs);
        this.elements.totalTime.textContent = this.formatTime(durationMs);
    }

    // Update player state from Spotify API
    async updatePlayerState() {
        if (!this.api) return;

        try {
            console.log('🔄 Updating player state...');
            const state = await this.api.getCurrentPlayback();

            if (!state) {
                console.log('❌ No active playback state');
                this.handleNoPlayback();
                return;
            }

            // Check if track changed
            const trackChanged = !this.currentTrack || this.currentTrack.id !== state.item?.id;

            // Update state
            this.currentTrack = state.item;
            this.isPlaying = state.is_playing;
            this.localProgressMs = state.progress_ms || 0;
            this.durationMs = state.item?.duration_ms || 0;
            this.lastProgressUpdate = Date.now();

            // Update UI
            if (trackChanged) {
                await this.updateTrackInfo(this.currentTrack);
            }

            this.updatePlayButtonIcon();
            this.updateProgressUI(this.localProgressMs, this.durationMs);
            this.updateShuffleButton(state.shuffle_state);
            this.updateRepeatButton(state.repeat_state);

            console.log('✅ Player state updated successfully');

        } catch (error) {
            console.log('❌ Error updating player state:', error.message);
            // Don't show error to user for routine updates unless it's critical
            if (!error.message.includes('not valid JSON')) {
                this.showError('Connection issue with Spotify');
            }
        }
    }

    handleNoPlayback() {
        this.isPlaying = false;
        this.updatePlayButtonIcon();

        // Try to get recently played if nothing is currently playing
        this.loadRecentTrack();
    }

    // Enhanced play/pause with retry logic
    async togglePlayPauseWithRetry(retries = 2) {
        if (!this.api) {
            this.showError('Not connected to Spotify');
            return;
        }

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                // First get current state to ensure we have the right info
                const currentState = await this.api.getCurrentPlayback();

                if (!currentState) {
                    this.showError('Start playing music in Spotify first!');
                    return;
                }

                console.log(`🎵 Play/Pause attempt ${attempt + 1} - current state:`, currentState.is_playing);

                // Update our local state and UI immediately
                this.currentTrack = currentState.item;
                this.localProgressMs = currentState.progress_ms || 0;
                this.durationMs = currentState.item?.duration_ms || 0;
                this.updateTrackInfo(this.currentTrack);

                // Send the command
                if (currentState.is_playing) {
                    await this.api.pause();
                    this.isPlaying = false;
                } else {
                    await this.api.play();
                    this.isPlaying = true;
                }

                // Update UI immediately
                this.updatePlayButtonIcon();

                // Verify the change worked after a delay
                setTimeout(() => {
                    this.updatePlayerState();
                }, 1500);

                console.log('✅ Play/pause command successful');
                return;

            } catch (error) {
                console.log(`❌ Play/pause attempt ${attempt + 1} failed:`, error.message);

                // If it's just a JSON parsing error, the command probably worked
                if (error.message.includes('not valid JSON') || error.message.includes('Unexpected token')) {
                    console.log('🤷 JSON error but command likely worked');
                    // Toggle local state and update UI
                    this.isPlaying = !this.isPlaying;
                    this.updatePlayButtonIcon();
                    // Verify state after delay
                    setTimeout(() => this.updatePlayerState(), 1500);
                    return;
                }

                // If this is the last attempt, show error
                if (attempt === retries) {
                    if (error.message.includes('403')) {
                        this.showError('Need Spotify Premium to control playback');
                    } else if (error.message.includes('404')) {
                        this.showError('No active Spotify device found');
                    } else {
                        this.showError(`Playback error: ${error.message}`);
                    }
                }

                // Wait before retrying
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    }

    // Enhanced track control methods with retry logic
    async nextTrackWithRetry(retries = 1) {
        if (!this.api) return;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                await this.api.next();
                console.log('✅ Next track command sent');

                // Update state after delay
                setTimeout(() => this.updatePlayerState(), 2000);
                return;

            } catch (error) {
                console.log(`❌ Next track attempt ${attempt + 1} failed:`, error.message);

                if (error.message.includes('not valid JSON')) {
                    console.log('🤷 JSON error but command likely worked');
                    setTimeout(() => this.updatePlayerState(), 2000);
                    return;
                }

                if (attempt === retries) {
                    this.showError('Failed to skip track');
                }
            }
        }
    }

    async previousTrackWithRetry(retries = 1) {
        if (!this.api) return;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                await this.api.previous();
                console.log('✅ Previous track command sent');

                setTimeout(() => this.updatePlayerState(), 2000);
                return;

            } catch (error) {
                console.log(`❌ Previous track attempt ${attempt + 1} failed:`, error.message);

                if (error.message.includes('not valid JSON')) {
                    console.log('🤷 JSON error but command likely worked');
                    setTimeout(() => this.updatePlayerState(), 2000);
                    return;
                }

                if (attempt === retries) {
                    this.showError('Failed to go to previous track');
                }
            }
        }
    }

    async toggleShuffleWithRetry() {
        if (!this.api) return;

        try {
            const state = await this.api.getCurrentPlayback();
            if (!state) return;

            const newShuffleState = !state.shuffle_state;
            await this.api.setShuffle(newShuffleState);

            this.updateShuffleButton(newShuffleState);
            console.log('✅ Shuffle toggled to:', newShuffleState);

        } catch (error) {
            console.log('❌ Shuffle toggle failed:', error.message);
            if (!error.message.includes('not valid JSON')) {
                this.showError('Failed to toggle shuffle');
            }
        }
    }

    async cycleRepeatWithRetry() {
        if (!this.api) return;

        try {
            const state = await this.api.getCurrentPlayback();
            if (!state) return;

            const states = ['off', 'context', 'track'];
            const currentIndex = states.indexOf(state.repeat_state);
            const nextState = states[(currentIndex + 1) % states.length];

            await this.api.setRepeat(nextState);
            this.updateRepeatButton(nextState);
            console.log('✅ Repeat cycled to:', nextState);

        } catch (error) {
            console.log('❌ Repeat cycle failed:', error.message);
            if (!error.message.includes('not valid JSON')) {
                this.showError('Failed to change repeat mode');
            }
        }
    }

    async toggleLikeWithRetry() {
        if (!this.currentTrack) {
            return; // Silent fail if no track
        }

        const trackId = this.extractTrackId(this.currentTrack.uri || this.currentTrack.id);
        if (!trackId) {
            return; // Silent fail if no track ID
        }

        console.log('💖 Toggling like for track:', this.currentTrack.name, 'ID:', trackId);

        // Show loading state
        const originalOpacity = this.elements.heartBtn.style.opacity;
        this.elements.heartBtn.style.opacity = '0.6';
        this.elements.heartBtn.style.pointerEvents = 'none';

        try {
            // Step 1: Check current like status
            let isCurrentlyLiked = false;
            try {
                const likedResponse = await this.api.checkSavedTracks(trackId);
                isCurrentlyLiked = Array.isArray(likedResponse) ? likedResponse[0] : false;
                console.log('Current like status:', isCurrentlyLiked);
            } catch (checkError) {
                console.log('Could not check like status, assuming false:', checkError.message);
                isCurrentlyLiked = false;
            }

            // Step 2: Toggle the like status
            let success = false;
            let newLikedStatus = !isCurrentlyLiked;

            try {
                if (isCurrentlyLiked) {
                    // Remove from liked songs
                    console.log('Removing from liked songs...');
                    const response = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${await this.auth.getValidAccessToken()}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    // Spotify returns 200 for successful removal
                    if (response.ok || response.status === 200) {
                        success = true;
                        newLikedStatus = false;
                        console.log('✅ Successfully removed from liked songs');
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }

                } else {
                    // Add to liked songs
                    console.log('Adding to liked songs...');
                    const response = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${await this.auth.getValidAccessToken()}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    // Spotify returns 200 for successful addition
                    if (response.ok || response.status === 200) {
                        success = true;
                        newLikedStatus = true;
                        console.log('✅ Successfully added to liked songs');
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }
                }

            } catch (apiError) {
                console.log('API call error:', apiError.message);

                // Many times the API call works but doesn't return proper JSON
                // Let's verify by checking the status again after a short delay
                setTimeout(async () => {
                    try {
                        const verifyResponse = await this.api.checkSavedTracks(trackId);
                        const actualStatus = Array.isArray(verifyResponse) ? verifyResponse[0] : false;

                        if (actualStatus !== isCurrentlyLiked) {
                            // The action actually worked! Just update the UI silently
                            this.elements.heartBtn.classList.toggle('liked', actualStatus);
                            console.log('✅ Action verified successful:', actualStatus);
                        } else {
                            // The action really failed - just log it, no user message
                            console.log('❌ Action failed and verified failed');
                        }
                    } catch (verifyError) {
                        console.log('Could not verify action:', verifyError.message);
                    }
                }, 2000);

                // Don't throw the error, let the verification handle it
                return;
            }

            // Step 3: Update UI immediately if we got here (successful response)
            if (success) {
                this.elements.heartBtn.classList.toggle('liked', newLikedStatus);
            }

        } catch (error) {
            console.error('Heart button error:', error);
            // Just log the error, no user notification

        } finally {
            // Always restore button functionality after a delay
            setTimeout(() => {
                this.elements.heartBtn.style.opacity = originalOpacity || '1';
                this.elements.heartBtn.style.pointerEvents = 'auto';
            }, 1000);
        }
    }


    showSuccess(message) {
        console.log('✅ Success message:', message);

        const toast = document.createElement('div');
        toast.style.cssText = `
        position: fixed;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(30, 215, 96, 0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 12px;
        z-index: 1000;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        max-width: 280px;
        text-align: center;
        line-height: 1.4;
        box-shadow: 0 4px 12px rgba(30, 215, 96, 0.3);
        animation: slideInFromTop 0.3s ease-out;
    `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    // Utility method to extract track ID
    extractTrackId(uri) {
        if (!uri) return null;

        console.log('Extracting track ID from:', uri);

        // Handle different URI formats
        if (typeof uri === 'string') {
            if (uri.includes('spotify:track:')) {
                const id = uri.split('spotify:track:')[1];
                console.log('Extracted ID from spotify:track: format:', id);
                return id;
            } else if (uri.includes('spotify:')) {
                const id = uri.split(':').pop();
                console.log('Extracted ID from generic spotify: format:', id);
                return id;
            } else if (uri.includes('/track/')) {
                const id = uri.split('/track/')[1].split('?')[0];
                console.log('Extracted ID from URL format:', id);
                return id;
            } else if (uri.length === 22) {
                // Looks like it's already just the track ID
                console.log('Using URI as track ID:', uri);
                return uri;
            }
        }

        console.log('Could not extract track ID from:', uri);
        return null;
    }

    // Update play button icon
    updatePlayButtonIcon() {
        const playIcon = this.elements.playPauseBtn?.querySelector('.play-icon');
        const pauseIcon = this.elements.playPauseBtn?.querySelector('.pause-icon');

        if (!playIcon || !pauseIcon) return;

        if (this.isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }

    updateShuffleButton(enabled) {
        this.elements.shuffleBtn?.classList.toggle('active', enabled);
    }

    updateRepeatButton(mode) {
        const btn = this.elements.repeatBtn;
        if (!btn) return;

        btn.classList.remove('active', 'repeat-one');

        if (mode === 'context') {
            btn.classList.add('active');
        } else if (mode === 'track') {
            btn.classList.add('active', 'repeat-one');
        }
    }

    async startAuth() {
        console.log('🎵 === START AUTH DEBUG ===');

        if (!this.elements.connectBtn || !this.auth) {
            console.log('❌ Missing elements for auth');
            return;
        }

        console.log('🎵 Starting Spotify authentication...');
        this.elements.connectBtn.textContent = '✨ Connecting...';
        this.elements.connectBtn.disabled = true;

        try {
            const authUrl = await this.auth.buildAuthUrl();
            console.log('🔗 Generated auth URL:', authUrl);

            // Always show the manual URL as fallback
            if (this.elements.manualUrlText && this.elements.manualUrl) {
                this.elements.manualUrlText.textContent = authUrl;
                this.elements.manualUrl.style.display = 'block';
            }

            // Try to open browser
            const opened = await ipcRenderer.invoke('open-external-url', authUrl);

            if (opened) {
                console.log('✅ Browser opened successfully');
                this.showError('Browser opened! If not, copy the URL shown below.');
                this.elements.connectBtn.textContent = '⏳ Waiting...';
            } else {
                console.log('⚠️ Browser opening failed, showing manual URL');
                this.showError('Please copy the URL below and open it in your browser.');
                this.elements.connectBtn.textContent = '✨ Try Again';
                this.elements.connectBtn.disabled = false;
            }
        } catch (error) {
            console.log('❌ Error in startAuth:', error);
            this.showError('Error: ' + error.message);
            this.elements.connectBtn.textContent = '✨ Try Again';
            this.elements.connectBtn.disabled = false;
        }
    }

    handleAuthCallback(data) {
        console.log('📨 Received auth callback:', data);
        this.auth.exchangeCodeForToken(data.code).then(() => {
            console.log('✅ Token exchange successful');
        }).catch(error => {
            console.error('❌ Token exchange error:', error);
            this.showError('Authentication failed. Please try again.');
        });
    }

    onAuthSuccess() {
        console.log('✅ Authentication successful!');
        this.isAuthenticated = true;

        // Initialize player
        this.player = new PlayerController(this.api);

        // Show player interface
        this.showPlayerInterface();

        // Start real-time updates
        this.startUpdateIntervals();

        // Load initial track info
        setTimeout(() => {
            this.loadRecentTrack();
            this.updatePlayerState();
        }, 1000);
    }

    onAuthCleared() {
        console.log('Authentication cleared');
        this.isAuthenticated = false;
        this.player = null;
        this.stopUpdateIntervals();
        this.showAuthInterface();
    }

    showAuthInterface() {
        this.elements.authScreen.style.display = 'flex';
        this.elements.playerContent.style.display = 'none';
        this.elements.connectBtn.textContent = '✨ Connect Now';
        this.elements.connectBtn.disabled = false;
    }

    showPlayerInterface() {
        this.elements.authScreen.style.display = 'none';
        this.elements.playerContent.style.display = 'flex';
    }

    async updateTrackInfo(track) {
        console.log('🎵 Updating track info:', track);

        if (!track) {
            console.log('❌ No track provided, showing default state');
            this.elements.trackName.textContent = 'Not playing';
            this.elements.artistName.textContent = 'Start playing music on Spotify';
            this.elements.albumArt.src = this.getDefaultAlbumArt();
            this.elements.heartBtn?.classList.remove('liked');
            return;
        }

        this.currentTrack = track;
        this.elements.trackName.textContent = track.name || 'Unknown Track';
        this.elements.artistName.textContent = track.artists ? track.artists.map(a => a.name).join(', ') : 'Unknown Artist';

        // Update album art
        if (track.album?.images && track.album.images.length > 0) {
            const imageUrl = track.album.images[0]?.url;
            if (imageUrl) {
                this.elements.albumArt.src = imageUrl;
            } else {
                this.elements.albumArt.src = this.getDefaultAlbumArt();
            }
        } else {
            this.elements.albumArt.src = this.getDefaultAlbumArt();
        }

        // Update like button
        try {
            const trackId = this.extractTrackId(track.uri || track.id);
            if (trackId) {
                const [isLiked] = await this.api.checkSavedTracks(trackId);
                this.elements.heartBtn?.classList.toggle('liked', isLiked);
                console.log('💖 Track liked:', isLiked);
            }
        } catch (error) {
            console.error('❌ Error checking if track is liked:', error);
        }
    }

    async loadRecentTrack() {
        console.log('🔄 Loading most recent track...');

        if (!this.api) return;

        try {
            // First try current playback
            const currentState = await this.api.getCurrentPlayback();
            if (currentState && currentState.item) {
                console.log('🎵 Found current playing track:', currentState.item.name);
                await this.updateTrackInfo(currentState.item);
                this.updateProgressUI(currentState.progress_ms || 0, currentState.item.duration_ms || 0);
                this.isPlaying = currentState.is_playing;
                this.localProgressMs = currentState.progress_ms || 0;
                this.durationMs = currentState.item.duration_ms || 0;
                this.updatePlayButtonIcon();
                return;
            }

            // Get recently played if nothing current
            const recentData = await this.api.getRecentlyPlayed(1);
            if (recentData && recentData.items && recentData.items.length > 0) {
                const recentTrack = recentData.items[0].track;
                console.log('📀 Loading recent track:', recentTrack.name);
                await this.updateTrackInfo(recentTrack);
                this.updateProgressUI(0, recentTrack.duration_ms || 0);
                this.isPlaying = false;
                this.durationMs = recentTrack.duration_ms || 0;
                this.updatePlayButtonIcon();
            }
        } catch (error) {
            console.log('❌ Failed to load recent track:', error);
        }
    }

    // Spotify-style miniplayer hover controls
    showControls() {
        if (this.elements.controlsOverlay) {
            this.elements.controlsOverlay.style.opacity = '1';
            this.elements.controlsOverlay.style.visibility = 'visible';
        }
    }

    hideControls() {
        if (this.elements.controlsOverlay) {
            this.elements.controlsOverlay.style.opacity = '0';
            this.elements.controlsOverlay.style.visibility = 'hidden';
        }
    }

    seekToPosition(event) {
        if (!this.durationMs) {
            console.log('❌ No duration available for seeking');
            return;
        }

        const rect = this.elements.progressBar.getBoundingClientRect();
        const percentage = (event.clientX - rect.left) / rect.width;
        const positionMs = percentage * this.durationMs;

        console.log('🎯 Seeking to:', this.formatTime(positionMs));

        this.api.seek(Math.round(positionMs)).then(() => {
            console.log('✅ Seek successful');
            this.localProgressMs = positionMs;
            this.updateProgressUI(positionMs, this.durationMs);
        }).catch(error => {
            console.log('❌ Seek failed:', error);
            if (!error.message.includes('not valid JSON')) {
                this.showError('Seek failed');
            }
        });
    }

    // Utility methods
    formatTime(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    getDefaultAlbumArt() {
        return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iI2ZmOWE5ZSIvPgo8cGF0aCBkPSJNMjAgMTBDMjUuNTIyOCAxMCAzMCAxNC40NzcyIDMwIDIwQzMwIDI1LjUyMjggMjUuNTIyOCAzMCAyMCAzMEMxNC40NzcyIDMwIDEwIDI1LjUyMjggMTAgMjBDMTAgMTQuNDc3MiAxNC40NzcyIDEwIDIwIDEwWiIgZmlsbD0iI2ZmZmZmZiIgZmlsbC1vcGFjaXR5PSIwLjMiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxMiIgeT0iMTIiPgo8cGF0aCBkPSJNOCAyTDYuNSA1SDNMNS41IDcuNUw0IDExTDggOUwxMiAxMUwxMC41IDcuNUwxMyA1SDkuNUw4IDJaIiBmaWxsPSIjZmZmZmZmIi8+Cjwvc3ZnPgo8L3N2Zz4K";
    }

    copyToClipboard() {
        const url = this.elements.manualUrlText?.textContent;
        if (url) {
            navigator.clipboard.writeText(url).then(() => {
                this.showError('URL copied to clipboard! 📋');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = url;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.showError('URL copied to clipboard! 📋');
            });
        }
    }

    showError(message) {
        console.log('💬 User message:', message);

        // Create a toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 50px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 71, 87, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 12px;
            z-index: 1000;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            max-width: 280px;
            text-align: center;
            line-height: 1.4;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Remove after 4 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 4000);
    }

    // Cleanup when app closes
    destroy() {
        this.stopUpdateIntervals();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 Initializing Spotify Miniplayer...');
    window.spotifyApp = new SpotifyMiniplayer();
});

// Cleanup on beforeunload
window.addEventListener('beforeunload', () => {
    if (window.spotifyApp) {
        window.spotifyApp.destroy();
    }
});

// Make sure the class is available globally
window.SpotifyMiniplayer = SpotifyMiniplayer;
console.log('📦 SpotifyMiniplayer class loaded');