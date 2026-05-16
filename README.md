# Shravek Journey

A beautiful couple & family journey website — milestones, travel adventures, baby moments, and photo memories all in one place.

## How to Customize

Edit `js/data.js` to add your own:
- **Timeline milestones** — dating, engagement, wedding, home, baby, etc.
- **Travel adventures** — destinations with dates and descriptions
- **Baby journey** — pregnancy/baby milestones
- **Gallery** — replace emoji placeholders with actual image paths

## Adding Photos

1. Place images in the `images/` folder
2. Update `js/data.js` gallery entries:
   ```js
   { image: 'images/photo1.jpg', caption: 'Our Wedding' }
   ```

## Deployment

This is a static site — deploy to Azure Static Web Apps, GitHub Pages, or any static host.

## Tech Stack

- Vanilla HTML / CSS / JavaScript
- Google Fonts (Cormorant Garamond + Jost)
- No build step required
