import type { CapacitorConfig } from '@capacitor/cli';

// Native shell for the web app. The production build ships the Vite bundle
// inside the app (webDir) — never point `server.url` at a remote site for a
// store build. For live reload against the Vite dev server run
// `CAP_SERVER_URL=http://<mac-lan-ip>:5173 npm run ios:dev` (or plain
// `npm run ios:dev`, which lets the Capacitor CLI pick the address).
const devServer = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.thedoorman.app',
  appName: 'DoorMan',
  webDir: 'dist',
  ...(devServer ? { server: { url: devServer, cleartext: true } } : {}),
  ios: {
    // The WebView draws under the status bar; CSS pads the top with
    // env(safe-area-inset-top) (see index.css, html.native).
    contentInset: 'never',
    backgroundColor: '#000000',
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden from App.jsx once the session check has resolved.
      launchAutoHide: false,
      backgroundColor: '#000000',
    },
    Keyboard: {
      resize: 'native',
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
    PushNotifications: {
      // Show pushes as banners while the app is in the foreground too.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
