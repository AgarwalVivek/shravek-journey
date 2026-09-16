# Shravek Journey

A beautiful couple & family journey website — milestones, travel adventures, baby moments, and photo memories all in one place.

## How to Customize

Edit `js/data.js` to add your own:
- **Timeline milestones** — dating, engagement, wedding, baby, etc.
- **Travel adventures** — destinations with dates and descriptions
- **Baby journey** — pregnancy/baby milestones
- **Pregnancy story** — a dedicated month-by-month photo and video journey
- **Gallery** — replace emoji placeholders with actual image paths

The pregnancy story is available at `pregnancy.html`. Its optimized Azure media
manifest is generated in `js/pregnancy-media.js`.

To add or replace a chapter while preserving each folder's natural filename
order:

```powershell
.\sync-pregnancy-folder.ps1 `
  -SourcePath 'D:\pregnancy-journey\welcome-home-baby-202608' `
  -Chapter 'welcome-home' `
  -AltPrefix 'Welcome home memory'
```

Pass multiple source folders as an array when one chapter spans more than one
folder. The folders are processed in the order provided.

The script optimizes and uploads supported images/videos, prefixes blob names
with their sequence, and records each original filename and order in the media
manifest. Sort the source folder by **Name** to preview the website sequence.

## Adding Photos

1. Place images in the `images/` folder
2. Update `js/data.js` gallery entries:
   ```js
   { image: 'images/photo1.jpg', caption: 'Our Wedding' }
   ```

## Deployment

This is a static site — deploy to Azure Static Web Apps, GitHub Pages, or any static host.

### Family Access

All HTML pages except `babyphotoshoot.html` use the family-access gate in
`js/site-access.js`. The Azure Function reads `SITE_ACCESS_USERNAME`,
`SITE_ACCESS_PASSWORD`, and `SITE_ACCESS_SECRET` from application settings and
issues a seven-day signed HttpOnly cookie after a successful login.

## Tech Stack

- Vanilla HTML / CSS / JavaScript
- Google Fonts (Cormorant Garamond + Jost)
- No build step required
