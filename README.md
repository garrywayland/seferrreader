# Sefer Reader

A distraction-free, page-by-page reader for any sefer on [Sefaria](https://www.sefaria.org).

- Text fills the screen: one column on a phone, two on a tablet or laptop. No scrolling.
- Tap the left side for the next page, the right side to go back (reversed in English). Tap the middle for the menu.
- Swipe, arrow keys and the space bar also turn pages.
- Hebrew, English, or both. Choice of Hebrew and English fonts, text size, line spacing, margins, one or two columns, and Auto/Light/Sepia/Dark themes.
- A library home page: search, Continue reading (with progress), and browsing by category the way Sefaria's home page does, down to a page for each book with its description, author and date, and a grid of chapters or dapim.
- Today's learning on the home page (Daf Yomi, parasha, Rambam, Mishnah Yomit and Sefaria's other daily schedules), with a Choose button to show only the ones you follow.
- Works offline: sections you read and the ones after them are saved (5 to 50 ahead, in settings), and any book can be downloaded from its page.
- Text with trop uses a font that places the cantillation marks correctly, and trop or all nikud can be hidden.
- Your place and settings are saved on each device.
- Every page has its own link: `…/#Berakhot_2a` (a text), `…/#/b/Berakhot` (a book), `…/#/c/Talmud` (a category).

It's a static site (`index.html`, `styles.css`, `app.js`) that loads everything straight from Sefaria's public API, so any static host works.

## Publish with GitHub Pages

Repository → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save.
After a minute the site is live at `https://<username>.github.io/<repo>/`.

## Add to your phone's home screen

- iPhone/iPad: open the site in Safari → Share → Add to Home Screen.
- Android: open in Chrome → ⋮ → Add to Home screen.

It then opens full-screen like an app.
