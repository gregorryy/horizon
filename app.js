(function () {
  "use strict";

  const APP_VERSION = "1.0.14";
  const DATA_FORMAT_VERSION = 4;
  const K_ENTRIES = "horizon-entries-v4";
  const K_TODOS = "horizon-todos-v4";
  const K_DONE = "horizon-done-v4";
  const K_TODO_TOTALS = "horizon-todo-totals-v1";
  const K_TUFF_REWARDS = "horizon-tuff-rewards-v1";
  const K_TUFF = "horizon-tuff-v4";
  const K_SHOP = "horizon-shop-v1";
  const K_OLD_BORNES = "horizon-bornes-v4";
  const K_GH = "horizon-gh-v4";
  // Filets de sécurité : copie de l'état avant un Pull, et copie brute d'un
  // stockage local illisible avant qu'il ne soit réparé.
  const K_BACKUP = "horizon-backup-v1";
  const K_CORRUPT = "horizon-corrupt-v1";

  const STATE_KEYS = new Set([
    K_ENTRIES,
    K_TODOS,
    K_DONE,
    K_TODO_TOTALS,
    K_TUFF_REWARDS,
    K_TUFF,
    K_SHOP,
  ]);

  const SHOP_CATEGORIES = {
    "petit-plaisir": { label: "Plaisir", min: 20, max: 100 },
    sortie: { label: "Sortie", min: 100, max: 400 },
    materiel: { label: "Matériel", min: 400, max: 1500 },
    "gros-projet": { label: "Projet", min: 1500, max: 5000 },
  };

  const DEFAULT_TODOS = [
    { id: "1", text: "Boire 1.5L d'eau" },
    { id: "2", text: "Session de code" },
  ];

  // ---------------------------------------------------------------------------
  // Dates (locales : le jour affiché et le jour enregistré sont toujours les mêmes)
  // ---------------------------------------------------------------------------
  const pad2 = (n) => String(n).padStart(2, "0");
  const toISO = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayISO = () => toISO(new Date());

  // ---------------------------------------------------------------------------
  // Validation / intégrité des données
  // ---------------------------------------------------------------------------
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ID_RE = /^[\w.-]{1,64}$/;
  const REPO_RE = /^(?!\.+\/)[A-Za-z0-9_.-]+\/(?!\.+$)[A-Za-z0-9_.-]+$/;
  const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const MAX_TEXT = 200;

  const isPlainObject = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);

  function isISODate(s) {
    if (typeof s !== "string" || !ISO_RE.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return (
      dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
    );
  }

  const isSafeId = (s) =>
    typeof s === "string" && ID_RE.test(s) && !FORBIDDEN_KEYS.has(s);

  const cleanText = (s) =>
    typeof s === "string" ? s.trim().slice(0, MAX_TEXT) : "";

  function toFiniteNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // Chaque sanitizer ne jette jamais : il écarte les éléments invalides et
  // incrémente stats.dropped pour que l'appelant sache qu'il y a eu perte.
  function sanitizeEntries(raw, stats) {
    const byDate = new Map();
    if (!Array.isArray(raw)) {
      if (raw !== undefined) stats.dropped++;
      return [];
    }
    raw.forEach((x) => {
      const value = isPlainObject(x) ? toFiniteNumber(x.value) : null;
      if (!isPlainObject(x) || !isISODate(x.date) || value === null) {
        stats.dropped++;
        return;
      }
      if (byDate.has(x.date)) stats.dropped++;
      byDate.set(x.date, value);
    });
    return [...byDate].map(([date, value]) => ({ date, value }));
  }

  function sanitizeTodos(raw, stats) {
    const out = [];
    const seen = new Set();
    if (!Array.isArray(raw)) {
      if (raw !== undefined) stats.dropped++;
      return out;
    }
    raw.forEach((t) => {
      const text = isPlainObject(t) ? cleanText(t.text) : "";
      if (!isPlainObject(t) || !isSafeId(t.id) || !text || seen.has(t.id)) {
        stats.dropped++;
        return;
      }
      seen.add(t.id);
      out.push({ id: t.id, text });
    });
    return out;
  }

  function sanitizeTodoDone(raw, stats) {
    const out = {};
    if (!isPlainObject(raw)) {
      if (raw !== undefined) stats.dropped++;
      return out;
    }
    Object.keys(raw).forEach((date) => {
      if (!isISODate(date) || !Array.isArray(raw[date])) {
        stats.dropped++;
        return;
      }
      const ids = raw[date].filter(isSafeId);
      if (ids.length !== raw[date].length) stats.dropped++;
      out[date] = [...new Set(ids)];
    });
    return out;
  }

  function sanitizeTotals(raw, stats) {
    const out = {};
    if (!isPlainObject(raw)) {
      if (raw !== undefined) stats.dropped++;
      return out;
    }
    Object.keys(raw).forEach((date) => {
      const n = toFiniteNumber(raw[date]);
      if (!isISODate(date) || n === null || n < 0) {
        stats.dropped++;
        return;
      }
      out[date] = Math.trunc(n);
    });
    return out;
  }

  function sanitizeRewards(raw, stats) {
    const out = {};
    if (!isPlainObject(raw)) {
      if (raw !== undefined) stats.dropped++;
      return out;
    }
    Object.keys(raw).forEach((date) => {
      if (!isISODate(date) || !isPlainObject(raw[date])) {
        stats.dropped++;
        return;
      }
      const day = {};
      Object.keys(raw[date]).forEach((id) => {
        const n = toFiniteNumber(raw[date][id]);
        if (!isSafeId(id) || n === null) {
          stats.dropped++;
          return;
        }
        day[id] = Math.round(n);
      });
      out[date] = day;
    });
    return out;
  }

  function sanitizeShop(raw, stats) {
    const out = [];
    const seen = new Set();
    if (!Array.isArray(raw)) {
      if (raw !== undefined) stats.dropped++;
      return out;
    }
    raw.forEach((s) => {
      const name = isPlainObject(s) ? cleanText(s.name) : "";
      const price = isPlainObject(s) ? toFiniteNumber(s.price) : null;
      if (
        !isPlainObject(s) ||
        !isSafeId(s.id) ||
        seen.has(s.id) ||
        !name ||
        price === null ||
        price < 0
      ) {
        stats.dropped++;
        return;
      }
      seen.add(s.id);
      const item = {
        id: s.id,
        name,
        category: typeof s.category === "string" ? s.category : "",
        price: Math.round(price),
        purchased: s.purchased === true,
      };
      if (item.purchased && isISODate(s.purchasedAt)) {
        item.purchasedAt = s.purchasedAt;
      }
      out.push(item);
    });
    return out;
  }

  function sanitizeTuff(raw, stats) {
    const n = toFiniteNumber(raw);
    if (n === null) {
      if (raw !== undefined) stats.dropped++;
      return 0;
    }
    return Math.trunc(n);
  }

  function migrateTodoTotals(importedTodos, importedDone, importedTotals) {
    const totals =
      importedTotals && typeof importedTotals === "object"
        ? { ...importedTotals }
        : {};
    const fallbackTotal = Array.isArray(importedTodos)
      ? importedTodos.length
      : 0;
    Object.keys(importedDone || {}).forEach((date) => {
      if (totals[date] === undefined) totals[date] = fallbackTotal;
    });
    return totals;
  }

  // Normalise un état brut (stockage local ou JSON distant) en état sain.
  function normalizeState(raw) {
    const stats = { dropped: 0 };
    const todos = sanitizeTodos(raw.todos, stats);
    const todoDone = sanitizeTodoDone(raw.todoDone, stats);
    const state = {
      entries: sanitizeEntries(raw.entries, stats),
      todos,
      todoDone,
      todoTotals: migrateTodoTotals(
        todos,
        todoDone,
        sanitizeTotals(raw.todoTotals, stats),
      ),
      tuffRewards: sanitizeRewards(raw.tuffRewards, stats),
      tuff: sanitizeTuff(raw.tuff, stats),
      shopItems: sanitizeShop(raw.shopItems, stats),
    };
    return { state, dropped: stats.dropped };
  }

  // Vérifie qu'un JSON distant a la bonne forme avant d'y toucher.
  function assertRemoteShape(p) {
    if (!isPlainObject(p)) throw new Error("fichier distant invalide");
    if (
      typeof p.dataFormatVersion === "number" &&
      p.dataFormatVersion > DATA_FORMAT_VERSION
    ) {
      throw new Error(
        "le fichier distant vient d'une version plus récente de l'app",
      );
    }
    const arrays = ["entries", "todos", "shopItems"];
    const objects = ["todoDone", "todoTotals", "tuffRewards"];
    arrays.forEach((k) => {
      if (p[k] !== undefined && !Array.isArray(p[k])) {
        throw new Error(`champ « ${k} » invalide`);
      }
    });
    objects.forEach((k) => {
      if (p[k] !== undefined && !isPlainObject(p[k])) {
        throw new Error(`champ « ${k} » invalide`);
      }
    });
    if (p.tuff !== undefined && toFiniteNumber(p.tuff) === null) {
      throw new Error("champ « tuff » invalide");
    }
  }

  // ---------------------------------------------------------------------------
  // Stockage local
  // ---------------------------------------------------------------------------
  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  function load(k, fallback) {
    try {
      const r = localStorage.getItem(k);
      return r ? JSON.parse(r) : fallback;
    } catch {
      return fallback;
    }
  }

  let entries = [];
  let todos = [];
  let todoDone = {};
  let todoTotals = {};
  let tuffRewards = {};
  let shopItems = [];
  let tuff = 0;

  function applyState(s) {
    entries = s.entries;
    todos = s.todos;
    todoDone = s.todoDone;
    todoTotals = s.todoTotals;
    tuffRewards = s.tuffRewards;
    tuff = s.tuff;
    shopItems = s.shopItems;
  }

  function snapshot() {
    return { entries, todos, todoDone, todoTotals, tuffRewards, tuff, shopItems };
  }

  function loadFromStorage() {
    const raw = {
      entries: load(K_ENTRIES, []),
      todos: load(K_TODOS, DEFAULT_TODOS),
      todoDone: load(K_DONE, {}),
      todoTotals: load(K_TODO_TOTALS, {}),
      tuffRewards: load(K_TUFF_REWARDS, {}),
      tuff: lsGet(K_TUFF) || lsGet(K_OLD_BORNES) || "0",
      shopItems: load(K_SHOP, []),
    };
    const { state, dropped } = normalizeState(raw);
    if (dropped > 0) {
      console.warn(`Horizon : ${dropped} élément(s) invalide(s) écarté(s).`);
      try {
        localStorage.setItem(K_CORRUPT, JSON.stringify(raw));
      } catch {
        /* stockage plein : on continue quand même */
      }
    }
    applyState(state);
  }

  let saveWarned = false;
  function save() {
    try {
      localStorage.setItem(K_ENTRIES, JSON.stringify(entries));
      localStorage.setItem(K_TODOS, JSON.stringify(todos));
      localStorage.setItem(K_DONE, JSON.stringify(todoDone));
      localStorage.setItem(K_TODO_TOTALS, JSON.stringify(todoTotals));
      localStorage.setItem(K_TUFF_REWARDS, JSON.stringify(tuffRewards));
      localStorage.setItem(K_TUFF, tuff.toString());
      localStorage.setItem(K_SHOP, JSON.stringify(shopItems));
      return true;
    } catch {
      if (!saveWarned) {
        saveWarned = true;
        alert(
          "Impossible d'enregistrer en local (stockage plein ou bloqué). Les dernières modifications risquent d'être perdues.",
        );
      }
      return false;
    }
  }

  loadFromStorage();

  // Plusieurs onglets : on recharge l'état modifié ailleurs plutôt que de
  // l'écraser avec une copie périmée au prochain save().
  window.addEventListener("storage", (e) => {
    if (e.key !== null && !STATE_KEYS.has(e.key)) return;
    loadFromStorage();
    renderAll();
  });

  // Identifiant unique, au même format qu'avant (préfixe + horodatage).
  function newId(prefix, existingIds) {
    const taken = new Set(existingIds);
    let n = Date.now();
    while (taken.has(prefix + n)) n++;
    return prefix + n;
  }

  let currentDisplayYear = new Date().getFullYear();

  const el = {
    currentDateLabel: document.getElementById("currentDateLabel"),
    entryForm: document.getElementById("entryForm"),
    valueInput: document.getElementById("valueInput"),
    trendSvg: document.getElementById("trendSvg"),
    chartEmpty: document.getElementById("chartEmpty"),
    heatmapGrid: document.getElementById("heatmapGrid"),
    yearLabel: document.getElementById("yearLabel"),
    prevYearBtn: document.getElementById("prevYearBtn"),
    nextYearBtn: document.getElementById("nextYearBtn"),
    todoList: document.getElementById("todoList"),
    todoForm: document.getElementById("todoForm"),
    todoInput: document.getElementById("todoInput"),
    todoProgressText: document.getElementById("todoProgressText"),
    shopForm: document.getElementById("shopForm"),
    shopNameInput: document.getElementById("shopNameInput"),
    shopCategoryInput: document.getElementById("shopCategoryInput"),
    shopList: document.getElementById("shopList"),
    historyBody: document.getElementById("historyBody"),
    tuffBadge: document.getElementById("tuffBadge"),
    tuffWithdrawForm: document.getElementById("tuffWithdrawForm"),
    tuffWithdrawInput: document.getElementById("tuffWithdrawInput"),
    menuBtn: document.getElementById("menuBtn"),
    configModal: document.getElementById("configModal"),
    configClose: document.getElementById("configClose"),
    configSave: document.getElementById("configSave"),
    ghRepo: document.getElementById("ghRepo"),
    ghToken: document.getElementById("ghToken"),
    syncPushBtn: document.getElementById("syncPushBtn"),
    syncPullBtn: document.getElementById("syncPullBtn"),
  };

  el.currentDateLabel.textContent = new Date().toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  // Paramètres GitHub
  function getGhConfig() {
    const c = load(K_GH, null);
    return {
      repo: isPlainObject(c) && typeof c.repo === "string" ? c.repo : "",
      token: isPlainObject(c) && typeof c.token === "string" ? c.token : "",
    };
  }

  el.menuBtn.onclick = () => {
    const cfg = getGhConfig();
    el.ghRepo.value = cfg.repo;
    el.ghToken.value = cfg.token;
    el.configModal.classList.add("is-open");
  };
  el.configClose.onclick = () => el.configModal.classList.remove("is-open");
  el.configSave.onclick = () => {
    const repo = el.ghRepo.value.trim();
    if (repo && !REPO_RE.test(repo)) {
      alert("Dépôt invalide : le format attendu est utilisateur/repo.");
      return;
    }
    try {
      localStorage.setItem(
        K_GH,
        JSON.stringify({ repo, token: el.ghToken.value.trim() }),
      );
    } catch {
      alert("Impossible d'enregistrer les paramètres.");
      return;
    }
    el.configModal.classList.remove("is-open");
    alert("Paramètres enregistrés !");
  };

  el.tuffWithdrawForm.onsubmit = (e) => {
    e.preventDefault();
    const amount = Math.floor(Number(el.tuffWithdrawInput.value));
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (amount > tuff) {
      alert(`Tu ne peux pas retirer plus que ton solde de ${tuff} tuff.`);
      return;
    }
    tuff -= amount;
    el.tuffWithdrawInput.value = "";
    save();
    renderTodos();
  };

  // Enregistrement Valeur
  el.entryForm.onsubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(el.valueInput.value);
    if (!Number.isFinite(val)) return;
    const day = todayISO();
    const ex = entries.find((x) => x.date === day);
    if (ex) ex.value = val;
    else entries.push({ date: day, value: val });
    el.valueInput.value = "";
    save();
    renderAll();
  };

  function deleteEntry(date) {
    if (!confirm(`Supprimer l'entrée du ${date} ?`)) return;
    entries = entries.filter((x) => x.date !== date);
    save();
    renderAll();
  }

  // Sélecteur d'année Heatmap
  el.prevYearBtn.onclick = () => {
    currentDisplayYear--;
    renderHeatmap();
  };
  el.nextYearBtn.onclick = () => {
    currentDisplayYear++;
    renderHeatmap();
  };

  // Heatmap Annuelle rigoureuse (1 case = 1 jour de l'année sélectionnée)
  function renderHeatmap() {
    el.yearLabel.textContent = currentDisplayYear;
    el.heatmapGrid.innerHTML = "";

    const start = new Date(currentDisplayYear, 0, 1);
    const end = new Date(currentDisplayYear, 11, 31);

    // Ajustement pour commencer la grille proprement au premier jour de l'année
    let d = new Date(start);
    while (d.getDay() !== 1) {
      // Aligner sur le Lundi
      d.setDate(d.getDate() - 1);
    }

    const mapData = {};
    entries.forEach((x) => {
      mapData[x.date] = x.value;
    });

    while (d <= end || d.getDay() !== 1) {
      const iso = toISO(d);
      const box = document.createElement("i");
      box.className = "square";

      if (d.getFullYear() === currentDisplayYear) {
        const doneCount = (todoDone[iso] || []).filter((id) =>
          todos.some((todo) => todo.id === id),
        ).length;
        const hasVal = mapData[iso] !== undefined;
        const routineTotal =
          iso === todayISO() ? todos.length : todoTotals[iso] || todos.length;
        const completion =
          routineTotal > 0
            ? Math.min(100, Math.round((doneCount / routineTotal) * 100))
            : 0;

        box.classList.add(completion > 0 ? "l-active" : "l0");
        box.style.setProperty("--heat-progress", `${completion}%`);
        box.title = `${iso} — ${completion}% (${doneCount}/${routineTotal} tâches) / Val: ${hasVal ? mapData[iso] : "aucune"}`;
      } else {
        box.style.opacity = "0.1"; // Jours hors année affichée
      }

      el.heatmapGrid.appendChild(box);
      d.setDate(d.getDate() + 1);
    }
  }

  // Graphique SVG épuré
  function renderTrend() {
    const svg = el.trendSvg;
    svg.innerHTML = "";
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

    if (sorted.length < 2) {
      el.chartEmpty.style.display = "flex";
      return;
    }
    el.chartEmpty.style.display = "none";

    const W = 600,
      H = 160,
      pad = 20;
    const vals = sorted.map((x) => x.value);
    const min = Math.min(...vals),
      max = Math.max(...vals);
    const span = min === max ? 1 : max - min;

    const pts = sorted.map((x, i) => {
      const cx = pad + (i / (sorted.length - 1)) * (W - pad * 2);
      const cy = pad + (1 - (x.value - min) / span) * (H - pad * 2);
      return [cx, cy];
    });

    const ns = "http://www.w3.org/2000/svg";
    const pathD = `M ${pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ")}`;
    const areaD = `${pathD} L ${pts[pts.length - 1][0]} ${H - 5} L ${pts[0][0]} ${H - 5} Z`;

    const grad = document.createElementNS(ns, "linearGradient");
    grad.id = "cg";
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0");
    grad.setAttribute("y2", "1");
    grad.innerHTML = `<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>`;
    svg.appendChild(grad);

    const pathArea = document.createElementNS(ns, "path");
    pathArea.setAttribute("d", areaD);
    pathArea.setAttribute("fill", "url(#cg)");
    svg.appendChild(pathArea);

    const pathLine = document.createElementNS(ns, "path");
    pathLine.setAttribute("d", pathD);
    pathLine.setAttribute("fill", "none");
    pathLine.setAttribute("stroke", "var(--accent)");
    pathLine.setAttribute("stroke-width", "2.5");
    svg.appendChild(pathLine);

    const last = pts[pts.length - 1];
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", last[0]);
    dot.setAttribute("cy", last[1]);
    dot.setAttribute("r", "4");
    dot.setAttribute("fill", "var(--accent)");
    svg.appendChild(dot);
  }

  // To-Do / Routine
  el.todoForm.onsubmit = (e) => {
    e.preventDefault();
    const text = el.todoInput.value.trim();
    if (!text) return;
    todos.push({
      id: newId(
        "t_",
        todos.map((t) => t.id),
      ),
      text,
    });
    el.todoInput.value = "";
    save();
    renderTodos();
  };

  function deleteTodo(id) {
    todos = todos.filter((t) => t.id !== id);
    save();
    renderTodos();
  }

  function toggleTodo(id) {
    const day = todayISO();
    if (!todoDone[day]) todoDone[day] = [];
    if (todoTotals[day] === undefined) todoTotals[day] = todos.length;
    if (!tuffRewards[day]) tuffRewards[day] = {};
    const idx = todoDone[day].indexOf(id);
    if (idx > -1) {
      todoDone[day].splice(idx, 1);
      const reward = tuffRewards[day][id] ?? 10;
      tuff -= reward;
      delete tuffRewards[day][id];
    } else {
      const completedCount = todoDone[day].filter((todoId) =>
        todos.some((todo) => todo.id === todoId),
      ).length;
      const reward = 10 + completedCount * 5;
      todoDone[day].push(id);
      tuffRewards[day][id] = reward;
      tuff += reward;
    }
    save();
    renderTodos();
    renderHeatmap();
  }

  function renderTodos() {
    el.todoList.innerHTML = "";
    const day = todayISO();
    const doneToday = (todoDone[day] || []).filter((id) =>
      todos.some((todo) => todo.id === id),
    );

    if (todos.length === 0) {
      el.todoList.innerHTML = `<li style="text-align:center; color: var(--text-dim); padding: 8px;">Aucune routine.</li>`;
      el.todoProgressText.textContent = "0/0";
      el.tuffBadge.textContent = `${tuff} tuff`;
      return;
    }

    todos.forEach((t) => {
      const isDone = doneToday.includes(t.id);
      const li = document.createElement("li");
      li.className = `todo-row ${isDone ? "is-done" : ""}`;

      const left = document.createElement("div");
      left.className = "todo-left";
      left.onclick = () => toggleTodo(t.id);
      const box = document.createElement("div");
      box.className = "todo-box";
      box.textContent = isDone ? "✓" : "";
      const text = document.createElement("span");
      text.className = "todo-text";
      text.textContent = t.text;
      left.append(box, text);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn-del";
      del.textContent = "✕";
      del.onclick = () => deleteTodo(t.id);

      li.append(left, del);
      el.todoList.appendChild(li);
    });

    el.todoProgressText.textContent = `${doneToday.length}/${todos.length}`;
    el.tuffBadge.textContent = `${tuff} tuff`;
  }

  el.shopForm.onsubmit = (e) => {
    e.preventDefault();
    const name = el.shopNameInput.value.trim();
    const categoryKey = el.shopCategoryInput.value;
    const category = SHOP_CATEGORIES[categoryKey];
    if (!name || !category) return;
    const price =
      Math.floor(Math.random() * (category.max - category.min + 1)) +
      category.min;
    shopItems.push({
      id: newId(
        "shop_",
        shopItems.map((s) => s.id),
      ),
      name,
      category: categoryKey,
      price,
      purchased: false,
    });
    el.shopNameInput.value = "";
    save();
    renderShop();
  };

  function buyShopItem(id) {
    const item = shopItems.find((shopItem) => shopItem.id === id);
    if (!item || item.purchased) return;
    if (tuff < item.price) {
      alert(`Il te manque ${item.price - tuff} tuff.`);
      return;
    }
    tuff -= item.price;
    item.purchased = true;
    item.purchasedAt = todayISO();
    save();
    renderTodos();
    renderShop();
  }

  function deleteShopItem(id) {
    shopItems = shopItems.filter((item) => item.id !== id);
    save();
    renderShop();
  }

  function renderShop() {
    el.shopList.innerHTML = "";
    if (shopItems.length === 0) {
      el.shopList.innerHTML = `<li class="shop-empty">Aucune envie pour le moment.</li>`;
      return;
    }
    shopItems.forEach((item) => {
      const category = SHOP_CATEGORIES[item.category] || { label: "Autre" };
      const li = document.createElement("li");
      li.className = `shop-item ${item.purchased ? "is-purchased" : ""}`;

      const details = document.createElement("div");
      details.className = "shop-item__details";
      const name = document.createElement("strong");
      name.textContent = item.name;
      const meta = document.createElement("span");
      meta.textContent = item.purchased
        ? item.purchasedAt
          ? `${category.label} · acheté le ${item.purchasedAt}`
          : `${category.label} · acheté`
        : category.label;
      details.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "shop-item__actions";
      const price = document.createElement("span");
      price.className = "shop-price";
      price.textContent = `${item.price} tuff`;
      const buyButton = document.createElement("button");
      buyButton.type = "button";
      buyButton.className = "btn btn-ghost shop-buy";
      buyButton.textContent = item.purchased ? "Acheté" : "Acheter";
      buyButton.disabled = item.purchased;
      buyButton.onclick = () => buyShopItem(item.id);
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn-del";
      deleteButton.textContent = "✕";
      deleteButton.title = "Supprimer cette envie";
      deleteButton.onclick = () => deleteShopItem(item.id);
      actions.append(price, buyButton, deleteButton);
      li.append(details, actions);
      el.shopList.appendChild(li);
    });
  }

  // Historique Table
  function renderHistory() {
    el.historyBody.innerHTML = "";
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    if (sorted.length === 0) {
      el.historyBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-dim);">Vide.</td></tr>`;
      return;
    }
    sorted.forEach((x) => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = x.date;

      const tdValue = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = String(x.value);
      tdValue.appendChild(strong);

      const tdAction = document.createElement("td");
      tdAction.style.textAlign = "right";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost";
      btn.style.padding = "2px 8px";
      btn.style.fontSize = "0.75rem";
      btn.style.color = "var(--danger)";
      btn.textContent = "Supprimer";
      btn.onclick = () => deleteEntry(x.date);
      tdAction.appendChild(btn);

      tr.append(tdDate, tdValue, tdAction);
      el.historyBody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------------
  // Sync GitHub
  // ---------------------------------------------------------------------------
  function ghUrl(cfg) {
    return `https://api.github.com/repos/${cfg.repo}/contents/horizon-data.json`;
  }

  function ghHeaders(cfg, extra) {
    return {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      ...extra,
    };
  }

  // Retourne la config si elle est complète et bien formée, sinon null.
  function requireGhConfig(message) {
    const cfg = getGhConfig();
    if (!cfg.repo || !cfg.token) {
      alert(message);
      return null;
    }
    if (!REPO_RE.test(cfg.repo)) {
      alert("Dépôt invalide : le format attendu est utilisateur/repo.");
      return null;
    }
    return cfg;
  }

  function encodeBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  }

  function decodeBase64Utf8(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  // Lit le fichier distant. { exists:false } si absent, exception sinon.
  async function fetchRemote(cfg) {
    const res = await fetch(ghUrl(cfg), {
      headers: ghHeaders(cfg),
      cache: "no-store",
    });
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
    const data = await res.json();
    return { exists: true, sha: data.sha, data };
  }

  function parseRemotePayload(data) {
    if (
      !data ||
      data.encoding !== "base64" ||
      typeof data.content !== "string" ||
      !data.content
    ) {
      throw new Error("fichier distant illisible ou trop volumineux");
    }
    const parsed = JSON.parse(decodeBase64Utf8(data.content));
    assertRemoteShape(parsed);
    return parsed;
  }

  el.syncPushBtn.onclick = async () => {
    const cfg = requireGhConfig("Configurez les accès GitHub dans l'engrenage !");
    if (!cfg) return;

    // On ne pousse jamais un état local qui ne passe pas la validation.
    const { state, dropped } = normalizeState(snapshot());
    if (dropped > 0) {
      alert("Données locales incohérentes : envoi annulé.");
      return;
    }
    const payload = {
      appVersion: APP_VERSION,
      dataFormatVersion: DATA_FORMAT_VERSION,
      ...state,
    };

    try {
      el.syncPushBtn.disabled = true;
      el.syncPushBtn.textContent = "Envoi...";

      const remote = await fetchRemote(cfg);

      // Garde-fou : un appareil « vide » ne doit pas écraser un historique
      // plus riche sur GitHub sans confirmation.
      if (remote.exists) {
        try {
          const old = parseRemotePayload(remote.data);
          const remoteCount = Array.isArray(old.entries) ? old.entries.length : 0;
          if (remoteCount > state.entries.length) {
            const ok = confirm(
              `Le fichier GitHub contient ${remoteCount} entrées, ta copie locale seulement ${state.entries.length}.\n\nÉcraser GitHub quand même ?`,
            );
            if (!ok) return;
          }
        } catch {
          /* distant illisible : le remplacer par un état valide est voulu */
        }
      }

      const body = {
        message: "Sync Horizon",
        content: encodeBase64Utf8(JSON.stringify(payload, null, 2)),
      };
      if (remote.exists) body.sha = remote.sha;

      const resPut = await fetch(ghUrl(cfg), {
        method: "PUT",
        headers: ghHeaders(cfg, { "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (resPut.ok) alert("Push réussi !");
      else if (resPut.status === 409 || resPut.status === 422) {
        alert(
          "Le fichier distant a changé entre-temps. Récupère GitHub puis réessaie.",
        );
      } else alert(`Erreur lors du push (${resPut.status}).`);
    } catch (e) {
      alert("Erreur réseau : " + e.message);
    } finally {
      el.syncPushBtn.disabled = false;
      el.syncPushBtn.textContent = "Mettre à jour GitHub";
    }
  };

  el.syncPullBtn.onclick = async () => {
    const cfg = requireGhConfig("Configurez les accès GitHub !");
    if (!cfg) return;
    try {
      el.syncPullBtn.disabled = true;
      el.syncPullBtn.textContent = "Chargement...";
      const remote = await fetchRemote(cfg);
      if (!remote.exists) {
        alert("Fichier distant introuvable.");
        return;
      }
      const parsed = parseRemotePayload(remote.data);

      // Les champs absents du distant gardent leur valeur locale (comme avant).
      const { state: next, dropped } = normalizeState({
        entries: parsed.entries !== undefined ? parsed.entries : entries,
        todos: parsed.todos !== undefined ? parsed.todos : todos,
        todoDone: parsed.todoDone !== undefined ? parsed.todoDone : todoDone,
        todoTotals: parsed.todoTotals,
        tuffRewards: parsed.tuffRewards,
        tuff: parsed.tuff !== undefined ? parsed.tuff : tuff,
        shopItems: parsed.shopItems !== undefined ? parsed.shopItems : shopItems,
      });

      const note =
        dropped > 0
          ? `\n\n${dropped} élément(s) invalide(s) du fichier distant seront ignorés.`
          : "";
      const ok = confirm(
        `Remplacer tes données locales (${entries.length} entrées, ${tuff} tuff) par celles de GitHub (${next.entries.length} entrées, ${next.tuff} tuff) ?${note}`,
      );
      if (!ok) return;

      try {
        localStorage.setItem(
          K_BACKUP,
          JSON.stringify({ savedAt: new Date().toISOString(), ...snapshot() }),
        );
      } catch {
        /* sauvegarde de précaution best-effort */
      }

      applyState(next);
      save();
      renderAll();
      alert("Pull réussi !");
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      el.syncPullBtn.disabled = false;
      el.syncPullBtn.textContent = "Récupérer GitHub";
    }
  };

  function renderAll() {
    renderTodos();
    renderShop();
    renderHeatmap();
    renderTrend();
    renderHistory();
  }

  renderAll();
})();
