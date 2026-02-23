// ==UserScript==
// @name         Google Scholar Profile Exporter (CSV + BibTeX Link)
// @namespace    https://sajid.buet.ac.bd
// @version      1.1.0
// @description  Export Google Scholar profile publications table (DOM-only) to CSV, and extract BibTeX export link from Scholar's UI Export menu.
// @author       Dr. Sajid Muhaimin Choudhury (sajid.buet.ac.bd)
// @match        https://scholar.google.com/citations?*user=*
// @match        https://scholar.google.*/*citations?*user=*
// @grant        none
// ==/UserScript==


/*
  ----------------------------------------------------------------------
  Scholar Profile Exporter (CSV + BibTeX Link)
  ----------------------------------------------------------------------
  Author:    Dr. Sajid Muhaimin Choudhury
  Website:   sajid.buet.ac.bd
  License:   CC BY-NC-ND 4.0 (Attribution–NonCommercial–NoDerivatives)
  Copyright: (c) Dr. Sajid Muhaimin Choudhury

 *
 * License: Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International (CC BY-NC-ND 4.0)
 * You may share this script with attribution for non-commercial purposes, but you may not distribute modified versions.
 * Full license text: https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode


  What this script does:
    - Adds a small floating UI with three buttons:
        1) Load all (optional): clicks "Show more" repeatedly to load all rows on the page.
        2) Export CSV: extracts publication data from <tr class="gsc_a_tr"> rows and downloads a CSV.
        3) Export BibTeX links list: selects loaded rows, opens Scholar's Export menu, captures the BibTeX export URL,
           downloads a .txt file containing that URL, and opens it in a new tab.

  Important scope:
    - DOM-only export: this script reads data already rendered in the browser.
    - It does NOT attempt to bypass CAPTCHAs, rate limits, or access controls.
    - If Scholar prompts a CAPTCHA, solve it manually.

  Tested assumptions:
    - Rows are <tr class="gsc_a_tr"> within the profile publications table.
    - Title link is <a class="gsc_a_at">, authors/venue are in .gs_gray lines.
    - Citation count link may be empty (e.g., conference entries with no citations).
    - "Show more" button is commonly #gsc_bpf_more.

  ----------------------------------------------------------------------
*/

