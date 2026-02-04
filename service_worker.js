// service_worker.js (MV3) - Deep scan por aba + fontes separadas (sub-páginas vs WHOIS/RDAP)

function uniq(arr) { return [...new Set(arr)].filter(Boolean); }

function extractEmails(text) {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return uniq((text || "").match(re) || []);
}

function extractPhones(text) {
  const out = [];
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  const re0800 = /\b0?800[\s-]?\d{3}[\s-]?\d{4}\b/g;
  const re0300 = /\b0?300[\s-]?\d{3}[\s-]?\d{4}\b/g;
  const re400x = /\b400\d[\s-]?\d{3}[\s-]?\d{3}\b/g;
  const reBR = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-.\s]?\d{4}/g;

  for (const m of ((text || "").match(re0800) || [])) out.push(norm(m));
  for (const m of ((text || "").match(re0300) || [])) out.push(norm(m));
  for (const m of ((text || "").match(re400x) || [])) out.push(norm(m));
  for (const m of ((text || "").match(reBR) || [])) out.push(norm(m));

  return uniq(out);
}

function extractHrefs(html, baseUrl) {
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  const links = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    const low = raw.toLowerCase();
    if (low.startsWith("javascript:") || low.startsWith("mailto:") || low.startsWith("tel:")) continue;
    try { links.push(new URL(raw, baseUrl).toString()); } catch {}
  }
  return uniq(links);
}

function cleanUrl(u) {
  try {
    const x = new URL(u);
    const drop = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","fbclid","gclid","igsh","si"];
    drop.forEach(k => x.searchParams.delete(k));
    x.hash = "";
    return x.toString();
  } catch { return u; }
}

function isSameHost(url, host) {
  try { return new URL(url).hostname === host; } catch { return false; }
}

function scoreLink(u) {
  const s = (u || "").toLowerCase();
  const keywords = [
    "contato","contact","fale-conosco","faleconosco","atendimento",
    "sobre","about","empresa","institucional","quem-somos","quemsomos",
    "suporte","support","ajuda","help","sac","ouvidoria","imprensa",
    "privacy","privacidade","terms","termos"
  ];
  let score = 0;
  for (const k of keywords) if (s.includes(k)) score += 3;
  if (s.includes("/blog")) score -= 1;
  if (s.includes("/tag/") || s.includes("/category/")) score -= 2;
  if (s.includes(".pdf")) score -= 4;
  return score;
}

async function fetchHtml(url) {
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} | ${txt.slice(0, 180)}`);
  }
  const txt = await res.text();
  return { text: txt };
}

async function rdapEmailLookup(domain) {
  const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { "accept": "application/rdap+json, application/json;q=0.9, */*;q=0.8" }
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`RDAP HTTP ${res.status} ${res.statusText} | ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const emails = extractEmails(JSON.stringify(json));
    return { source: "rdap.org", emails };
  } catch (e) {
    if (String(e?.name || "").includes("AbortError")) throw new Error("RDAP timeout (12s).");
    throw new Error(String(e?.message || e));
  } finally {
    clearTimeout(t);
  }
}

