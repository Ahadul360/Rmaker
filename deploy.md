# 🚀 ReelMaker Production Deployment Guide

This guide walks you through deploying **ReelMaker** to a real production web server.

Because ReelMaker is built using **pure client-side technologies** (HTML5, Vanilla CSS, ES6 Modules, Canvas API, Web Audio API, Service Worker PWA, and MediaRecorder API), it **does not require Node.js, Python, PHP, or a backend database to run in production**.

---

## ⚠️ Critical Production Requirements

Before deploying, ensure your server meets these three essential requirements:

1. **HTTPS is MANDATORY**:
   - Modern browsers **only allow** Service Workers, AudioContext, MediaRecorder, and PWA installation on secure `https://` origins (or `localhost`).
   - Free SSL certificates are easily configured using **Let's Encrypt / Certbot** or via cloud providers (Cloudflare, Vercel, GitHub Pages).

2. **Correct JavaScript MIME Types**:
   - ReelMaker uses native ES6 modules (`import` / `export`).
   - The web server must serve `.js` files with `Content-Type: application/javascript` or `text/javascript`.

3. **Service Worker Cache Invalidation**:
   - `service-worker.js` should be served with `Cache-Control: no-cache` so users automatically receive new app updates.

---

## 📑 Deployment Options

- [🐙 GitHub Pages (Instant & 100% Free - Recommended)](#-github-pages-instant--100-free)
- [🖥️ Option 1: Real Linux VPS (Ubuntu / Debian / Nginx)](#-option-1-real-linux-vps-ubuntu--debian-with-nginx)
- [⚡ Option 2: Ultra-Easy VPS with Caddy (Automatic HTTPS)](#-option-2-vps-with-caddy-automatic-ssl)
- [☁️ Option 3: Other Cloud Hosting (Cloudflare Pages, Vercel, Netlify)](#-option-3-other-cloud-hosting)

---

## 🐙 GitHub Pages (Instant & 100% Free)

ReelMaker is ready to be hosted on **GitHub Pages** with free automated HTTPS and global CDN.

### Step 1: Initialize Git and Commit
Open your terminal in this project folder and run:

```bash
# 1. Initialize local git repository
git init

# 2. Add all files (.nojekyll is included so GitHub Pages serves all assets)
git add .

# 3. Commit your files
git commit -m "Initial commit - ReelMaker Offline PWA"

# 4. Rename default branch to main
git branch -M main
```

### Step 2: Push to Your GitHub Repository
1. Go to [github.com/new](https://github.com/new) and create a new repository (e.g., named `reelmaker` or `rmaker`).
2. Do **not** initialize it with a README, .gitignore, or license (the project already has them).
3. Copy the repository URL and run:

```bash
# Link your local folder to GitHub (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git

# Push your code
git push -u origin main
```

### Step 3: Enable GitHub Pages in 3 Clicks
1. On GitHub, navigate to your repository.
2. Click **Settings** (tab on the top right) → **Pages** (in the left sidebar).
3. Under **Build and deployment**:
   - **Source**: Select `Deploy from a branch`
   - **Branch**: Select `main`
   - **Folder**: Select `/ (root)`
4. Click **Save**.

Within 1–2 minutes, your website will be live at:
`https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`

*(The included `.nojekyll` file ensures GitHub Pages serves all fonts, Web Workers, and ES modules without issues).*

---

## 🖥️ Option 1: Real Linux VPS (Ubuntu / Debian with Nginx)

This is the standard enterprise way to host on a VPS from **DigitalOcean, Hetzner, Linode, AWS EC2, Vultr, or Contabo**.

### Step 1: Connect to your VPS & Install Nginx + Certbot

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Nginx and Certbot for free automatic SSL
sudo apt install -y nginx certbot python3-certbot-nginx git ufw
```

### Step 2: Configure Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

### Step 3: Upload ReelMaker Files to Server

Create the web root directory and copy the project files:

```bash
# Create directory
sudo mkdir -p /var/www/rmaker

# Set ownership to your user while uploading
sudo chown -R $USER:$USER /var/www/rmaker
```

From your local machine, upload all project files via `rsync` or `scp`:

```bash
# Run this from your local Mac/PC inside the Rmaker project directory:
rsync -avz --exclude '.git' --exclude 'scratch' ./ username@your-server-ip:/var/www/rmaker/
```

*(Alternatively, you can clone your Git repository directly into `/var/www/rmaker`)*.

Set correct web permissions:

```bash
# On the VPS server:
sudo chown -R www-data:www-data /var/www/rmaker
sudo chmod -R 755 /var/www/rmaker
```

### Step 4: Configure Nginx Virtual Host

Create a new Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/rmaker
```

Paste the following production-optimized configuration (replace `yourdomain.com` with your real domain):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/rmaker;
    index index.html;

    # Gzip Compression for Fast Loading
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/javascript application/json application/xml image/svg+xml font/ttf font/otf;
    gzip_disable "MSIE [1-6]\.";

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Single Page App Routing & Static Files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Service Worker: Do NOT cache so updates are immediate
    location = /service-worker.js {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Service-Worker-Allowed "/";
    }

    # Web App Manifest
    location = /manifest.json {
        add_header Content-Type "application/manifest+json";
        add_header Cache-Control "public, max-age=604800";
    }

    # Static Assets & Fonts (Cache for 1 year)
    location ~* \.(?:css|js|woff2?|ttf|otf|svg|png|jpg|jpeg|gif|ico|wav|mp3|webm)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # Deny hidden files (.git, .env, etc.)
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

Enable the site and test configuration:

```bash
# Enable configuration
sudo ln -sf /etc/nginx/sites-available/rmaker /etc/nginx/sites-enabled/

# Remove default site if desired
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx syntax
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 5: Install Free SSL Certificate via Let's Encrypt

Ensure your domain's DNS `A` record points to your server's IP address, then run:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will automatically obtain the certificate, configure HTTPS in Nginx, and setup automatic renewal!

Your website is now live at `https://yourdomain.com`! 🎉

---

## ⚡ Option 2: VPS with Caddy (Automatic SSL)

If you prefer an ultra-lightweight, modern web server that manages SSL certificates **100% automatically** without Certbot:

### Step 1: Install Caddy on Ubuntu/Debian

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### Step 2: Configure Caddyfile

Edit `/etc/caddy/Caddyfile`:

```caddy
yourdomain.com {
    root * /var/www/rmaker
    file_server
    encode gzip zstd

    # Headers for security and PWA
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    @serviceWorker path /service-worker.js
    header @serviceWorker {
        Cache-Control "no-cache, no-store, must-revalidate"
    }

    @static path *.css *.js *.ttf *.svg *.wav *.png *.jpg
    header @static {
        Cache-Control "public, max-age=31536000, immutable"
    }

    try_files {path} /index.html
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

Caddy will automatically provision a free Let's Encrypt certificate and serve your site over HTTPS!

---

## 🐳 Option 3: Docker & Docker Compose

If you use Docker or a container orchestrator (Kubernetes, Portainer, Dokku):

### Step 1: Build & Run with Docker

A production-ready `Dockerfile` and `docker-compose.yml` are provided in the repository.

To start the container:

```bash
# Build and run container detached on port 80/443
docker compose up -d --build
```

### Step 2: Verify

Open `http://localhost:8080` (or your mapped server port).

---

## ☁️ Option 4: Free Cloud Hosting

Because ReelMaker is a 100% offline-capable client-side app, you can host it for free with global CDN and automated HTTPS:

### A. Vercel (Fastest & Simplest)
1. Install Vercel CLI: `npm install -g vercel`
2. Run from the project root:
   ```bash
   vercel --prod
   ```
3. Follow the CLI prompt. Vercel automatically applies the included `vercel.json` for proper cache headers.

### B. Cloudflare Pages
1. Push your project to GitHub or GitLab.
2. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create application** → **Pages**.
3. Connect your repository.
4. Set **Build command**: *(leave blank)*.
5. Set **Build output directory**: `/` (root).
6. Click **Save and Deploy**. Cloudflare automatically serves via their global edge network.

### C. GitHub Pages
1. Push your project to a GitHub repository (e.g. `github.com/yourusername/reelmaker`).
2. Go to repository **Settings** → **Pages**.
3. Under **Build and deployment** > **Source**, select **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder. Click **Save**.
5. Your site is live at `https://yourusername.github.io/reelmaker/`!

### D. Netlify
1. Install Netlify CLI: `npm install -g netlify-cli`
2. Run:
   ```bash
   netlify deploy --prod --dir .
   ```
3. Netlify will publish the site and provide an HTTPS URL instantly.

---

## 📁 Option 5: Shared Hosting / cPanel (Apache)

If you are using cPanel or shared Linux hosting with Apache:

1. Compress your project folder into a `.zip` file (excluding test screenshots).
2. Log into cPanel → Open **File Manager** → Navigate to `public_html/`.
3. Upload and extract the `.zip` file.
4. An `.htaccess` file is included with the project to handle:
   - HTTPS redirect
   - Gzip compression
   - MIME types (`application/javascript` for `.js`)
   - Service worker cache headers
5. Ensure **SSL/TLS Status** in cPanel has "AutoSSL" enabled for your domain.

---

## ✅ Post-Deployment Verification Checklist

After deploying to your server, open your URL in a browser and verify:

| Check | How to Verify | Expected Result |
| :--- | :--- | :--- |
| **HTTPS Certificate** | Click the padlock icon in the browser address bar | Connection is secure (valid certificate) |
| **PWA Service Worker** | Open DevTools (`F12`) → **Application** → **Service Workers** | Status is `activated and is running` |
| **Offline Mode** | In DevTools **Network** tab, check **Offline**, then refresh page (`F5`) | Page loads completely with all fonts and patterns |
| **Audio Playback** | Click **Play** on the timeline or preview audio in the Music panel | Audio plays cleanly without audio context errors |
| **Video Export** | Click **Export Video** in the top-right toolbar | Video generates and prompts for download (`.webm` or `.mp4`) |
| **Installable PWA** | Look for the **Install App** icon in the browser address bar | App installs as a standalone desktop or mobile app |

---

## 🛠️ Maintenance & Updating App Content

To release a new version or update code on your production server:

1. Pull the latest code on your server:
   ```bash
   cd /var/www/rmaker && git pull
   ```
2. If you added new assets, bump the cache version in `service-worker.js`:
   ```javascript
   const CACHE_NAME = 'reelmaker-v1.0.6';
   ```
3. When users reload their browser, the Service Worker will detect the version bump, cache the new files in the background, and activate automatically!
