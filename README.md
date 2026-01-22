# Scholar Profile Exporter (CSV + BibTeX Link)

**Author:** Dr. Sajid Muhaimin Choudhury  
**Website:** sajid.buet.ac.bd  

A lightweight Tampermonkey userscript that exports publication metadata from your **Google Scholar profile page** (the “My citations” publications table) directly from the **page DOM**.

It provides three actions:
1. **Load all (optional)**: Clicks “Show more” repeatedly to load additional rows on the page.
2. **Export CSV**: Exports the visible publication table rows to a CSV file.
3. **Export BibTeX links list**: Selects visible rows and extracts the **BibTeX export URL** from Scholar’s Export menu, saves it to a `.txt` file, and opens it in a new tab.

## Scope and limitations
- This script exports only what is **already available in your browser session** and **visible/loaded** in the table.
- It does **not** attempt to bypass CAPTCHAs, rate limits, or access controls. If Scholar prompts a CAPTCHA, you must solve it manually.
- BibTeX export is generated through Scholar’s own UI export mechanism; it typically produces a **single export link** for the selected set.

## Data fields exported to CSV
For each `tr.gsc_a_tr` row:
- `title`
- `authors`
- `venue`
- `year`
- `citation_count`
- `citation_for_view_url`
- `cites_url`

## Installation
1. Install **Tampermonkey** for your browser.
2. Open the userscript file (`scholar-profile-exporter.user.js`) and install it.
3. Visit your Google Scholar profile page (URL usually contains `scholar.google.com/citations?user=`).
4. Use the floating panel at the bottom-right.

## Usage tips
- If you have many publications, click **Load all (optional)** first, then export.
- If “Export BibTeX links list” fails to find the BibTeX item, click Scholar’s **Export** menu manually once, then try again.

## License

**CC BY-NC-ND 4.0** — Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International.

Copyright (c) 2026 **Dr. Sajid Muhaimin Choudhury** (sajid.buet.ac.bd)

- You may **share** (copy and redistribute) this project with **attribution**.
- **Commercial use is not permitted.**
- **Distribution of modified versions is not permitted.**

See the `LICENSE` file for details.