(function () {
    "use strict";
    console.log("[GS Exporter] Script loaded:", location.href);

    function formatQueryDate(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseAuthorCount(authorsRaw) {
  const s = cleanText(authorsRaw);
  if (!s) return "";
  // Split by commas; drop ellipsis tokens
  const parts = s.split(",").map(x => cleanText(x)).filter(x => x && x !== "..." && x !== "…");
  return parts.length || "";
}

function inferType(venueRaw) {
  const v = cleanText(venueRaw).toLowerCase();
  if (!v) return "";
  if (v.includes("conference") || v.includes("proceedings") || v.includes("symposium") || v.includes("workshop")) {
    return "Conference paper";
  }
  return "Journal article";
}

function parseSourceName(venueRaw, year) {
  // Heuristic: remove year, leading year, then strip trailing volume/pages chunks
  let v = cleanText(venueRaw);
  if (!v) return "";

  // Remove explicit year in parentheses or after comma
  v = v.replace(/\b(19|20)\d{2}\b/g, "").replace(/\(\s*\)/g, "").trim();
  // Remove leading original year if present
  if (year && v.startsWith(String(year))) v = cleanText(v.slice(String(year).length));

  // Keep the "name" portion before volume/pages patterns
  // Examples:
  // "Applied Physics Reviews 6 (4), 41308" -> "Applied Physics Reviews"
  // "Optics & Laser Technology 181, 111730" -> "Optics & Laser Technology"
  // For conferences, we generally keep full string (often no clean volume/pages)
  const m = v.match(/^(.+?)(\s+\d+\s*(\(|,|$).*)$/);
  if (m && !v.toLowerCase().includes("conference")) return cleanText(m[1]);

  // Also strip trailing ", <numbers>" if it looks like pages/article-number
  v = v.replace(/,\s*\d+(\s*[-–]\s*\d+)?\s*$/g, "").trim();

  return cleanText(v);
}

function parseVolIssuePages(venueRaw) {
  const v = cleanText(venueRaw);

  let Volume = "";
  let Issue = "";
  let StartPage = "";
  let EndPage = "";

  // Volume(Issue)
  const vi = v.match(/\b(\d+)\s*\(\s*(\d+)\s*\)/);
  if (vi) {
    Volume = parseInt(vi[1], 10);
    Issue  = parseInt(vi[2], 10);
  } else {
    // Volume only: e.g. "... 181, 111730"
    const volOnly = v.match(/(?:^|[^\d])(\d{1,5})(?=\s*,)/);
    if (volOnly) Volume = parseInt(volOnly[1], 10);
  }

  // Pages/article number: after last comma, take last numeric token / range
  const afterComma = v.split(",").map(x => x.trim());
  if (afterComma.length >= 2) {
    const last = afterComma[afterComma.length - 1];
    // Extract a numeric range or single number
    const pr = last.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (pr) {
      StartPage = parseInt(pr[1], 10);
      EndPage   = parseInt(pr[2], 10);
    } else {
      const pn = last.match(/\b(\d+)\b/);
      if (pn) {
        StartPage = parseInt(pn[1], 10);
        EndPage   = parseInt(pn[1], 10);
      }
    }
  }

  return { Volume, Issue, StartPage, EndPage };
}


    // ---------- Utilities ----------
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function absUrl(url) {
      if (!url) return "";
      try { return new URL(url, window.location.origin).toString(); }
      catch { return url; }
    }

    function cleanText(s) {
      return String(s ?? "")
        .replace(/\u00A0/g, " ")   // NBSP -> space
        .replace(/\s+/g, " ")     // collapse whitespace
        .trim();
    }

    function extractYearFromText(s) {
      const m = String(s ?? "").match(/\b(19|20)\d{2}\b/);
      return m ? m[0] : "";
    }

    function csvEscape(value) {
      const s = String(value ?? "");
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }

    function toCSV(rows, headers) {
      const lines = [];
      lines.push(headers.map(csvEscape).join(","));
      for (const r of rows) {
        lines.push(headers.map(h => csvEscape(r[h])).join(","));
      }
      return lines.join("\n");
    }

    function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    function nowStamp() {
      const d = new Date();
      const pad = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    // ---------- Core extraction ----------
    function extractPublications() {
      const rows = [];
      const trs = Array.from(document.querySelectorAll("tr.gsc_a_tr"));

      for (const tr of trs) {
        const titleA = tr.querySelector("td.gsc_a_t a.gsc_a_at");
        const title = cleanText(titleA?.textContent);

        const gray = tr.querySelectorAll("td.gsc_a_t .gs_gray");
        const authors = cleanText(gray?.[0]?.textContent);
        const venueRaw = cleanText(gray?.[1]?.textContent);

        const yearCol = cleanText(tr.querySelector("td.gsc_a_y")?.textContent);
        const year = yearCol || extractYearFromText(venueRaw);

        const citation_for_view_url = absUrl(titleA?.getAttribute("href") ?? "");

        const citeA = tr.querySelector("td.gsc_a_c a.gsc_a_ac");
        const citeText = cleanText(citeA?.textContent);
        const citation_count = citeText ? citeText : "0";

        const citesHref = citeA?.getAttribute("href") ?? "";
        const cites_url = citesHref ? absUrl(citesHref) : "";

        rows.push({
          title,
          authors,
          venue: venueRaw,
          year,
          citation_count,
          citation_for_view_url,
          cites_url
        });
      }

      return rows;
    }

    // ---------- Load all (optional) ----------
    async function loadAllPublications({ maxClicks = 200, delayMs = 900 } = {}) {
      const moreBtn = document.querySelector("#gsc_bpf_more");
      if (!moreBtn) {
        alert("Could not find the 'Show more' button (#gsc_bpf_more). If everything is already loaded, you can export now.");
        return;
      }

      let clicks = 0;
      while (clicks < maxClicks) {
        const disabled =
          moreBtn.classList.contains("gs_dis") ||
          moreBtn.getAttribute("aria-disabled") === "true" ||
          moreBtn.style.display === "none";

        if (disabled) break;

        moreBtn.click();
        clicks++;
        await sleep(delayMs);
      }

      alert(`Load all complete. Clicked 'Show more' ${clicks} time(s). You can export now.`);
    }

    // ---------- BibTeX export link extraction (from Scholar UI) ----------
    function clickAllRowCheckboxes() {
      const cbs = Array.from(document.querySelectorAll('input[type="checkbox"][name="s"]'));
      for (const cb of cbs) {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      return cbs.length;
    }

    function findExportButton() {
      // Scholar toolbar varies slightly; search by visible text "Export"
      const candidates = Array.from(document.querySelectorAll("button, a, span, div"));
      const exact = candidates.find(el => cleanText(el.textContent).toLowerCase() === "export");
      if (exact) return exact;
      return candidates.find(el => cleanText(el.textContent).toLowerCase().includes("export")) || null;
    }

    function findBibTeXLinkInOpenMenus() {
      // Once Export menu opens, it typically includes a "BibTeX" entry.
      const links = Array.from(document.querySelectorAll("a"));
      return links.find(a => cleanText(a.textContent).toLowerCase().includes("bibtex")) || null;
    }

    function exportPoPCitesCSV() {
  const trs = Array.from(document.querySelectorAll("tr.gsc_a_tr"));
  if (!trs.length) {
    alert("No publication rows found. Make sure your publications table is visible.");
    return;
  }

  const queryDate = formatQueryDate(new Date());
  const queryYear = new Date().getFullYear();

  const headers = [
    "Cites","Authors","Title","Year","Source","Publisher","ArticleURL","CitesURL","GSRank","QueryDate",
    "Type","DOI","ISSN","CitationURL","Volume","Issue","StartPage","EndPage","ECC","CitesPerYear",
    "CitesPerAuthor","AuthorCount","Age","Abstract","FullTextURL","RelatedURL"
  ];

  const rows = [];

  trs.forEach((tr, idx) => {
    const titleA = tr.querySelector("td.gsc_a_t a.gsc_a_at");
    const title = cleanText(titleA?.textContent);

    const gray = tr.querySelectorAll("td.gsc_a_t .gs_gray");
    const authorsRaw = cleanText(gray?.[0]?.textContent);
    const venueRaw   = cleanText(gray?.[1]?.textContent);

    const yearCol = cleanText(tr.querySelector("td.gsc_a_y")?.textContent);
    const yearStr = yearCol || extractYearFromText(venueRaw);
    const yearNum = yearStr ? parseInt(yearStr, 10) : "";

    const citeA = tr.querySelector("td.gsc_a_c a.gsc_a_ac");
    const citeText = cleanText(citeA?.textContent);
    const cites = citeText ? parseInt(citeText, 10) : 0;

    const citesHref = citeA?.getAttribute("href") ?? "";
    const citesUrl  = citesHref ? absUrl(citesHref) : "";

    const citationURL = absUrl(titleA?.getAttribute("href") ?? "");

    const AuthorCount = parseAuthorCount(authorsRaw);
    const Age = (yearNum && Number.isFinite(yearNum)) ? Math.max(1, (queryYear - yearNum)) : "";

    const ECC = cites; // common PoP convention: ECC equals citations for the record
    const CitesPerYear = (Age && Age > 0) ? (cites / Age).toFixed(2) : "";
    const CitesPerAuthor = (AuthorCount && AuthorCount > 0) ? String(Math.round(cites / AuthorCount)) : "";

    const Type = inferType(venueRaw);

    const Source = parseSourceName(venueRaw, yearStr);

    const { Volume, Issue, StartPage, EndPage } = parseVolIssuePages(venueRaw);

    rows.push({
      Cites: cites,
      Authors: authorsRaw,
      Title: title,
      Year: yearNum || "",
      Source: Source,
      Publisher: "",
      ArticleURL: "",
      CitesURL: citesUrl,
      GSRank: idx + 1,
      QueryDate: queryDate,
      Type: Type,
      DOI: "",
      ISSN: "",
      CitationURL: citationURL,
      Volume: Volume !== "" ? Volume : "",
      Issue: Issue !== "" ? Issue : "",
      StartPage: StartPage !== "" ? StartPage : "",
      EndPage: EndPage !== "" ? EndPage : "",
      ECC: ECC,
      CitesPerYear: CitesPerYear,
      CitesPerAuthor: CitesPerAuthor,
      AuthorCount: AuthorCount,
      Age: Age,
      Abstract: "",
      FullTextURL: "",
      RelatedURL: ""
    });
  });

  const csv = toCSV(rows, headers);
  // User asked for exact filename:
  downloadText("PoPCites.csv", csv, "text/csv;charset=utf-8");
}


    async function exportBibTeXLinksList() {
      const selectedCount = clickAllRowCheckboxes();
      if (!selectedCount) {
        alert("No rows found to select. Make sure your publications table is visible and rows are loaded.");
        return;
      }

      const exportBtn = findExportButton();
      if (!exportBtn) {
        alert("Could not find the Export button on this page. Ensure you are on your Scholar profile 'My citations' page.");
        return;
      }

      exportBtn.click();
      await sleep(250);

      let bibLink = findBibTeXLinkInOpenMenus();
      if (!bibLink) { await sleep(400); bibLink = findBibTeXLinkInOpenMenus(); }
      if (!bibLink) { await sleep(600); bibLink = findBibTeXLinkInOpenMenus(); }

      if (!bibLink) {
        alert("Could not locate the 'BibTeX' item in the Export menu. Try clicking Export manually once, then click this button again.");
        return;
      }

      const bibUrl = absUrl(bibLink.getAttribute("href") || "");
      if (!bibUrl) {
        alert("Found BibTeX menu item, but its link was empty.");
        return;
      }

      const txt = [
        "# Google Scholar BibTeX export link (generated via Scholar UI Export menu)",
        `# Selected rows (loaded/visible): ${selectedCount}`,
        "# Author: Dr. Sajid Muhaimin Choudhury (sajid.buet.ac.bd)",
        "# License: CC BY-NC-ND 4.0",
        bibUrl,
        ""
      ].join("\n");

      downloadText(`google_scholar_bibtex_links_${nowStamp()}.txt`, txt, "text/plain;charset=utf-8");
      window.open(bibUrl, "_blank", "noopener,noreferrer");
    }

    // ---------- UI ----------
    function injectUI() {
      if (document.getElementById("tm-gs-exporter")) return;

      const box = document.createElement("div");
      box.id = "tm-gs-exporter";
      box.style.cssText = `
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 99999;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 10px;
        padding: 10px 12px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.15);
        font: 12px/1.4 Arial, sans-serif;
        color: #111;
        min-width: 240px;
      `;

      const title = document.createElement("div");
      title.textContent = "Scholar Export (CSV + BibTeX)";
      title.style.cssText = "font-weight: 700; margin-bottom: 8px;";

      const btnLoad = document.createElement("button");
      btnLoad.textContent = "Load all (optional)";
      btnLoad.style.cssText = `
        width: 100%;
        margin-bottom: 6px;
        padding: 6px 8px;
        border: 1px solid #999;
        border-radius: 8px;
        background: #f7f7f7;
        cursor: pointer;
      `;
      btnLoad.onclick = () => loadAllPublications().catch(err => alert(String(err)));

      const btnExport = document.createElement("button");
      btnExport.textContent = "Export CSV";
      btnExport.style.cssText = `
        width: 100%;
        padding: 6px 8px;
        border: 1px solid #0b57d0;
        border-radius: 8px;
        background: #1a73e8;
        color: #fff;
        cursor: pointer;
        font-weight: 700;
      `;
      btnExport.onclick = () => {
        const rows = extractPublications();
        if (!rows.length) {
          alert("No publication rows found. Make sure your publications table is visible.");
          return;
        }
        const headers = ["title", "authors", "venue", "year", "citation_count", "citation_for_view_url", "cites_url"];
        const csv = toCSV(rows, headers);
        downloadText(`google_scholar_publications_${nowStamp()}.csv`, csv);
      };

      const btnBib = document.createElement("button");
      btnBib.textContent = "Export BibTeX links list";
      btnBib.style.cssText = `
        width: 100%;
        margin-top: 6px;
        padding: 6px 8px;
        border: 1px solid #137333;
        border-radius: 8px;
        background: #34a853;
        color: #fff;
        cursor: pointer;
        font-weight: 700;
      `;
      btnBib.onclick = () => exportBibTeXLinksList().catch(err => alert(String(err)));

      const btnPoP = document.createElement("button");
btnPoP.textContent = "Export PoPCites.csv";
btnPoP.style.cssText = `
  width: 100%;
  margin-top: 6px;
  padding: 6px 8px;
  border: 1px solid #6a1b9a;
  border-radius: 8px;
  background: #8e24aa;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
`;
btnPoP.onclick = () => {
  try { exportPoPCitesCSV(); }
  catch (e) { console.error("[GS Exporter] PoP export failed:", e); alert(String(e)); }
};



      const note = document.createElement("div");
      note.style.cssText = "margin-top: 8px; color: #444;";
      note.textContent = "DOM-only export. If Scholar prompts CAPTCHA, solve it manually.";

      box.appendChild(title);
      box.appendChild(btnLoad);
      box.appendChild(btnExport);
      box.appendChild(btnBib);
      box.appendChild(note);
box.appendChild(btnPoP);

      document.body.appendChild(box);
    }

    //injectUI();
    //setTimeout(injectUI, 1500);

console.log("[GS Exporter] injected on:", location.href);

function waitAndInject() {
  const tableBody = document.querySelector("#gsc_a_b");
  if (!tableBody) {
    console.log("[GS Exporter] waiting for #gsc_a_b ...");
    setTimeout(waitAndInject, 800);
    return;
  }
  console.log("[GS Exporter] found table, injecting UI");
  injectUI();
}

waitAndInject();


  })();
