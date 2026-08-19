# Facebook Post Scheduler 🚀

A modern, clean, single-page web application designed to connect Facebook Pages, draft posts with live formatting & image attachments, schedule them for automatic publishing via Facebook Graph API, and manage the scheduled queue.

---

## 🌟 Features

1. **Facebook Page Connection**:
   - Live Meta Graph API OAuth login integration (`pages_show_list`, `pages_manage_posts`, `pages_read_engagement`).
   - Built-in Dev/Demo Mode with simulated pages ("Black History Official", "Tech Pulse Daily") for zero-friction testing.
   - Encrypted Page Access Tokens using **AES-256-GCM** on the server. Never exposed to frontend JavaScript.
2. **Post Caption & Draft Autosave**:
   - Textarea with real-time character counter.
   - LocalStorage draft autosave & restore.
   - Clear button with confirmation.
3. **Image Attachment**:
   - Upload JPG, JPEG, PNG, WEBP files (up to 10MB).
   - Instant visual preview with resolution & file size.
4. **Date, Time & Timezone Scheduling**:
   - Date picker with past date prevention.
   - Time picker (12/24 hour support).
   - Timezone selector (preconfigured for `Asia/Kathmandu`, `America/New_York`, `UTC`, etc.).
   - Converts and stores scheduled time internally in UTC.
5. **Real-time Facebook Post Preview**:
   - Pixel-accurate Facebook feed card preview updating in real-time as you type or change images.
   - Like, Comment, and Share mock action buttons.
6. **Automatic Background Publishing**:
   - Automated server-side scheduler that executes posts when their scheduled time arrives.
   - Saves Facebook Post ID on successful publish.
   - Status transitions: `Scheduled` ➔ `Publishing` ➔ `Published` / `Failed`.
   - Reconnect & retry handling without duplicate post creation.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 18, TypeScript)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & Lucide Icons
- **Database & ORM**: SQLite (default zero-config) / PostgreSQL via [Prisma ORM](https://www.prisma.io/)
- **Security**: AES-256-GCM Token Encryption, Server-side Zod validation
- **Background Queue**: Dual-mode in-process background poller + BullMQ/Redis support

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Initialize Database
```bash
npx prisma db push
node prisma/seed.js
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Meta / Facebook Graph API Setup (For Live Publishing)

To publish directly to real Facebook Pages:
1. Go to [Meta for Developers](https://developers.facebook.com/) and create a Facebook App (Type: **Business**).
2. Add the **Facebook Login for Business** product.
3. In App Settings, configure OAuth Redirect URI: `http://localhost:3000/api/facebook/auth`.
4. Update your `.env`:
   ```env
   FACEBOOK_APP_ID="your_app_id"
   FACEBOOK_APP_SECRET="your_app_secret"
   FACEBOOK_REDIRECT_URI="http://localhost:3000/api/facebook/auth"
   FACEBOOK_GRAPH_API_VERSION="v21.0"
   ```
5. Restart the server. The badge will change to **Meta Graph API v21.0**.
