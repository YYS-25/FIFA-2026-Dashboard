# FIFA 2026 Dashboard — Deployment Guide

## Pre-Deployment Checklist

- [x] All 5 tabs implemented and tested
- [x] Data fetching from Google Sheets working
- [x] Live score sync from openfootball working
- [x] Score calculations correct (3/1/0 logic)
- [x] Mobile-first responsive design working
- [x] Error handling and refresh button working
- [x] All features from design doc implemented

## Deployment Steps

### 1. Prepare Google Sheets Data

1. Export your predictions CSV with these columns:
   - Person, Match ID, Home Team, Away Team, Predicted Winner, Predicted Home Goals, Predicted Away Goals, Actual Home Goals, Actual Away Goals, Status

2. Upload to Google Sheets

3. Share the sheet:
   - Click "Share"
   - Make it "Anyone with the link can view"

4. Publish as CSV:
   - File → Publish to the web
   - Select the sheet
   - Format: CSV
   - Copy the published link

5. Update `dashboard/app.js`:
   - Find: `const GOOGLE_SHEETS_CSV_URL = '...'`
   - Replace with your published sheet CSV link

### 2. Deploy to GitHub Pages (Recommended)

1. Create a GitHub repo (must be public):
   ```
   github.com/your-username/fifa-2026-dashboard
   ```

2. Clone and add files:
   ```bash
   git clone https://github.com/your-username/fifa-2026-dashboard
   cd fifa-2026-dashboard
   cp -r /path/to/dashboard/* .
   ```

3. Commit and push:
   ```bash
   git add .
   git commit -m "Initial dashboard setup"
   git push origin main
   ```

4. Enable GitHub Pages:
   - Go to repo Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` / Folder: `/ (root)`
   - Click Save

5. Wait 2 minutes for deployment to complete

6. Your dashboard is live at: `https://your-username.github.io/fifa-2026-dashboard`

### 3. Share with Users

Share this link with the 5 users:
- No login required
- View-only (no edits possible)
- Auto-syncs with live tournament results
- Mobile-friendly
- Works on any device with a browser

## Local Testing

```bash
# Serve locally (Python)
python -m http.server 8000

# Or Node
npx http-server

# Visit: http://localhost:8000
```

## Updating Scores

To update scores:
1. Edit Google Sheets predictions if needed
2. Re-publish as CSV (if needed)
3. Users refresh the dashboard to see new scores
4. Data auto-syncs with openfootball live results

## Support

- If data doesn't load: Check Google Sheets CSV URL is correct in app.js
- If scores aren't updating: Refresh the page
- If styles look wrong: Clear browser cache
- For live scores: Automatic sync with openfootball API

## Files

- `index.html` - Main page structure
- `styles.css` - Mobile-first styling
- `app.js` - Main app logic
- `utils.js` - Helper functions (scoring, formatting, flags)
- `README.md` - Setup instructions
- `DEPLOYMENT.md` - This file
