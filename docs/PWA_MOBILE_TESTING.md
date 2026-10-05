# MoA-AMS Progressive Web App (PWA) — Mobile Testing & Setup Guide

This guide details how to install, run, and test the **Ministry of Agriculture Fixed Asset Management System (MoA-AMS)** Progressive Web App (PWA) directly on mobile devices (Android and iOS).

---

## 1. Prerequisites & Mobile Security Context

Modern mobile operating systems (**iOS Safari** and **Android Chrome**) strictly enforce **Secure Contexts** (`HTTPS` or `http://localhost`) for Progressive Web Apps. Service Workers, manifest installation triggers, and offline storage APIs will only register under secure origins or trusted local domains.

When testing over a local network (e.g., `http://192.168.x.x:3001`), mobile browsers flag the IP address as an untrusted HTTP connection unless one of the methods below is used.

---

## 2. Testing Methods

### Option 1: Over Wi-Fi on Android (No USB Cable Needed)

Recommended when both your PC and Android mobile device are connected to the same local Wi-Fi network.

1. **Find your computer's local IP address**:
   - On Windows PowerShell, run:
     ```powershell
     Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match 'Wi-Fi' }
     ```
   - *Example: `192.168.100.60`*

2. **Configure Chrome on your Android phone**:
   - Open **Chrome** and navigate to:
     ```text
     chrome://flags/#unsafely-treat-insecure-origin-as-secure
     ```
   - Switch the flag to **Enabled**.
   - In the text box below it, enter your computer's IP and frontend port:
     ```text
     http://192.168.100.60:3001
     ```
   - Tap the blue **Relaunch** button at the bottom of the screen.

3. **Install the PWA**:
   - Open Chrome and visit:
     ```text
     http://192.168.100.60:3001?pwa=true
     ```
   - The top banner will display:
     > **"Install MoA-AMS on your mobile or desktop for full offline field access"** with an **Install** button.
   - Alternatively, tap the Chrome menu (`⋮`) and select **Install app** or **Add to Home screen**.
   - The app will install with the official Ministry of Agriculture emblem and launch in full-screen standalone mode.

---

### Option 2: Over USB with Chrome DevTools Port Forwarding (Android - 100% Native)

This method forwards `localhost:3001` directly from your PC to your phone over USB. Because the phone accesses `http://localhost:3001`, Chrome natively treats it as a secure origin without requiring any flag modifications.

1. Connect your Android phone to your PC with a USB cable (ensure **USB Debugging** is enabled in Developer Options).
2. Open Google Chrome on your computer and navigate to:
   ```text
   chrome://inspect/#devices
   ```
3. Click the **Port forwarding...** button:
   - Check **Enable port forwarding**.
   - Add a rule:
     - **Port**: `3001`
     - **IP address and port**: `localhost:3001`
   - Click **Done**.
4. On your Android phone, open Chrome and navigate to:
   ```text
   http://localhost:3001?pwa=true
   ```
5. Tap **Install** when prompted or via the Chrome menu (`⋮` → **Install app**).

---

### Option 3: Free Instant HTTPS Tunnel (iPhone iOS Safari & Android)

Apple's iOS Safari does not have an insecure origins flag; it requires an actual HTTPS certificate. You can generate a free, temporary SSL tunnel from your development machine:

1. **Start a local tunnel on your PC**:
   ```bash
   npx localtunnel --port 3001
   ```
   *(Or using Cloudflare Tunnel: `cloudflared tunnel --url http://localhost:3001`)*

2. **Open the tunnel URL on your mobile device**:
   - Navigate to the generated `https://xxxx.loca.lt` URL in your mobile browser.

3. **Install on iOS Safari**:
   - Tap the **Share** button (box with upward arrow) at the bottom of Safari.
   - Scroll down and tap **Add to Home Screen**.
   - Confirm the name ("MoA-AMS") and tap **Add**.
   - Open the app from your home screen; it will launch standalone with splash branding and without Safari browser chrome.

4. **Install on Android Chrome**:
   - Tap the in-app **Install** banner or choose `⋮` → **Install app**.

---

## 3. Running Production Mode vs. Development Mode

The MoA-AMS application includes intelligent environment gating for the Service Worker:

| Mode | Command | Behavior |
| :--- | :--- | :--- |
| **Development** | `npm run dev` | Unregisters Service Workers by default so Hot Module Replacement (HMR) is unaffected. To test PWA in dev, append `?pwa=true` to the URL. |
| **Production Preview** | `npm run build`<br>`npm run preview` | Fully registers the Service Worker `/sw.js` and serves minified production assets with caching headers. |

To test the exact production bundle over your network:
```bash
# In the AMS/frontend directory:
npm run build
npm run preview
```
The preview server listens on `0.0.0.0:3001` with API proxying to port `3000`.

---

## 4. Testing Offline Capabilities

Once installed on your phone:

1. Log into MoA-AMS while connected to the network and navigate between pages (e.g., Assets, Stores, Employees) to populate the local cache.
2. Put your phone in **Airplane Mode** (disable Wi-Fi and Cellular Data).
3. Re-open MoA-AMS from your phone's home screen.
4. **Expected Behavior**:
   - The application shell loads instantly from cache.
   - An amber offline status bar appears at the top:
     > *"You are currently Offline. MoA-AMS PWA is serving cached asset records."*
   - Critical views remain responsive.
5. Disable Airplane Mode; the offline banner will dismiss automatically when connectivity is restored.

---

## 5. Technical Specifications

- **Manifest File**: [`frontend/public/manifest.json`](file:///c:/Users/HP/Desktop/Asset%20Managment/AMS/frontend/public/manifest.json)
- **Service Worker**: [`frontend/public/sw.js`](file:///c:/Users/HP/Desktop/Asset%20Managment/AMS/frontend/public/sw.js)
  - **Navigation (`request.mode === 'navigate'`)**: Network-First with cache fallback.
  - **API Calls (`/api/*`)**: Network-only pass-through (never stale).
  - **Static Bundles (`/assets/*`, fonts, icons)**: Stale-While-Revalidate caching.
- **PWA Icons**:
  - `icon-192.png`: 192×192 px standard and maskable Android icon
  - `icon-512.png`: 512×512 px high-res splash and Play Store icon
  - `apple-touch-icon.png`: 180×180 px iOS home-screen icon
  - `favicon.ico` / `favicon.png`: Browser tab branding
