# EdgeShare ⚡

> **Zero-VPS, Single-Binary Screen Sharing & Meetings — Powered by Your Own Cloudflare Realtime 1,000 GB/mo Free Tier!**

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Cloudflare Realtime](https://img.shields.io/badge/Cloudflare-Realtime%20SFU-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/realtime/)
[![License](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

---

## ⚡ Why EdgeShare? — Zero Server Bills, Out-of-the-Box

> [!IMPORTANT]
> **Keep Your Keys Local & Use Cloudflare's 1,000 GB/mo Free Egress!**  
> Cloudflare Realtime SFU & TURN include **1,000 GB of free egress every month** (and **100% free ingress**).  
> Instead of renting a VPS, configuring Nginx/SSL, or deploying complex Cloudflare Workers, **EdgeShare** compiles into a **single ~11 MB Go binary** with the React frontend embedded inside:
> - **Host runs one binary locally**: Your `App Secret` and `Analytics Token` stay locked in `~/.edgeshare/config.json` (`0600`) — guests never see them.
> - **Instant HTTPS Public Link**: Built-in `cloudflared` Quick Tunnel generates a `https://*.trycloudflare.com` link in seconds so remote guests join directly in their browser with **zero installs**.
> - **Live Quota Guard & Circuit Breaker**: Tracks real-time session Mbps (`getStats()`) alongside Cloudflare's GraphQL Analytics API and automatically blocks new streams before hitting paid overages.

---

## ✨ Features

| Category | Capabilities |
| :--- | :--- |
| **🖥️ Multi-Screen Sharing** | Simultaneous multi-person screen sharing with **Focus View** & **Multi-Grid (up to 2×2)**, system audio capture, and 3 quality presets: **Eco (720p 15fps)**, **Standard (1080p 30fps)**, **Ultra (60Hz / 10 Mbps)**. |
| **📹 Cameras & Voice** | Adaptive **Camera Filmstrip** (shrinks under screen shares, expands to a responsive grid when idle), 360p/450kbps quota-friendly video, **Eco Mode** (hide remote cameras), VAD speaking glow, `Space` Push-to-Talk, and `Ctrl/Cmd + M` mute. |
| **🎯 Laser & Annotations** | Real-time **Laser Pointer** & **Pen Strokes** synced across all viewers over WebSocket with smooth ~3.8s fade-out. |
| **📂 P2P File Transfer** | Drag-and-drop or pick files in chat to send via **WebRTC `DataChannel`** directly between peers — **0 GB Cloudflare quota consumed**. |
| **🔴 Local Recording** | One-click browser `MediaRecorder` mixes the active screen video + all meeting audio into a local `.webm` file with zero server CPU load. |
| **📝 Chat & Shared Notes** | Rich chat with `Ctrl/Cmd + V` screenshot paste, auto-linked URLs, code blocks, plus a real-time **Shared Markdown Notes** tab with `.md` export. |
| **🛡️ Host Controls** | Room password, **Max Participants** cap, **Waiting Room** approval, Lock Room, Mute All, Kick, and **Cloudflare Quota Circuit Breaker**. |
| **🌍 UI & Polish** | **5 Languages** (`English` default, `简体中文`, `日本語`, `Español`, `Français`), **Dark / Light Theme**, Framer Motion spring animations, WebSocket auto-reconnect, and Mic/Cam/Speaker device switcher. |

---

## 🏗️ Architecture

**Signaling & Secrets** stay on the Host's lightweight Go/Gin binary (exposed via `cloudflared` HTTPS tunnel when remote), while **Heavy Media Streams** flow directly between browsers and Cloudflare's global edge SFU:

```mermaid
flowchart LR
    subgraph Host["Host Machine (Single Go + Gin Binary ~11 MB)"]
        UI["Embedded React SPA (go:embed)"]
        API["Gin HTTP + SFU/Analytics Proxy"]
        WS["WebSocket Room Hub (Chat / Notes / Laser / P2P Signal)"]
        CFG["~/.edgeshare/config.json (0600)"]
        TUN["cloudflared Quick Tunnel"]
        API --> CFG
        API <--> TUN
        WS <--> TUN
    end

    subgraph Guests["Remote Guests (Browser, Zero Install)"]
        G1["Guest A Browser"]
        G2["Guest B Browser"]
    end

    subgraph CF["Cloudflare Global Edge"]
        SFU["Realtime SFU (1,000 GB/mo Free Egress)"]
        GQL["GraphQL Analytics API"]
    end

    TUN <-- "HTTPS / WSS (Tiny Signaling & Chat)" --> G1
    TUN <-- "HTTPS / WSS (Tiny Signaling & Chat)" --> G2
    G1 <-- "WebRTC Media (Screens / Cam / Mic)" --> SFU
    G2 <-- "WebRTC Media (Screens / Cam / Mic)" --> SFU
    UI <-- "WebRTC Media" --> SFU
    G1 <-. "WebRTC DataChannel (P2P Files, 0 CF Quota)" .-> G2
    API -- "Quota Sync (5-min Cache)" --> GQL
```

---

## 📖 Step-by-Step Setup Guide (For First-Time Users)

Even if you have never used Cloudflare Realtime before, you can get a meeting running in **under 3 minutes**:

### Step 1: Create Your Free Cloudflare Realtime SFU App (~1 min)
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left sidebar, click **Realtime** → **SFU** (or **Applications**).
   > *Note: On first use, Cloudflare may ask you to add a payment method to activate Realtime. The first **1,000 GB/month** of egress is completely free (\$0).*
3. Click **Create Application**, give it any name (e.g. `edgeshare`), and submit.
4. Copy the **`App ID`** and **`App Secret`** shown on screen (**keep `App Secret` safe — it is only shown once**).

### Step 2: (Optional) Enable the 1,000 GB Monthly Quota Gauge
If you skip this step, meetings still work normally — you just won't see the monthly GB progress bar at the top.
1. Copy your 32-character **Account ID** directly from your Cloudflare Dashboard browser URL:  
   `https://dash.cloudflare.com/<YOUR_ACCOUNT_ID>/...`
2. Click your profile icon (top-right) → **My Profile** → **API Tokens** → **Create Token** → **Create Custom Token**:
   - **Token name**: `edgeshare-analytics`
   - **Permissions**: `Account` → `Account Analytics` → `Read`
   - Leave everything else as default, click **Continue to summary** → **Create Token**, and copy the token.

### Step 3: Build & Launch EdgeShare
```bash
git clone https://github.com/Chillwinner/EdgeShare.git
cd EdgeShare

# 1. Build embedded React frontend
cd web && npm install && npm run build && cd ..

# 2. Build single Go binary
go build -o edgeshare .

# 3. Launch (auto-opens the Host Console in your default browser)
./edgeshare
```

### Step 4: Configure Keys & Install Public Tunnel in the UI
1. On the EdgeShare home page, click **"Setup required: Add Cloudflare SFU Keys"** (or **Settings** in the top-right).
2. Paste your **`App ID`** and **`App Secret`** (plus optional **`Account ID`** and **`Analytics Token`**).
3. At the bottom of the Settings modal, click **One-Click Install** next to *Public Quick Tunnel (`cloudflared`)* — EdgeShare will automatically download `cloudflared` into `~/.edgeshare/bin/`.
4. Click **Save Config** (stored locally at `~/.edgeshare/config.json` with `0600` permissions).

### Step 5: Start Your First Meeting
1. On the right-hand card, enter your nickname, optionally set a **Room Password** or enable **Waiting Room**, and toggle **Enable Public Quick Tunnel** ON.
2. Click **Create & Start Meeting**.
3. Click **Copy Invite** in the top bar and send the `https://*.trycloudflare.com/?room=...` link to anyone — they join directly in their browser with zero installs!

---

## ❓ Troubleshooting & FAQ

- **Why do remote guests need the Quick Tunnel (`trycloudflare.com`) instead of my IP?**  
  Modern browsers **block microphone & screen sharing (`getDisplayMedia`) on plain `http://` pages** (except `localhost`). The built-in `cloudflared` Quick Tunnel gives you both **NAT traversal** and a valid **HTTPS certificate** automatically.
- **My shared screen is black on macOS?**  
  Open **System Settings → Privacy & Security → Screen & System Audio Recording** and enable permission for your browser (Chrome / Edge / Safari / Arc).
- **Will I accidentally get charged by Cloudflare?**  
  EdgeShare enforces a local **Circuit Breaker** (`quotaLimitGb`, default `950 GB`). Once your monthly egress reaches `850 GB`, 10 Mbps Ultra mode is disabled; at `950 GB`, new SFU sessions are blocked before reaching the 1,000 GB free limit.

---

## ⚙️ Configuration Reference

See [`config.example.json`](config.example.json) for a sample configuration file. You can configure everything from the Web UI or via environment variables:

| Field / Env Var | Default | Description |
| :--- | :--- | :--- |
| `appId` / `CF_APP_ID` | — | Cloudflare Realtime SFU App ID |
| `appSecret` / `CF_APP_SECRET` | — | Cloudflare Realtime SFU App Secret (never exposed to guests) |
| `accountId` / `CF_ACCOUNT_ID` | — | Optional Cloudflare Account ID for GraphQL quota tracking |
| `analyticsToken` / `CF_ANALYTICS_TOKEN` | — | Optional read-only `Account Analytics: Read` API token |
| `quotaWarnGb` | `850` | Yellow warning threshold (disables 10 Mbps Ultra preset) |
| `quotaLimitGb` | `950` | Hard circuit-breaker limit (blocks new SFU sessions) |
| `port` | `8787` | Local HTTP/WebSocket listen port |

---

## 📁 Project Structure

```text
EdgeShare/
├── main.go                     # Gin server, host auth middleware, go:embed SPA
├── config.example.json         # Sample configuration template (no secrets)
├── internal/
│   ├── config/config.go        # Local ~/.edgeshare/config.json persistence
│   ├── cloudflare/
│   │   ├── sfu.go              # Cloudflare Realtime SFU API proxy & circuit breaker
│   │   └── analytics.go        # GraphQL Analytics API client (5-min cache)
│   ├── tunnel/tunnel.go        # cloudflared Quick Tunnel & auto-installer
│   └── room/hub.go             # WebSocket rooms, waiting room, chat, notes, P2P relay
└── web/                        # React 19 + TypeScript + Tailwind v4 + Framer Motion
    └── src/
        ├── i18n.tsx            # 5-language dictionary (EN default, ZH, JA, ES, FR)
        ├── theme.tsx           # Dark / Light theme provider & switcher
        ├── hooks/              # useWebRTC, useP2PTransfer, useRecorder, useVAD
        └── components/         # LobbyView, StageArea, TopQuotaBar, ChatDrawer, Modals
```

---

## 📄 License

MIT License
