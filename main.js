const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const express = require('express');

let mainWindow;
let callbackServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 350, // Increased from 280 to 350 (70px taller)
    minWidth: 300,
    minHeight: 320, // Increased from 250 to 320
    maxWidth: 400,
    maxHeight: 420, // Increased from 350 to 420
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    transparent: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'src/assets/icons/app-icon.png')
  });

  mainWindow.loadFile('src/index.html');

  // Enable dragging for title bar
  mainWindow.setMovable(true);


  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (callbackServer) {
      callbackServer.close();
    }
  });

  // Set up callback server for Spotify OAuth
  setupCallbackServer();
}

function setupCallbackServer() {
  const expressApp = express();
  const fs = require('fs');
  
  // Serve static files for callback page
  expressApp.use(express.static(path.join(__dirname)));
  
  expressApp.get('/callback', (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;

    console.log('📨 Callback received:', { code: !!code, state: !!state, error });

    // Send the authorization code to the renderer process FIRST
    if (code && mainWindow && !mainWindow.isDestroyed()) {
      console.log('📤 Sending auth callback to renderer process');
      mainWindow.webContents.send('auth-callback', { code, state });
    }

    // Read and serve the callback.html file with pink theme
    try {
      let callbackHtml = fs.readFileSync(path.join(__dirname, 'callback.html'), 'utf8');
      
      // Update the callback.html to use pink theme
      callbackHtml = callbackHtml.replace(
        'background: linear-gradient(135deg, #1db954 0%, #191414 100%);',
        'background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);'
      ).replace(
        'border-top: 4px solid #1db954;',
        'border-top: 4px solid #ff6b9d;'
      ).replace(
        'color: #1db954;',
        'color: #ff6b9d;'
      ).replace(
        'color: #e22134;',
        'color: #ff4757;'
      );
      
      res.send(callbackHtml);
    } catch (fileError) {
      console.error('Could not read callback.html, using fallback');
      // Fallback to inline HTML if file doesn't exist
      if (error) {
        res.send(`
          <html>
            <head>
              <title>Authentication Error</title>
              <style>
                body {
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  text-align: center;
                  padding: 50px;
                  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
                  color: white;
                  margin: 0;
                  min-height: 100vh;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                }
                h2 { color: #ff4757; margin-bottom: 20px; }
                p { margin: 10px 0; opacity: 0.9; }
              </style>
            </head>
            <body>
              <h2>💖 Authentication Failed</h2>
              <p>Error: ${error}</p>
              <p>Please close this window and try again.</p>
            </body>
          </html>
        `);
      } else if (code) {
        res.send(`
          <html>
            <head>
              <title>Success!</title>
              <style>
                body {
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  text-align: center;
                  padding: 50px;
                  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
                  color: white;
                  margin: 0;
                  min-height: 100vh;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                }
                h2 { color: white; margin-bottom: 20px; text-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                p { margin: 10px 0; opacity: 0.9; }
                .countdown { font-weight: 600; color: #ff4757; }
              </style>
            </head>
            <body>
              <h2>✨ Authentication Successful!</h2>
              <p>You can now close this window and return to the miniplayer.</p>
              <p class="countdown">This window will close automatically in <span id="timer">3</span> seconds...</p>
              <script>
                let count = 3;
                const timer = document.getElementById('timer');
                const interval = setInterval(() => {
                  count--;
                  timer.textContent = count;
                  if (count <= 0) {
                    clearInterval(interval);
                    window.close();
                  }
                }, 1000);
              </script>
            </body>
          </html>
        `);
      } else {
        res.send(`
          <html>
            <head>
              <title>Test</title>
              <style>
                body {
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  text-align: center;
                  padding: 50px;
                  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
                  color: white;
                  margin: 0;
                  min-height: 100vh;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                }
              </style>
            </head>
            <body>
              <h2>💖 Callback Server Working!</h2>
              <p>Your server is running properly.</p>
            </body>
          </html>
        `);
      }
    }
  });

  callbackServer = expressApp.listen(3000, '127.0.0.1', () => {
    console.log('🚀 Callback server running on http://127.0.0.1:3000');
  });

  callbackServer.on('error', (err) => {
    console.error('Callback server error:', err);
    if (err.code === 'EADDRINUSE') {
      console.log('Port 3000 is already in use, trying port 3001...');
      callbackServer = expressApp.listen(3001, '127.0.0.1', () => {
        console.log('🚀 Callback server running on http://127.0.0.1:3001');
        console.log('⚠️  Remember to add http://127.0.0.1:3001/callback to your Spotify app redirect URIs!');
      });
    }
  });
}

// Handle app events
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (callbackServer) {
    callbackServer.close();
  }
});

// IPC handlers
ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('toggle-always-on-top', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isAlwaysOnTop);
    return !isAlwaysOnTop;
  }
  return false;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// FIXED: Updated handler name to match what the renderer expects
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    console.log('🌐 Main process: Opening external URL:', url);
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('❌ Main process: Failed to open external URL:', error);
    return false;
  }
});

// Keep the old handler for backwards compatibility
ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

// Handle window dragging for frameless window
ipcMain.on('start-drag', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.startDrag();
  }
});