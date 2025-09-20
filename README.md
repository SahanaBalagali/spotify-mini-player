🎵 Spotify Miniplayer
A sleek desktop miniplayer for Spotify that floats on top of your other apps. Perfect for controlling your music without switching windows!
Show Image <!-- Add your screenshot here -->
✨ What it does

🎧 Always-on-top music controls - stays visible while you work
🎨 Beautiful pink-themed UI with album art and smooth animations
▶️ Full playback control - play, pause, skip, shuffle, repeat
💚 Like/unlike songs with a satisfying heart button
📊 Real-time progress tracking - see exactly where you are in each song
🖼️ Album art display - shows cover art for the current track
🔄 Auto-updates - track info and progress update automatically


🚀 Getting started
Prerequisites
Node.js (v14 or higher)
A Spotify Premium account
A Spotify app registered at Spotify Developer Dashboard

Setup
Clone this repo

bash   git clone https://github.com/yourusername/spotify-miniplayer.git
   cd spotify-miniplayer

Install dependencies
bash   npm install

Configure your Spotify app
Go to your Spotify App Dashboard
Add http://127.0.0.1:3000/callback to your redirect URIs
Copy your Client ID


Update the Client ID
Open js/spotify-auth.js
Replace the clientId with your actual Spotify app Client ID


Run the app
npm run dev

🎮 How to use
Connect to Spotify - Click the connect button and log in
Start playing music - Open Spotify and start playing any song
Control from the miniplayer - Use the floating window to control playback
Hover for controls - Hover over the album art to see all the buttons
Like songs - Click the heart button to add songs to your liked playlist

🛠️ Tech stack
Electron - Desktop app framework
Node.js & Express - Backend server for OAuth
Vanilla JavaScript - Frontend logic
Spotify Web API - Music data and controls
CSS3 - Glassmorphism UI with animations

🎯 Features
Core functionality

Real-time music control (play/pause/skip)
Track progress with seeking
Shuffle and repeat modes
Add/remove songs from liked playlist
Always-on-top window option

UI/UX highlights

Hover-based control overlay (just like Spotify!)
Smooth progress bar that updates every second
Heart button with satisfying animations
Compact design that doesn't get in your way
Responsive layout that works at different sizes

🐛 Troubleshooting
"Failed to connect" - Make sure your Client ID is correct and the redirect URI is added to your Spotify app
"No active device" - Start playing music in the main Spotify app first
"Network error" - Check your internet connection and Spotify app permissions
Controls not working - You need Spotify Premium for playback control

🤝 Contributing
Feel free to open issues or submit pull requests! This is a fun side project and I'm always open to improvements.
