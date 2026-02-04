// content.js
(() => {
  const KEY_ENABLED = "auditx_enabled";
  const KEY_STATE = "auditx_state";

  // ===== Utils =====
  const uniq = (arr) => [...new Set(arr)].filter(Boolean);
  const normalizeSpace = (s) => (s || "").replace(/\s+/g, " ").trim();

  const extractEmails = (text) => {
    const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const found = (text || "").match(re) || [];
    // normaliza: lower + remove pontuação final colada
    const cleaned = found
      .map((e) => e.trim().replace(/[),.;:]+$/g, "").toLowerCase());
    return uniq(cleaned);
  };

  // ===== Extract Phones (versão atual + regra definitiva do deep) =====
  const extractPhones = (text) => {
    const full = text || "";
    const candidates = [];

    // ========== 1) Coleta ==========
    // tel: links (confiável)
    try {
      document.querySelectorAll('a[href^="tel:"]').forEach((a) => {
        const href = a.getAttribute("href") || "";
        const after = href.slice(4);
        if (after) candidates.push({ raw: after, strong: true });
      });
    } catch {}

    // padrões específicos
    const re0800 = /\b0?800[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
    const re0300 = /\b0?300[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
    const re400x = /\b400\d[\s.-]?\d{3}[\s.-]?\d{3}\b/g;

    // ampla (DDD + número, ou só fixo formatado)
    const reBroad =
      /\b(?:\+?55[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9?\d{4})[\s.-]?\d{4}\b/g;

    // fixo sem DDD mas formatado
    const reFixedMasked = /\b\d{4}[-\s.]\d{4}\b/g;

    pushMatches(re0800);
    pushMatches(re0300);
    pushMatches(re400x);
    pushMatches(reBroad);
    pushMatches(reFixedMasked);

    // ========== 2) Validação + dedupe ==========
    const map = new Map(); // keyDigits -> display

    for (const c of candidates) {
      const display = normalizeDisplay(c.raw);
      if (!display) continue;

      // ===== REGRA DEFINITIVA DO DEEP =====
      // Se NÃO tem máscara clara de telefone e NÃO veio de tel:, descarta
      const hasPhoneMask =
        /\(\d{2}\)\s?\d{4,5}-\d{4}/.test(display) || // (11) 9494-0144
        /\b\d{2}\s\d{4,5}-\d{4}\b/.test(display) || // 11 9494-0144
        /\b\d{4,5}-\d{4}\b/.test(display) || // 9494-0144
        /\b0?800[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(display) ||
        /\b0?300[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(display) ||
        /\b400\d[\s.-]?\d{3}[\s.-]?\d{3}\b/.test(display) ||
        /\b\d{3}[-\s]\d{3}[-\s]\d{4}\b/.test(display); // 800-474-3794

      if (!c.strong && !hasPhoneMask) continue;

      let digits = display.replace(/\D/g, "");
      if (!digits) continue;

      if (digits.length < 8 || digits.length > 13) continue;

      // remove pleno repetido (qualquer tamanho)
      if (allSame(digits)) continue;

      // run longo
      if (hasRun(digits, 6)) continue;

      // remove DDI 55
      if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);

      // garante de novo após normalizar
      if (allSame(digits)) continue;
      if (hasRun(digits, 6)) continue;

      // anti timestamp/id (seus 1754... etc)
      if (digits.length === 10 && /^(16|17|18)\d{8}$/.test(digits)) continue;

      // aceita 0800/0300/400x (mesmo se começar com 0)
      if (/^(0800|800)\d{7}$/.test(digits)) {
        const key = digits.startsWith("800") ? "0" + digits : digits;
        if (!map.has(key)) map.set(key, display);
        continue;
      }
      if (/^(0300|300)\d{7}$/.test(digits)) {
        const key = digits.startsWith("300") ? "0" + digits : digits;
        if (!map.has(key)) map.set(key, display);
        continue;
      }
      if (/^400\d\d{6}$/.test(digits)) {
        if (!map.has(digits)) map.set(digits, display);
        continue;
      }

      // remove DDI 55 (55 + DDD + número)
      if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);

      // BR com DDD (10/11)
      if (digits.length === 10 || digits.length === 11) {
        // não aceita começar com 0 (corta 0833..., 0416...)
        if (digits[0] === "0") continue;

        const ddd = Number(digits.slice(0, 2));
        if (!(ddd >= 11 && ddd <= 99)) continue;

        const num = digits.slice(2);

        // corta run >= 6 no número também
        if (allSame(num)) continue;
        if (hasRun(num, 6)) continue;

        // 11 dígitos: celular BR começa com 9
        if (digits.length === 11 && num[0] !== "9") continue;

        if (!map.has(digits)) map.set(digits, display);
        continue;
      }

      // sem DDD (8 dígitos) — só se vier formatado OU tel:
      if (digits.length === 8) {
        const isMasked = /\b\d{4}[-\s.]\d{4}\b/.test(display);
        if (!isMasked && !c.strong) continue;

        // extra: se começa com 0, fora
        if (digits[0] === "0") continue;

        if (!map.has(digits)) map.set(digits, display);
        continue;
      }

      // 9 dígitos sem DDD: só tel: (muito ruído em texto)
      if (digits.length === 9) {
        if (!c.strong) continue;
        if (digits[0] === "0") continue;
        if (!map.has(digits)) map.set(digits, display);
        continue;
      }
    }

    return Array.from(map.values());

    // ========== helpers ==========
    function pushMatches(re) {
      let m;
      while ((m = re.exec(full)) !== null) {
        candidates.push({ raw: m[0], strong: false });
      }
    }

    function normalizeDisplay(s) {
      return String(s || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,;:]+$/g, "");
    }

    function allSame(s) {
      if (!s || s.length < 2) return false;
      const c = s[0];
      for (let i = 1; i < s.length; i++) if (s[i] !== c) return false;
      return true;
    }

    function hasRun(s, runLen) {
      let count = 1;
      for (let i = 1; i < s.length; i++) {
        if (s[i] === s[i - 1]) {
          count++;
          if (count >= runLen) return true;
        } else count = 1;
      }
      return false;
    }
  };

  // ===== Social parsing =====
  function detectSocialType(url) {
    const u = (url || "").toLowerCase();
    if (u.includes("linkedin.com")) return "linkedin";
    if (u.includes("instagram.com")) return "instagram";
    if (u.includes("facebook.com")) return "facebook";
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
    if (u.includes("tiktok.com")) return "tiktok";
    if (u.includes("twitter.com") || u.includes("x.com")) return "x";
    if (u.includes("wa.me") || u.includes("web.whatsapp.com")) return "whatsapp";
    return "outros";
  }

  function extractSocialLinksGrouped() {
    const links = [...document.querySelectorAll("a[href]")]
      .map((a) => a.href)
      .filter(Boolean);

    const grouped = {};
    for (const href of links) {
      const t = detectSocialType(href);
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(href);
    }

    for (const k of Object.keys(grouped)) grouped[k] = uniq(grouped[k]);
    for (const k of Object.keys(grouped)) if (!grouped[k].length) delete grouped[k];
    return grouped;
  }

  function collectNow() {
    const text = document.body?.innerText || "";
    return {
      url: location.href,
      title: document.title || "",
      emails: extractEmails(text),
      phones: extractPhones(text),
      socialsGrouped: extractSocialLinksGrouped(),
      collectedAt: Date.now(),
    };
  }

  // ===== Storage (por aba) =====
  function loadLocalState() {
    try {
      const raw = sessionStorage.getItem(KEY_STATE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveLocalState(obj) {
    try {
      sessionStorage.setItem(KEY_STATE, JSON.stringify(obj));
    } catch {}
  }

  function isEnabled() {
    return sessionStorage.getItem(KEY_ENABLED) === "1";
  }
  function setEnabled(v) {
    sessionStorage.setItem(KEY_ENABLED, v ? "1" : "0");
  }

  // ===== UI =====
  let panelEl = null;
  let bodyEl = null;
  let badgeEl = null;
  let lastUrl = location.href;
  let openSocialType = null;

  function ensureDefaults(state) {
    state.__ui = state.__ui || {};
    state.__filtersEmails = state.__filtersEmails || {};
    state.__filtersPhones = state.__filtersPhones || {};
    state.__selectEmails = state.__selectEmails || {}; // item -> true/false
    state.__selectPhones = state.__selectPhones || {}; // item -> true/false

    // defaults UI
    if (typeof state.__ui.openEmails !== "boolean") state.__ui.openEmails = true;
    if (typeof state.__ui.openPhones !== "boolean") state.__ui.openPhones = true;
    if (typeof state.__ui.openSocials !== "boolean") state.__ui.openSocials = false;
    if (typeof state.__ui.openSocialType !== "string") state.__ui.openSocialType = null;

    // defaults filtros emails
    if (typeof state.__filtersEmails.showCurrent !== "boolean")
      state.__filtersEmails.showCurrent = true;
    if (typeof state.__filtersEmails.showDeep !== "boolean")
      state.__filtersEmails.showDeep = true;
    if (typeof state.__filtersEmails.showWhois !== "boolean")
      state.__filtersEmails.showWhois = true;

    // defaults filtros phones
    if (typeof state.__filtersPhones.showCurrent !== "boolean")
      state.__filtersPhones.showCurrent = true;
    if (typeof state.__filtersPhones.showDeep !== "boolean")
      state.__filtersPhones.showDeep = true;

    // NOVO: mostrar números "não recomendados" (linha inteira sem separador)
    if (typeof state.__filtersPhones.showUnrecommended !== "boolean")
      state.__filtersPhones.showUnrecommended = false;

    return state;
  }

  function ensurePanel() {
    if (panelEl && document.body.contains(panelEl)) return;

    panelEl = document.createElement("div");
    panelEl.id = "auditx-panel";
    panelEl.innerHTML = `
      <div id="auditx-header">
        <div id="auditx-title">
          C.T.T.
          <span id="auditx-badge" class="auditx-pill">OFF</span>
        </div>
        <div id="auditx-actions">
          <button class="auditx-btn" id="auditx-refresh" type="button">Atualizar</button>
          <button class="auditx-btn" id="auditx-deep" type="button">Deep</button>
          <button class="auditx-btn" id="auditx-min" type="button">Min</button>
          <button class="auditx-btn" id="auditx-close" type="button">X</button>
        </div>
      </div>
      <div id="auditx-body"></div>
    `;

    document.documentElement.appendChild(panelEl);
    bodyEl = panelEl.querySelector("#auditx-body");
    badgeEl = panelEl.querySelector("#auditx-badge");

    // Drag
    const header = panelEl.querySelector("#auditx-header");
    let dragging = false,
      startX = 0,
      startY = 0,
      startTop = 0,
      startRight = 0;

    header.addEventListener("mousedown", (e) => {
      if (e.target && e.target.closest && e.target.closest("button")) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panelEl.getBoundingClientRect();
      startTop = rect.top;
      startRight = window.innerWidth - rect.right;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newTop = Math.max(
        10,
        Math.min(window.innerHeight - 80, startTop + dy)
      );
      const newRight = Math.max(
        10,
        Math.min(window.innerWidth - 80, startRight - dx)
      );
      panelEl.style.top = `${newTop}px`;
      panelEl.style.right = `${newRight}px`;
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
    });

    // Buttons
    panelEl.querySelector("#auditx-close").addEventListener("click", () => {
      setEnabled(false);
      hidePanel();
      chrome.runtime.sendMessage({ type: "PANEL_DISABLED" }).catch(() => {});
    });

    panelEl.querySelector("#auditx-min").addEventListener("click", () => {
      if (!bodyEl) return;
      bodyEl.style.display = bodyEl.style.display === "none" ? "block" : "none";
    });

    panelEl.querySelector("#auditx-refresh").addEventListener("click", async () => {
      await runCollectAndRender({ triggerDeep: false });
    });

    panelEl.querySelector("#auditx-deep").addEventListener("click", async () => {
      await startDeepScan();
    });
  }

  function showPanel() {
    ensurePanel();
    panelEl.style.display = "block";
  }
  function hidePanel() {
    if (panelEl) panelEl.style.display = "none";
  }

  function setBadge(mode, text) {
    badgeEl.textContent = text;
    badgeEl.classList.remove("auditx-green", "auditx-yellow", "auditx-red");
    if (mode === "ok") badgeEl.classList.add("auditx-green");
    if (mode === "work" || mode === "warn") badgeEl.classList.add("auditx-yellow");
    if (mode === "err") badgeEl.classList.add("auditx-red");
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  // ===== Fonte dos itens =====
  function addToSourceMap(map, items, source) {
    for (const v of items || []) {
      const key = String(v).trim();
      if (!key) continue;
      if (!map[key]) map[key] = new Set();
      map[key].add(source);
    }
  }

  function sourcesToBadges(set) {
    const s = set ? Array.from(set) : [];
    const order = ["current", "deep", "whois"];
    s.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    return s
      .map((src) => {
        if (src === "current")
          return `<span class="src-badge src-current">Página atual</span>`;
        if (src === "deep")
          return `<span class="src-badge src-deep">Sub-páginas</span>`;
        if (src === "whois")
          return `<span class="src-badge src-whois">WHOIS</span>`;
        return "";
      })
      .join("");
  }

  // ===== Phones ordering + hide unrecommended =====
  function classifyPhoneDisplay(display) {
    const s = String(display || "").trim();

    // recomendado = tem separador visível
    const hasSep = /[()\s\-\.]/.test(s);

    // remove parênteses e normaliza espaços
    const norm = s.replace(/[()]/g, "").replace(/\s+/g, " ").trim();

    // 1) XX XX XXXXX-XXXX  (ex: 55 11 91234-5678)
    const r1 = /^\+?\d{2}\s\d{2}\s\d{4,5}-\d{4}$/.test(norm);

    // 2) XX XXXXX-XXXX (ex: 11 91234-5678)
    const r2 = /^\d{2}\s\d{4,5}-\d{4}$/.test(norm);

    // 3) tem espaço em qualquer outro formato (ex: 800 474 3794)
    const r3 = !r1 && !r2 && /\s/.test(norm);

    // não recomendado: não tem separador e é só “linha inteira”
    const unrecommended = !hasSep;

    let rank = 99;
    if (r1) rank = 1;
    else if (r2) rank = 2;
    else if (r3) rank = 3;
    else if (unrecommended) rank = 90;

    return { rank, unrecommended };
  }

  function sortPhoneKeys(mapObj, showUnrecommended) {
    const keys = Object.keys(mapObj || {});
    const srcWeight = (set) => {
      if (set?.has("current")) return 0;
      if (set?.has("deep")) return 1;
      if (set?.has("whois")) return 2;
      return 3;
    };

    const filtered = keys.filter((k) => {
      const c = classifyPhoneDisplay(k);
      return showUnrecommended ? true : !c.unrecommended;
    });

    return filtered.sort((a, b) => {
      const ca = classifyPhoneDisplay(a);
      const cb = classifyPhoneDisplay(b);
      if (ca.rank !== cb.rank) return ca.rank - cb.rank;

      const wa = srcWeight(mapObj[a]);
      const wb = srcWeight(mapObj[b]);
      if (wa !== wb) return wa - wb;

      return a.localeCompare(b);
    });
  }

  function sortKeysByPriority(mapObj) {
    const keys = Object.keys(mapObj || {});
    const weight = (set) => {
      if (set?.has("current")) return 0;
      if (set?.has("deep")) return 1;
      if (set?.has("whois")) return 2;
      return 3;
    };

    return keys.sort((a, b) => {
      const wa = weight(mapObj[a]);
      const wb = weight(mapObj[b]);
      if (wa !== wb) return wa - wb;
      return a.localeCompare(b);
    });
  }

  function helpLegend() {
    return `
      <span class="auditx-help">?
        <span class="auditx-tooltip">
          <div style="margin-bottom:8px; font-weight:700;">Legenda das fontes</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <span class="src-badge src-current">Página atual</span>
            <span class="src-badge src-deep">Sub-páginas</span>
            <span class="src-badge src-whois">WHOIS</span>
          </div>
          <div style="margin-top:8px; opacity:.85;">
            <b>WHOIS</b>: email do domínio (RDAP/WHOIS).<br>
            <b>Sub-páginas</b>: páginas internas do mesmo domínio (deep).<br>
            <b>Página atual</b>: conteúdo desta página.
          </div>
        </span>
      </span>
    `;
  }

  // "!" toggle (liga/desliga não recomendados) — estilo parecido com "?"
  function warnToggle(active) {
    const bg = active ? "rgba(255,165,0,.18)" : "transparent";
    const br = active ? "rgba(255,165,0,.45)" : "rgba(255,255,255,.15)";
    const fg = active ? "rgba(255,165,0,1)" : "rgba(255,255,255,.85)";
    const label = active ? "Mostrando não recomendados" : "Ocultando não recomendados";

    return `
      <button
        type="button"
        data-warn-toggle="phones"
        title="${esc(label)}"
        style="
          width:22px;height:22px;line-height:22px;
          border-radius:999px;
          border:1px solid ${br};
          background:${bg};
          color:${fg};
          font-weight:800;
          cursor:pointer;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding:0;
        "
      >!</button>
    `;
  }

  // ===== Filters UI =====
  function pill(active, label, key, group) {
    const cls = active ? "auditx-pill auditx-green" : "auditx-pill";
    return `<button class="${cls}" data-filter="${esc(
      key
    )}" data-group="${esc(group)}" type="button">${esc(label)}</button>`;
  }

  function renderFilterBarEmails(filters) {
    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
        ${pill(!!filters.showCurrent, "Página atual", "showCurrent", "emails")}
        ${pill(!!filters.showDeep, "Sub-páginas", "showDeep", "emails")}
        ${pill(!!filters.showWhois, "WHOIS", "showWhois", "emails")}
      </div>
    `;
  }

  function renderFilterBarPhones(filters) {
    return `
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px;">
        ${pill(!!filters.showCurrent, "Página atual", "showCurrent", "phones")}
        ${pill(!!filters.showDeep, "Sub-páginas", "showDeep", "phones")}
      </div>
    `;
  }

  // ===== Seleção + cópia =====
  function autoSelectVisible(selectionMap, visibleKeys) {
    for (const k of visibleKeys) {
      if (selectionMap[k] === undefined) selectionMap[k] = true;
    }
  }

  function getSelectedVisible(selectionMap, visibleKeys) {
    return visibleKeys.filter((k) => selectionMap[k] === true);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  function computeSelectionState(selectionMap, visibleKeys) {
    if (!visibleKeys.length) return { all: false, some: false };
    let checked = 0;
    for (const k of visibleKeys) if (selectionMap[k] === true) checked++;
    return {
      all: checked === visibleKeys.length,
      some: checked > 0 && checked < visibleKeys.length,
    };
  }

  function renderMasterToggle(which, selState) {
    const cls = selState.all
      ? "auditx-master on"
      : selState.some
      ? "auditx-master mid"
      : "auditx-master";
    const symbol = selState.all ? "✓" : selState.some ? "–" : "";
    const title = selState.all
      ? "Tudo selecionado (clique para desmarcar tudo)"
      : "Selecionar tudo (visível pelos filtros)";
    return `<button class="${cls}" data-master="${which}" type="button" title="${title}">${symbol}</button>`;
  }

  function renderChecklist(mapObj, selectionMap, mode, phonesShowUnrecommended) {
    const keys =
      mode === "phones"
        ? sortPhoneKeys(mapObj, !!phonesShowUnrecommended)
        : sortKeysByPriority(mapObj);

    if (!keys.length) return `<div class="auditx-small">Nenhum</div>`;

    autoSelectVisible(selectionMap, keys);

    return `
      <ul class="auditx-checklist">
        ${keys
          .map((k) => {
            const checked = selectionMap[k] === true;
            return `
              <li class="auditx-item">
                <div class="auditx-item-left">
                  <input class="auditx-checkbox" type="checkbox" data-item="${esc(
                    k
                  )}" data-which="${esc(mode)}" ${checked ? "checked" : ""}>
                  <div class="auditx-value">${esc(k)}</div>
                </div>
                <div class="src-badges">${sourcesToBadges(mapObj[k])}</div>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  function wireChecklist(state, which) {
    const sel = which === "emails" ? state.__selectEmails : state.__selectPhones;

    panelEl
      .querySelectorAll(`input.auditx-checkbox[data-which="${which}"]`)
      .forEach((cb) => {
        cb.addEventListener("click", (e) => e.stopPropagation());
        cb.addEventListener("change", () => {
          const item = cb.getAttribute("data-item");
          if (!item) return;
          sel[item] = cb.checked;
          saveLocalState(state);
          render(state);
        });
      });
  }

  function wireFilterClicks(state) {
    panelEl.querySelectorAll("button[data-filter]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const key = btn.getAttribute("data-filter");
        const group = btn.getAttribute("data-group");
        if (!key || !group) return;

        if (group === "emails") {
          state.__filtersEmails[key] = !state.__filtersEmails[key];
        } else {
          state.__filtersPhones[key] = !state.__filtersPhones[key];
        }

        saveLocalState(state);
        render(state);
      });
    });
  }

  function wireWarnToggle(state) {
    const btn = panelEl.querySelector(`button[data-warn-toggle="phones"]`);
    if (!btn) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.__filtersPhones.showUnrecommended = !state.__filtersPhones.showUnrecommended;

      // Quando muda o filtro, garante que seleções "novas" sejam auto-selecionadas ao render
      saveLocalState(state);
      render(state);
    });
  }

  function wireCopyButton(state, which, toastId) {
    const btn = panelEl.querySelector(`#auditx-copy-${which}`);
    const toast = panelEl.querySelector(toastId);
    if (!btn) return;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const st = ensureDefaults(loadLocalState() || {});
      let sources = {};
      let visible = [];
      let selected = [];

      if (which === "emails") {
        const fe = st.__filtersEmails;
        if (fe.showCurrent) addToSourceMap(sources, st.emailsCurrent || [], "current");
        if (fe.showDeep) addToSourceMap(sources, st.emailsDeepPages || [], "deep");
        if (fe.showWhois) addToSourceMap(sources, st.emailsWhois || [], "whois");

        visible = sortKeysByPriority(sources);
        autoSelectVisible(st.__selectEmails, visible);
        selected = getSelectedVisible(st.__selectEmails, visible);
        saveLocalState(st);

        const out = selected.join(" | ");
        const ok = await copyToClipboard(out);
        if (toast) {
          toast.style.display = "block";
          toast.textContent = ok
            ? `Copiado! (${selected.length} emails)`
            : "Não consegui copiar automaticamente (sem permissão).";
          setTimeout(() => { toast.style.display = "none"; }, 1600);
        }
        return;
      }

      // phones
      const fp = st.__filtersPhones;
      if (fp.showCurrent) addToSourceMap(sources, st.phonesCurrent || [], "current");
      if (fp.showDeep) addToSourceMap(sources, st.phonesDeepPages || [], "deep");

      visible = sortPhoneKeys(sources, fp.showUnrecommended);
      autoSelectVisible(st.__selectPhones, visible);
      selected = getSelectedVisible(st.__selectPhones, visible);
      saveLocalState(st);

      const sanitized = selected.map((v) =>
        String(v)
          .replace(/[=()\s+\-\.]/g, "")
          .replace(/[^\d]/g, "")
      );
      const out = sanitized.join(" | ");
      const ok = await copyToClipboard(out);

      if (toast) {
        toast.style.display = "block";
        toast.textContent = ok
          ? `Copiado! (${selected.length} telefones)`
          : "Não consegui copiar automaticamente (sem permissão).";
        setTimeout(() => { toast.style.display = "none"; }, 1600);
      }
    });
  }

  function wireMasterToggle(state, emailKeysVisible, phoneKeysVisible) {
    panelEl.querySelectorAll("button[data-master]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const which = btn.getAttribute("data-master");
        if (!which) return;

        if (which === "emails") {
          const sel = state.__selectEmails;
          const { all } = computeSelectionState(sel, emailKeysVisible);
          for (const k of emailKeysVisible) sel[k] = !all;
        } else {
          const sel = state.__selectPhones;
          const { all } = computeSelectionState(sel, phoneKeysVisible);
          for (const k of phoneKeysVisible) sel[k] = !all;
        }

        saveLocalState(state);
        render(state);
      });
    });
  }

  // ===== Social icons =====
  const ICONS = {
    instagram: "icons/instagram.svg",
    facebook: "icons/facebook.svg",
    linkedin: "icons/linkedin.svg",
    youtube: "icons/youtube.svg",
    tiktok: "icons/tiktok.svg",
    x: "icons/twitter.svg",
    whatsapp: "icons/whatsapp.svg",
    outros: "icons/outros.svg",
  };

  function iconUrl(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch {
      return "";
    }
  }

  function renderSocialSection(grouped) {
    const types = Object.keys(grouped || {});
    if (!types.length) return `<div class="auditx-small">Nenhum</div>`;

    const sorted = types.slice().sort((a, b) => a.localeCompare(b));

    const iconsRow = `
      <div class="auditx-social-icons">
        ${sorted
          .map(
            (t) => `
          <button class="auditx-social-btn" data-social="${esc(
            t
          )}" title="${esc(t)}" type="button">
            <img src="${esc(iconUrl(ICONS[t] || ICONS.outros))}" alt="${esc(t)}">
          </button>
        `
          )
          .join("")}
      </div>
    `;

    const box =
      openSocialType && grouped[openSocialType]?.length
        ? `
        <div class="auditx-social-box">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
            <div style="font-weight:700; font-size:12px;">${esc(
              openSocialType
            )}</div>
            <button class="auditx-btn" id="auditx-social-close" type="button">Fechar</button>
          </div>
          <ul class="auditx-list">
            ${grouped[openSocialType]
              .map(
                (u) => `
              <li><a class="auditx-link auditx-social-link" href="${esc(
                u
              )}" target="_blank" rel="noreferrer noopener">${esc(u)}</a></li>
            `
              )
              .join("")}
          </ul>
        </div>
      `
        : "";

    return iconsRow + box;
  }

  function wireSocialClicks(grouped, state) {
    panelEl.querySelectorAll(".auditx-social-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = btn.getAttribute("data-social");
        if (!t) return;

        openSocialType = openSocialType === t ? null : t;
        state.__ui.openSocialType = openSocialType;
        saveLocalState(state);
        render(state);
      });
    });

    const closeBtn = panelEl.querySelector("#auditx-social-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSocialType = null;
        state.__ui.openSocialType = null;
        saveLocalState(state);
        render(state);
      });
    }

    panelEl.querySelectorAll("a.auditx-social-link").forEach((a) => {
      a.addEventListener("click", (e) => e.stopPropagation());
    });
  }

  // ===== Render =====
  function render(stateRaw) {
    if (!bodyEl) return;

    const state = ensureDefaults(stateRaw || {});
    openSocialType = state.__ui.openSocialType ?? openSocialType;

    // Emails visible by email filters
    const emailSources = {};
    const fe = state.__filtersEmails;
    if (fe.showCurrent) addToSourceMap(emailSources, state.emailsCurrent || [], "current");
    if (fe.showDeep) addToSourceMap(emailSources, state.emailsDeepPages || [], "deep");
    if (fe.showWhois) addToSourceMap(emailSources, state.emailsWhois || [], "whois");
    const emailKeysVisible = sortKeysByPriority(emailSources);

    // Phones visible by phone filters
    const phoneSources = {};
    const fp = state.__filtersPhones;
    if (fp.showCurrent) addToSourceMap(phoneSources, state.phonesCurrent || [], "current");
    if (fp.showDeep) addToSourceMap(phoneSources, state.phonesDeepPages || [], "deep");
    const phoneKeysVisible = sortPhoneKeys(phoneSources, fp.showUnrecommended);

    // Build checklist HTML (auto-select inside)
    const emailsChecklistHtml = renderChecklist(emailSources, state.__selectEmails, "emails");
    const phonesChecklistHtml = renderChecklist(
      phoneSources,
      state.__selectPhones,
      "phones",
      fp.showUnrecommended
    );

    // selection counts after auto-select
    const selectedEmails = getSelectedVisible(state.__selectEmails, emailKeysVisible);
    const selectedPhones = getSelectedVisible(state.__selectPhones, phoneKeysVisible);

    saveLocalState(state);

    const deep = state.deep || null;
    const deepStatus = deep?.status || "idle";
    const deepMsg = deep?.msg || "";
    const deepPages = deep?.pagesScanned ?? 0;
    const deepTried = deep?.pagesTried ?? 0;
    const deepWarnings = deep?.warnings || [];

    const socialsGrouped = state.socialsGrouped || {};
    const deepTop = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;">
        <span class="auditx-pill ${
          deepStatus === "running"
            ? "auditx-yellow"
            : deepStatus === "done"
            ? "auditx-green"
            : deepStatus === "error"
            ? "auditx-red"
            : ""
        }">${esc(deepStatus.toUpperCase())}</span>
        <span class="auditx-pill">Páginas: ${deepPages}/${deepTried}</span>      
      </div>
    `;

    bodyEl.innerHTML = `
      <div class="auditx-card">
  <div class="auditx-label">URL</div>

  <div style="display:flex; gap:10px; align-items:flex-start; justify-content:space-between;">
    <div style="min-width:0;">
      <div class="auditx-mono">${esc(state.url || location.href)}</div>
      <div class="auditx-small">Título: ${esc(state.title || document.title || "")}</div>
      ${deepTop}
    </div>
  </div>