async function deepScanSameDomain(startUrl, opts, onProgress) {
  const { maxPages = 10, maxQueued = 80, delayMs = 200, rdap = true } = opts || {};

  const start = cleanUrl(startUrl);
  const host = new URL(start).hostname;

  const visited = new Set();
  const queue = [start];

  const emailsPages = new Set();
  const phonesPages = new Set();
  const warnings = [];

  let pagesScanned = 0;
  let pagesTried = 0;

  function enqueue(link) {
    const cu = cleanUrl(link);
    if (!cu) return;
    if (!isSameHost(cu, host)) return;
    if (visited.has(cu)) return;
    if (queue.includes(cu)) return;
    if (queue.length >= maxQueued) return;
    queue.push(cu);
  }

  onProgress?.({ pagesScanned, pagesTried, msg: `Fila inicial: 1 | Host: ${host}` });

  while (queue.length && pagesScanned < maxPages) {
    queue.sort((a, b) => scoreLink(b) - scoreLink(a));

    const url = queue.shift();
    if (!url || visited.has(url)) continue;

    visited.add(url);
    pagesTried += 1;

    try {
      const { text } = await fetchHtml(url);

      for (const e of extractEmails(text)) emailsPages.add(e);
      for (const p of extractPhones(text)) phonesPages.add(p);

      const hrefs = extractHrefs(text, url);
      for (const h of hrefs) enqueue(h);

      pagesScanned += 1;

      onProgress?.({
        pagesScanned,
        pagesTried,
        msg: `Escaneando (${pagesScanned}/${maxPages}) | fila=${queue.length} | ${new URL(url).pathname || "/"}`
      });
    } catch (e) {
      warnings.push(`Falha em ${url}: ${String(e?.message || e)}`.slice(0, 240));
      onProgress?.({ pagesScanned, pagesTried, msg: `Aviso: falha em 1 página (avisos=${warnings.length})` });
    }

    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }

  let emailsWhois = [];
  if (rdap) {
    try {
      onProgress?.({ pagesScanned, pagesTried, msg: "WHOIS/RDAP: consultando…" });
      const out = await rdapEmailLookup(host);
      emailsWhois = out.emails || [];
    } catch (e) {
      warnings.push(`WHOIS/RDAP: ${String(e?.message || e)}`.slice(0, 240));
    }
  }

  return {
    host,
    pagesScanned,
    pagesTried,
    emailsPages: [...emailsPages],
    phonesPages: [...phonesPages],
    emailsWhois: uniq(emailsWhois),
    warnings: warnings.slice(0, 6)
  };
}

async function safeSend(tabId, payload) {
  try { await chrome.tabs.sendMessage(tabId, payload); return true; }
  catch { return false; }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await safeSend(tab.id, { type: "PANEL_TOGGLE" });
});

const runningJobs = new Map(); // tabId -> { abort: boolean }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "DEEP_SCAN_START") {
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse?.({ ok: false, error: "Sem tabId (sender.tab.id)." }); return; }

    if (runningJobs.has(tabId)) {
      runningJobs.get(tabId).abort = true;
      runningJobs.delete(tabId);
    }

    const job = { abort: false };
    runningJobs.set(tabId, job);

    (async () => {
      const startUrl = msg.url;
      const opts = msg.opts || {};

      try {
        const result = await deepScanSameDomain(startUrl, opts, (p) => {
          if (job.abort) return;
          chrome.tabs.sendMessage(tabId, {
            type: "DEEP_PROGRESS",
            pagesScanned: p.pagesScanned ?? 0,
            pagesTried: p.pagesTried ?? 0,
            msg: p.msg || "Deep scan…"
          }).catch(() => {});
        });

        if (job.abort) return;

        await chrome.tabs.sendMessage(tabId, {
          type: "DEEP_DONE",
          pagesScanned: result.pagesScanned,
          pagesTried: result.pagesTried,
          emailsPages: result.emailsPages,
          phonesPages: result.phonesPages,
          emailsWhois: result.emailsWhois,
          warnings: result.warnings,
          msg: `Concluído: ${result.pagesScanned}/${result.pagesTried} páginas (${result.host})`
        }).catch(() => {});
      } catch (e) {
        if (job.abort) return;
        await chrome.tabs.sendMessage(tabId, {
          type: "DEEP_ERROR",
          error: String(e?.message || e)
        }).catch(() => {});
      } finally {
        if (runningJobs.get(tabId) === job) runningJobs.delete(tabId);
      }
    })();

    sendResponse?.({ ok: true });
    return true;
  }

  if (msg.type === "PANEL_DISABLED") {
    const tabId = sender?.tab?.id;
    if (tabId && runningJobs.has(tabId)) {
      runningJobs.get(tabId).abort = true;
      runningJobs.delete(tabId);
    }
    sendResponse?.({ ok: true });
    return;
  }
});
