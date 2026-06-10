# PDF Health Check — Setup Guide

## Architecture

```
Electron desktop app (Windows + macOS)
    └── HTML / Vanilla JS / CSS frontend
    └── Communicates with ↓

PHP Backend (hosted on any web server)
    └── Adobe PDF Services API calls
    └── MySQL database for results
```

---

## 1. Backend Server Setup

### Requirements
- PHP 8.1+ with extensions: `pdo_mysql`, `openssl`, `curl`, `fileinfo`
- MySQL 8.0+
- Apache/Nginx with mod_rewrite / try_files

### Database
```sql
-- Run once:
mysql -u root -p < backend/db/schema.sql
```

### Configuration
Edit `backend/config/config.php`:

```php
define('APP_API_KEY',        'your-strong-random-key');   // Same key in Electron Settings
define('ADOBE_CLIENT_ID',    'your-adobe-client-id');     // From developer.adobe.com
define('ADOBE_CLIENT_SECRET','your-adobe-client-secret');
define('ENCRYPTION_KEY',     'your-32-char-encryption-key'); // php -r "echo bin2hex(random_bytes(32));"
```

Edit `backend/config/database.php` (or set environment variables):
```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS
```

### Deploy
Upload the entire `backend/` folder to your web server. The document root should point to `backend/`.

**Apache** — `.htaccess` is included, ensure `AllowOverride All`.

**Nginx** example:
```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
```

### Test
```
GET https://yourserver.com/api/ping
Headers: X-API-Key: your-strong-random-key
```
Expected: `{"success":true,"data":{"version":"1.0.0","time":"..."}}`

---

## 2. Electron App Setup

### Prerequisites
- Node.js 18+

### Install & Run
```bash
cd /path/to/HCAPP
npm install
npm start
```

### Build distributable
```bash
npm run build:mac   # macOS .dmg
npm run build:win   # Windows .exe (NSIS installer)
npm run build:all   # Both
```
Output goes to `dist/`.

### First-time configuration
1. Launch the app — it will open **Settings** automatically
2. Enter your **Backend URL** (e.g. `https://yourserver.com`)
3. Enter your **API Key** (same as `APP_API_KEY` in config.php)
4. Click **Test Connection** — should show green ✓
5. Optionally enter Adobe credentials here (they'll be pushed to the backend)
6. Click **Save Settings**

---

## 3. Adobe PDF Services API Credentials

1. Go to [developer.adobe.com/document-services](https://developer.adobe.com/document-services/)
2. Sign in with your Adobe ID
3. Create a new project → PDF Services API
4. Copy **Client ID** and **Client Secret**
5. Add them to `backend/config/config.php` or the Electron Settings page

---

## 4. Usage Flow

1. **Add a Customer** (Customers → Add Customer)
2. **Create a Health Check** (click "New Health Check", select customer, name it)
3. **Upload PDFs** (drag & drop or browse, then click "Start Analysis")
4. The app uploads each PDF to Adobe PDF Services, runs:
   - **PDF Properties** — version, tags, encryption, page count, forms
   - **PDF Accessibility Checker** — WCAG checks, tagged content, alt text
5. Results are stored in MySQL and shown in the Health Check detail view
6. View aggregate analysis in **Reports** (by customer, region, vertical, country)

---

## Security Notes

- **Customer names** are AES-256-CBC encrypted in the database
- **Filenames** are AES-256-CBC encrypted in the database
- PDFs are **never stored** on the server — uploaded to Adobe, processed, then deleted
- The `APP_API_KEY` protects the PHP API from unauthorised access
- Set `CORS_ORIGIN` in config.php to your specific server if needed

---

## Score Calculation

| Criterion | Points |
|-----------|--------|
| Tagged PDF (accessibility structure) | 15 |
| PDF version ≥ 1.4 | 8 |
| Not encrypted (accessible) | 5 |
| No XFA forms (deprecated) | 7 |
| Valid document (page count > 0) | 5 |
| Accessibility checks (passed/total × 60) | up to 60 |
| **Total** | **100** |

Score bands: **Good** ≥ 75 · **Fair** 50–74 · **Poor** < 50