</div>


      <details class="auditx-section" id="auditx-emails" ${state.__ui.openEmails ? "open" : ""}>
        <summary>
          <span>Emails</span>
          <span class="auditx-summary-right">
            ${renderMasterToggle("emails", computeSelectionState(state.__selectEmails, emailKeysVisible))}
            ${helpLegend()}
            <span>${emailKeysVisible.length} (sel: ${selectedEmails.length})</span>
          </span>
        </summary>

        ${renderFilterBarEmails(fe)}

        <div style="margin-top:10px;">
          ${emailsChecklistHtml}
        </div>

        <div class="auditx-copybar">
          <button class="auditx-copybtn" id="auditx-copy-emails" type="button">Copiar emails</button>
        </div>
        <div class="auditx-toast" id="auditx-toast-emails" style="display:none;"></div>
      </details>

      <details class="auditx-section" id="auditx-phones" ${state.__ui.openPhones ? "open" : ""}>
        <summary>
          <span>Telefones</span>
          <span class="auditx-summary-right">
            ${renderMasterToggle("phones", computeSelectionState(state.__selectPhones, phoneKeysVisible))}
            ${warnToggle(!!fp.showUnrecommended)}
            <span>${phoneKeysVisible.length} (sel: ${selectedPhones.length})</span>
          </span>
        </summary>

        ${renderFilterBarPhones(fp)}

        <div style="margin-top:10px;">
          ${phonesChecklistHtml}
        </div>

        <div class="auditx-copybar">
          <button class="auditx-copybtn" id="auditx-copy-phones" type="button">Copiar telefones</button>
        </div>
        <div class="auditx-toast" id="auditx-toast-phones" style="display:none;"></div>
      </details>

      <details class="auditx-section" id="auditx-socials" ${state.__ui.openSocials ? "open" : ""}>
        <summary>
          <span>Redes / Links</span>
          <span class="auditx-summary-right"><span>${Object.keys(socialsGrouped).length}</span></span>
        </summary>
        <div style="margin-top:8px;">
          ${renderSocialSection(socialsGrouped)}
        </div>
      </details>

      <div class="auditx-card">
        <div class="auditx-label">DEBUG</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <span class="auditx-pill ${
            deepStatus === "running"
              ? "auditx-yellow"
              : deepStatus === "done"
              ? "auditx-green"
              : deepStatus === "error"
              ? "auditx-red"
              : ""
          }">${esc(deepStatus.toUpperCase())}</span>
      
        </div>
        ${deepWarnings.length ? `
  <div class="auditx-card">
    <div class="auditx-label">Avisos do Deep</div>
    <ul class="auditx-list">${deepWarnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
  </div>
` : ""}

      </div>
    `;

    // Persist open/close
    const emailsD = panelEl.querySelector("#auditx-emails");
    const phonesD = panelEl.querySelector("#auditx-phones");
    const socialsD = panelEl.querySelector("#auditx-socials");
    if (emailsD)
      emailsD.addEventListener("toggle", () => {
        state.__ui.openEmails = emailsD.open;
        saveLocalState(state);
      });
    if (phonesD)
      phonesD.addEventListener("toggle", () => {
        state.__ui.openPhones = phonesD.open;
        saveLocalState(state);
      });
    if (socialsD)
      socialsD.addEventListener("toggle", () => {
        state.__ui.openSocials = socialsD.open;
        saveLocalState(state);
      });

    wireFilterClicks(state);
    wireWarnToggle(state);

    wireChecklist(state, "emails");
    wireChecklist(state, "phones");

    wireCopyButton(state, "emails", "#auditx-toast-emails");
    wireCopyButton(state, "phones", "#auditx-toast-phones");

    wireMasterToggle(state, emailKeysVisible, phoneKeysVisible);

    // Social wiring
    if (Object.keys(socialsGrouped).length) wireSocialClicks(socialsGrouped, state);
  }

  // ===== Deep Scan (SW) =====
  async function startDeepScan() {
    const state = ensureDefaults(loadLocalState() || {});
    const url = location.href;

    state.deep = {
      status: "running",
      msg: "Iniciando deep scan…",
      pagesScanned: 0,
      pagesTried: 0,
      warnings: [],
    };
    saveLocalState(state);
    render(state);
    setBadge("work", "DEEP…");

    try {
      await chrome.runtime.sendMessage({
        type: "DEEP_SCAN_START",
        url,
        opts: { maxPages: 12, maxQueued: 90, delayMs: 120, rdap: true },
      });
    } catch (e) {
      const msg = String(e?.message || e);
      state.deep.status = "error";
      state.deep.msg = msg || "Falha ao iniciar deep scan.";
      saveLocalState(state);
      render(state);
      setBadge("err", "ERRO");
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "DEEP_PROGRESS") {
      const state = ensureDefaults(loadLocalState() || {});
      state.deep = state.deep || {};
      state.deep.status = "running";
      state.deep.msg = msg.msg || "Deep scan em andamento…";
      state.deep.pagesScanned = msg.pagesScanned ?? state.deep.pagesScanned ?? 0;
      state.deep.pagesTried = msg.pagesTried ?? state.deep.pagesTried ?? 0;
      saveLocalState(state);
      render(state);
      setBadge("work", "DEEP…");
    }

    if (msg.type === "DEEP_DONE") {
      const state = ensureDefaults(loadLocalState() || {});
      state.emailsDeepPages = uniq(msg.emailsPages || []);
      state.phonesDeepPages = uniq(msg.phonesPages || []);
      state.emailsWhois = uniq(msg.emailsWhois || []);

      state.deep = {
        status: "done",
        msg: msg.msg || "Deep scan concluído.",
        pagesScanned: msg.pagesScanned ?? 0,
        pagesTried: msg.pagesTried ?? 0,
        warnings: msg.warnings || [],
      };

      saveLocalState(state);
      render(state);
      setBadge("ok", "OK");
    }

    if (msg.type === "DEEP_ERROR") {
      const state = ensureDefaults(loadLocalState() || {});
      state.deep = {
        status: "error",
        msg: msg.error || "Deep scan falhou.",
        pagesScanned: msg.pagesScanned ?? 0,
        pagesTried: msg.pagesTried ?? 0,
        warnings: msg.warnings || [],
      };
      saveLocalState(state);
      render(state);
      setBadge("err", "ERRO");
    }
  });

  // ===== Coleta + Auto deep =====
  async function runCollectAndRender({ triggerDeep }) {
    const data = collectNow();
    const state = ensureDefaults(loadLocalState() || {});

    state.url = data.url;
    state.title = data.title;

    state.emailsCurrent = uniq(data.emails || []);
    state.phonesCurrent = uniq(data.phones || []);
    state.socialsGrouped = data.socialsGrouped || {};
    state.collectedAt = data.collectedAt;

    if (state.url !== lastUrl) {
      state.deep = { status: "idle", msg: "", pagesScanned: 0, pagesTried: 0, warnings: [] };
      state.emailsDeepPages = [];
      state.phonesDeepPages = [];
      state.emailsWhois = [];

      state.__selectEmails = {};
      state.__selectPhones = {};

      state.__ui.openSocialType = null;
      openSocialType = null;
    }

    lastUrl = state.url;

    saveLocalState(state);
    render(state);
    setBadge("ok", "ON");

    if (triggerDeep) await startDeepScan();
  }

  async function pollUrlChangeLoop() {
    setInterval(async () => {
      if (!isEnabled()) return;
      const current = location.href;
      if (current !== lastUrl) {
        showPanel();
        await runCollectAndRender({ triggerDeep: true });
      }
    }, 900);
  }

  // ===== Toggle =====
  async function togglePanel() {
    const enabled = isEnabled();
    setEnabled(!enabled);

    if (!enabled) {
      showPanel();
      setBadge("work", "INICIANDO…");
      await runCollectAndRender({ triggerDeep: true });
    } else {
      hidePanel();
      chrome.runtime.sendMessage({ type: "PANEL_DISABLED" }).catch(() => {});
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "PANEL_TOGGLE") {
      togglePanel()
        .then(() => sendResponse({ ok: true }))
        .catch((err) =>
          sendResponse({ ok: false, error: String(err?.message || err) })
        );
      return true;
    }
  });

  // ===== Boot =====
  (function boot() {
    ensurePanel();

    const prev = ensureDefaults(loadLocalState() || {});
    openSocialType = prev.__ui.openSocialType;

    if (isEnabled()) {
      showPanel();
      setBadge("ok", "ON");
      render(prev);
      runCollectAndRender({ triggerDeep: true }).catch(() => {});
    } else {
      hidePanel();
      setBadge("off", "OFF");
    }

    pollUrlChangeLoop();
  })();
})();
