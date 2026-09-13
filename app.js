(function () {
  "use strict";

  var STORAGE_KEY = "horizon-entries-v1";
  var TODO_TEMPLATES_KEY = "horizon-todo-templates-v1";
  var TODO_DONE_KEY = "horizon-todo-done-v1";
  var PROGRESS_KEY = "horizon-progress-v1";
  var GH_CONFIG_KEY = "horizon-gh-config-v1";

  var MILESTONE_INTERVAL = 100;

  var BIOMES = [
    { name: "Plaine",   ground: "#DCD3AE", deco: "#8B8256", type: "tuft" },
    { name: "Forêt",     ground: "#B9C9A6", deco: "#3F5A3A", type: "tree" },
    { name: "Désert",    ground: "#E4CB98", deco: "#9C6B33", type: "cactus" },
    { name: "Montagne",  ground: "#C7C6BE", deco: "#5C5B52", type: "peak" },
    { name: "Côte",      ground: "#BFD9D6", deco: "#2D6E77", type: "wave" },
    { name: "Toundra",   ground: "#D7D2C4", deco: "#6E695C", type: "stone" }
  ];

  var JALON_PREFIXES = ["Col", "Vallée", "Crête", "Plateau", "Anse", "Combe", "Ravin", "Belvédère", "Promontoire", "Clairière", "Gué", "Défilé"];
  var JALON_SUFFIXES = ["des Brumes", "du Levant", "de l'Aube", "des Échos", "du Silence", "des Vents", "de la Lune", "des Pins", "du Nord", "des Étoiles", "de Cendre", "des Marées", "du Couchant", "des Songes", "de Givre"];

  var SKINS = [
    { id: "pas", name: "Pas de marche", cost: 0, glyph: "🥾" },
    { id: "renard", name: "Renard", cost: 40, glyph: "🦊" },
    { id: "montgolfiere", name: "Montgolfière", cost: 90, glyph: "🎈" },
    { id: "comete", name: "Comète", cost: 150, glyph: "☄️" }
  ];

  var SHOP_ITEMS = [
    {
      id: "elan",
      name: "Élan",
      icon: "➝",
      desc: "Une poussée immédiate : +25 sur la route.",
      baseCost: 60,
      costStep: 15,
      buy: function () { state.progress.distance += 25; }
    },
    {
      id: "vent",
      name: "Vent arrière",
      icon: "≋",
      desc: "Double tes gains de bornes pendant 24h.",
      baseCost: 80,
      costStep: 20,
      buy: function () {
        var base = Math.max(Date.now(), state.progress.multiplierUntil || 0);
        state.progress.multiplierUntil = base + 24 * 3600 * 1000;
      }
    },
    {
      id: "bouclier",
      name: "Bouclier de série",
      icon: "◈",
      desc: "Protège ta série un jour où tu ne coches rien.",
      baseCost: 50,
      costStep: 10,
      buy: function () { state.progress.shieldTokens = (state.progress.shieldTokens || 0) + 1; }
    }
  ];

  var state = {
    entries: loadEntries(),
    range: "7",
    editingDate: null,
    todos: loadTodoTemplates(),
    todoDone: loadTodoDone(),
    progress: loadProgress()
  };

  // ---------- storage ----------
  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function saveEntries() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries)); } catch (e) {}
  }

  function sortedEntries() {
    return state.entries.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }

  function upsertEntry(date, value) {
    var idx = state.entries.findIndex(function (e) { return e.date === date; });
    if (idx >= 0) {
      state.entries[idx].value = value;
    } else {
      state.entries.push({ date: date, value: value });
    }
    saveEntries();
  }

  function deleteEntry(date) {
    state.entries = state.entries.filter(function (e) { return e.date !== date; });
    saveEntries();
  }

  function loadTodoTemplates() {
    try {
      var raw = localStorage.getItem(TODO_TEMPLATES_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function saveTodoTemplates() {
    try { localStorage.setItem(TODO_TEMPLATES_KEY, JSON.stringify(state.todos)); } catch (e) {}
  }

  function loadTodoDone() {
    try {
      var raw = localStorage.getItem(TODO_DONE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) { return {}; }
  }

  function saveTodoDone() {
    try { localStorage.setItem(TODO_DONE_KEY, JSON.stringify(state.todoDone)); } catch (e) {}
  }

  function addTodoTemplate(text) {
    var id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.todos.push({ id: id, text: text });
    saveTodoTemplates();
  }

  function removeTodoTemplate(id) {
    state.todos = state.todos.filter(function (t) { return t.id !== id; });
    saveTodoTemplates();
  }

  function isTodoDoneToday(id) {
    var list = state.todoDone[todayISO()] || [];
    return list.indexOf(id) !== -1;
  }

  function defaultProgress() {
    return {
      bornes: 0,
      distance: 0,
      multiplierUntil: 0,
      shieldTokens: 0,
      shieldConsumedDates: [],
      skinsOwned: ["pas"],
      activeSkin: "pas",
      counts: {}
    };
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return defaultProgress();
      var d = defaultProgress();
      for (var k in d) { if (parsed[k] === undefined) parsed[k] = d[k]; }
      return parsed;
    } catch (e) { return defaultProgress(); }
  }

  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress)); } catch (e) {}
  }

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function taskReward(date, id) {
    return 8 + (hashStr(date + "|" + id) % 7);
  }

  function currentMultiplier() {
    return state.progress.multiplierUntil && Date.now() < state.progress.multiplierUntil ? 2 : 1;
  }

  function toggleTodoToday(id) {
    var date = todayISO();
    var list = state.todoDone[date] || [];
    var idx = list.indexOf(id);
    var amount = taskReward(date, id) * currentMultiplier();

    if (idx === -1) {
      list.push(id);
      state.progress.bornes += amount;
      state.progress.distance += amount;
    } else {
      list.splice(idx, 1);
      state.progress.bornes = Math.max(0, state.progress.bornes - amount);
      state.progress.distance = Math.max(0, state.progress.distance - amount);
    }
    state.todoDone[date] = list;
    saveTodoDone();
    saveProgress();
  }

  function computeStreak() {
    var count = 0;
    var cursor = new Date();
    var safety = 0;
    while (safety < 2000) {
      safety++;
      var iso = isoFromDate(cursor);
      var hasActivity = (state.todoDone[iso] || []).length > 0;
      if (hasActivity) {
        count++;
      } else if (iso === todayISO()) {
        // aujourd'hui en cours
      } else if (state.progress.shieldConsumedDates.indexOf(iso) !== -1) {
        // protégé par bouclier
      } else if (state.progress.shieldTokens > 0) {
        state.progress.shieldTokens--;
        state.progress.shieldConsumedDates.push(iso);
        saveProgress();
      } else {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function jalonName(index) {
    var combos = JALON_PREFIXES.length * JALON_SUFFIXES.length;
    var h = hashStr("jalon" + index);
    var p = JALON_PREFIXES[h % JALON_PREFIXES.length];
    var s = JALON_SUFFIXES[Math.floor(h / JALON_PREFIXES.length) % JALON_SUFFIXES.length];
    var cycle = Math.floor(index / combos);
    return p + " " + s + (cycle > 0 ? " " + (cycle + 1) : "");
  }

  function biomeAt(pos) {
    var chunk = Math.floor(pos / 10);
    var idx = hashStr("biome" + chunk) % BIOMES.length;
    return BIOMES[idx];
  }

  function isoFromDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function todayISO() {
    return isoFromDate(new Date());
  }

  var DAY_NAMES = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  var MONTH_NAMES = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

  function formatDateLong(iso) {
    var d = new Date(iso + "T00:00:00");
    return DAY_NAMES[d.getDay()] + " " + d.getDate() + " " + MONTH_NAMES[d.getMonth()];
  }

  function formatDateShort(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.getDate() + " " + MONTH_NAMES[d.getMonth()];
  }

  function formatValue(v) {
    var n = Number(v);
    if (Number.isInteger(n)) return String(n);
    return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }

  function formatDelta(delta) {
    var sign = delta > 0 ? "+" : delta < 0 ? "\u2212" : "";
    return sign + formatValue(Math.abs(delta));
  }

  function deltaClass(delta) {
    if (delta > 0) return "is-rise";
    if (delta < 0) return "is-fall";
    return "is-flat";
  }

  // ---------- DOM refs ----------
  var el = {
    entryForm: document.getElementById("entryForm"),
    valueInput: document.getElementById("valueInput"),
    entryDateLabel: document.getElementById("entryDateLabel"),
    latestValue: document.getElementById("latestValue"),
    latestDelta: document.getElementById("latestDelta"),
    latestDate: document.getElementById("latestDate"),
    rangeSwitch: document.getElementById("rangeSwitch"),
    chartWrap: document.querySelector(".chart-wrap"),
    chartSvg: document.getElementById("chartSvg"),
    chartLegend: document.getElementById("chartLegend"),
    statMin: document.getElementById("statMin"),
    statMax: document.getElementById("statMax"),
    statAvg: document.getElementById("statAvg"),
    statChange: document.getElementById("statChange"),
    historyList: document.getElementById("historyList"),
    historyEmpty: document.getElementById("historyEmpty"),
    exportBtn: document.getElementById("exportBtn"),
    resetBtn: document.getElementById("resetBtn"),
    sheet: document.getElementById("editSheet"),
    sheetBackdrop: document.getElementById("sheetBackdrop"),
    sheetDate: document.getElementById("sheetDate"),
    sheetValue: document.getElementById("sheetValue"),
    sheetSave: document.getElementById("sheetSave"),
    sheetDelete: document.getElementById("sheetDelete"),
    todoList: document.getElementById("todoList"),
    todoEmpty: document.getElementById("todoEmpty"),
    todoProgress: document.getElementById("todoProgress"),
    todoForm: document.getElementById("todoForm"),
    todoInput: document.getElementById("todoInput"),
    bornesBalance: document.getElementById("bornesBalance"),
    routeStreak: document.getElementById("routeStreak"),
    roadSvg: document.getElementById("roadSvg"),
    routeBiome: document.getElementById("routeBiome"),
    routeMilestone: document.getElementById("routeMilestone"),
    shopGrid: document.getElementById("shopGrid"),
    skinGrid: document.getElementById("skinGrid"),
    menuBtn: document.getElementById("menuBtn"),
    syncPushBtn: document.getElementById("syncPushBtn"),
    syncPullBtn: document.getElementById("syncPullBtn"),
    configSheet: document.getElementById("configSheet"),
    configBackdrop: document.getElementById("configBackdrop"),
    ghRepo: document.getElementById("ghRepo"),
    ghToken: document.getElementById("ghToken"),
    configSave: document.getElementById("configSave")
  };

  // ---------- GitHub Sync Logic ----------
  function getGhConfig() {
    try {
      var raw = localStorage.getItem(GH_CONFIG_KEY);
      return raw ? JSON.parse(raw) : { repo: "", token: "" };
    } catch (e) { return { repo: "", token: "" }; }
  }

  function saveGhConfig(repo, token) {
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify({ repo: repo, token: token }));
  }

  function openConfigSheet() {
    var cfg = getGhConfig();
    el.ghRepo.value = cfg.repo;
    el.ghToken.value = cfg.token;
    el.configSheet.classList.add("is-open");
  }

  function closeConfigSheet() {
    el.configSheet.classList.remove("is-open");
  }

  el.menuBtn.addEventListener("click", openConfigSheet);
  el.configBackdrop.addEventListener("click", closeConfigSheet);
  el.configSave.addEventListener("click", function () {
    saveGhConfig(el.ghRepo.value.trim(), el.ghToken.value.trim());
    closeConfigSheet();
    alert("Configuration GitHub enregistrée !");
  });

  async function githubPush() {
    var cfg = getGhConfig();
    if (!cfg.repo || !cfg.token) {
      alert("Veuillez configurer votre dépôt et votre token GitHub via le menu (icône ...).");
      openConfigSheet();
      return;
    }

    var payload = {
      entries: state.entries,
      todos: state.todos,
      todoDone: state.todoDone,
      progress: state.progress
    };

    var contentBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
    var path = "horizon-data.json";
    var url = "https://api.github.com/repos/" + cfg.repo + "/contents/" + path;

    try {
      el.syncPushBtn.textContent = "⏳ Envoi...";
      // Récupérer le SHA du fichier s'il existe déjà (requis par l'API GitHub pour MAJ)
      var getRes = await fetch(url, {
        headers: { "Authorization": "token " + cfg.token, "Accept": "application/vnd.github.v3+json" }
      });
      
      var sha = null;
      if (getRes.ok) {
        var fileData = await getRes.json();
        sha = fileData.sha;
      }

      var bodyData = {
        message: "Mise à jour des données Horizon",
        content: contentBase64
      };
      if (sha) bodyData.sha = sha;

      var putRes = await fetch(url, {
        method: "PUT",
        headers: {
          "Authorization": "token " + cfg.token,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyData)
      });

      if (putRes.ok) {
        alert("Sauvegarde GitHub réussie !");
      } else {
        var errJson = await putRes.json();
        alert("Erreur GitHub : " + (errJson.message || putRes.statusText));
      }
    } catch (e) {
      alert("Erreur réseau lors de la sauvegarde : " + e.message);
    } finally {
      el.syncPushBtn.textContent = "☁️ Sauvegarder sur GitHub";
    }
  }

  async function githubPull() {
    var cfg = getGhConfig();
    if (!cfg.repo || !cfg.token) {
      alert("Veuillez configurer votre dépôt et votre token GitHub via le menu.");
      openConfigSheet();
      return;
    }

    var path = "horizon-data.json";
    var url = "https://api.github.com/repos/" + cfg.repo + "/contents/" + path;

    try {
      el.syncPullBtn.textContent = "⏳ Téléchargement...";
      var res = await fetch(url, {
        headers: { "Authorization": "token " + cfg.token, "Accept": "application/vnd.github.v3+json" }
      });

      if (!res.ok) {
        alert("Impossible de récupérer le fichier sur GitHub (inexistant ou mauvais accès).");
        return;
      }

      var fileData = await res.json();
      var jsonString = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
      var data = JSON.parse(jsonString);

      if (data.entries) state.entries = data.entries;
      if (data.todos) state.todos = data.todos;
      if (data.todoDone) state.todoDone = data.todoDone;
      if (data.progress) state.progress = data.progress;

      saveEntries();
      saveTodoTemplates();
      saveTodoDone();
      saveProgress();

      renderAll();
      alert("Restauration depuis GitHub réussie !");
    } catch (e) {
      alert("Erreur lors de la restauration : " + e.message);
    } finally {
      el.syncPullBtn.textContent = "📥 Restaurer depuis GitHub";
    }
  }

  el.syncPushBtn.addEventListener("click", githubPush);
  el.syncPullBtn.addEventListener("click", githubPull);

  // ---------- Rendu global ----------
  function renderToday() {
    var sorted = sortedEntries();
    el.entryDateLabel.textContent = formatDateShort(todayISO());

    if (sorted.length === 0) {
      el.latestValue.textContent = "\u2014";
      el.latestDelta.textContent = "";
      el.latestDate.textContent = "Aucune valeur enregistrée";
      return;
    }

    var last = sorted[sorted.length - 1];
    var prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    el.latestValue.textContent = formatValue(last.value);
    el.latestDate.textContent = formatDateLong(last.date);

    if (prev) {
      var delta = last.value - prev.value;
      el.latestDelta.textContent = formatDelta(delta);
      el.latestDelta.className = "today__delta " + deltaClass(delta);
    } else {
      el.latestDelta.textContent = "";
      el.latestDelta.className = "today__delta";
    }

    var todayEntry = sorted.find(function (e) { return e.date === todayISO(); });
    el.valueInput.value = todayEntry ? todayEntry.value : "";
  }

  function entriesForRange() {
    var sorted = sortedEntries();
    if (state.range === "all") return sorted;
    var n = parseInt(state.range, 10);
    return sorted.slice(-n);
  }

  function renderChart() {
    var data = entriesForRange();
    var svg = el.chartSvg;
    svg.innerHTML = "";

    if (data.length < 2) {
      el.chartWrap.classList.add("is-empty");
      el.chartLegend.innerHTML = "";
      return;
    }
    el.chartWrap.classList.remove("is-empty");

    var W = 340, H = 180;
    var padX = 14, padTop = 18, padBottom = 26;

    var values = data.map(function (d) { return d.value; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;

    function xAt(i) { return padX + (i / (data.length - 1)) * (W - padX * 2); }
    function yAt(v) { return padTop + (1 - (v - min) / span) * (H - padTop - padBottom); }

    var ns = "http://www.w3.org/2000/svg";
    var lastVal = data[data.length - 1].value;
    var firstVal = data[0].value;
    var rising = lastVal >= firstVal;

    var points = data.map(function (d, i) { return [xAt(i), yAt(d.value)]; });
    var linePath = "M " + points.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L ");
    var areaPath = linePath +
      " L " + xAt(data.length - 1).toFixed(1) + " " + (H - padBottom) +
      " L " + xAt(0).toFixed(1) + " " + (H - padBottom) + " Z";

    var color = rising ? "var(--rise)" : "var(--fall)";

    var defs = document.createElementNS(ns, "defs");
    var grad = document.createElementNS(ns, "linearGradient");
    grad.setAttribute("id", "fillGrad");
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
    var stop1 = document.createElementNS(ns, "stop");
    stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", color); stop1.setAttribute("stop-opacity", "0.18");
    var stop2 = document.createElementNS(ns, "stop");
    stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", color); stop2.setAttribute("stop-opacity", "0");
    grad.appendChild(stop1); grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    var area = document.createElementNS(ns, "path");
    area.setAttribute("d", areaPath);
    area.setAttribute("fill", "url(#fillGrad)");
    svg.appendChild(area);

    var line = document.createElementNS(ns, "path");
    line.setAttribute("d", linePath);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "2");
    svg.appendChild(line);

    var lastPoint = points[points.length - 1];
    var dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", lastPoint[0]); dot.setAttribute("cy", lastPoint[1]);
    dot.setAttribute("r", "3.5"); dot.setAttribute("fill", color);
    svg.appendChild(dot);

    el.chartLegend.innerHTML = "<span>" + formatDateShort(data[0].date) + "</span><span>" + formatDateShort(data[data.length - 1].date) + "</span>";
  }

  function renderStats() {
    var sorted = sortedEntries();
    if (sorted.length === 0) {
      el.statMin.textContent = "\u2014";
      el.statMax.textContent = "\u2014";
      el.statAvg.textContent = "\u2014";
      el.statChange.textContent = "\u2014";
      return;
    }
    var values = sorted.map(function (e) { return e.value; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var avg = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    var change = values[values.length - 1] - values[0];

    el.statMin.textContent = formatValue(min);
    el.statMax.textContent = formatValue(max);
    el.statAvg.textContent = formatValue(avg);
    el.statChange.textContent = formatDelta(change);
  }

  function renderHistory() {
    var sorted = sortedEntries().slice().reverse();
    el.historyList.innerHTML = "";

    if (sorted.length === 0) {
      el.historyEmpty.style.display = "block";
      return;
    }
    el.historyEmpty.style.display = "none";

    sorted.forEach(function (entry, idx) {
      var prev = sorted[idx + 1];
      var delta = prev ? entry.value - prev.value : null;

      var li = document.createElement("li");
      li.className = "history__row";

      var dateSpan = document.createElement("span");
      dateSpan.className = "history__date";
      dateSpan.textContent = formatDateLong(entry.date);

      var right = document.createElement("div");
      right.className = "history__right";

      var deltaSpan = document.createElement("span");
      if (delta === null) {
        deltaSpan.className = "history__delta is-flat";
        deltaSpan.textContent = "\u2014";
      } else {
        deltaSpan.className = "history__delta " + deltaClass(delta);
        deltaSpan.textContent = formatDelta(delta);
      }

      var valueSpan = document.createElement("span");
      valueSpan.className = "history__value";
      valueSpan.textContent = formatValue(entry.value);

      right.appendChild(deltaSpan);
      right.appendChild(valueSpan);
      li.appendChild(dateSpan);
      li.appendChild(right);

      li.addEventListener("click", function () { openSheet(entry.date); });
      el.historyList.appendChild(li);
    });
  }

  function renderAll() {
    renderToday();
    renderChart();
    renderStats();
    renderHistory();
    renderTodos();
    renderRoute();
    renderShop();
  }

  function renderTodos() {
    el.todoList.innerHTML = "";
    if (state.todos.length === 0) {
      el.todoEmpty.style.display = "block";
      el.todoProgress.textContent = "";
      return;
    }
    el.todoEmpty.style.display = "none";

    var doneCount = 0;
    state.todos.forEach(function (task) {
      var done = isTodoDoneToday(task.id);
      if (done) doneCount++;

      var li = document.createElement("li");
      li.className = "todo__row" + (done ? " is-done" : "");

      var check = document.createElement("button");
      check.type = "button";
      check.className = "todo__check";
      check.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 8.5 L6.5 12 L13 4" fill="none" stroke="var(--paper)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      check.addEventListener("click", function () {
        toggleTodoToday(task.id);
        renderTodos();
        renderRoute();
        pulseBalance();
      });

      var text = document.createElement("span");
      text.className = "todo__text";
      text.textContent = task.text;

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "todo__remove";
      remove.textContent = "\u00d7";
      remove.addEventListener("click", function () {
        removeTodoTemplate(task.id);
        renderTodos();
      });

      li.appendChild(check);
      li.appendChild(text);
      li.appendChild(remove);
      el.todoList.appendChild(li);
    });

    el.todoProgress.textContent = doneCount + " / " + state.todos.length + " faites";
  }

  function pulseBalance() {
    el.bornesBalance.classList.add("is-pulse");
    setTimeout(function () { el.bornesBalance.classList.remove("is-pulse"); }, 180);
  }

  function renderRoute() {
    el.bornesBalance.textContent = Math.round(state.progress.bornes);
    var streak = computeStreak();
    el.routeStreak.textContent = streak > 0 ? streak + " jour" + (streak > 1 ? "s" : "") + " de suite" : "Coche une tâche pour partir";
    renderRoad();
  }

  function renderRoad() {
    var svg = el.roadSvg;
    svg.innerHTML = "";
    var ns = "http://www.w3.org/2000/svg";
    var W = 340, H = 140;

    var distance = state.progress.distance;
    var OFFSET = 15;
    var WINDOW = 60;
    var windowStart = distance - OFFSET;
    var scale = W / WINDOW;

    function roadY(pos) { return 78 + 20 * Math.sin(pos * 0.14); }

    var chunkSize = 10;
    var startChunk = Math.floor(windowStart / chunkSize) - 1;
    var endChunk = Math.floor((windowStart + WINDOW) / chunkSize) + 1;
    var lastBiomeName = "";

    for (var c = startChunk; c <= endChunk; c++) {
      var chunkPos = c * chunkSize;
      var biome = biomeAt(chunkPos + 1);
      var x0 = (chunkPos - windowStart) * scale;
      var x1 = ((chunkPos + chunkSize) - windowStart) * scale;

      var band = document.createElementNS(ns, "rect");
      band.setAttribute("x", x0.toFixed(1));
      band.setAttribute("y", "0");
      band.setAttribute("width", (x1 - x0 + 1).toFixed(1));
      band.setAttribute("height", H);
      band.setAttribute("fill", biome.ground);
      svg.appendChild(band);

      if (chunkPos <= distance && chunkPos + chunkSize > distance) {
        lastBiomeName = biome.name;
      }
    }

    var pathPts = [];
    for (var px = 0; px <= W; px += 8) {
      var pos = windowStart + px / scale;
      pathPts.push(px.toFixed(1) + " " + roadY(pos).toFixed(1));
    }
    var pathEl = document.createElementNS(ns, "path");
    pathEl.setAttribute("d", "M " + pathPts.join(" L "));
    pathEl.setAttribute("fill", "none");
    pathEl.setAttribute("stroke", "var(--paper)");
    pathEl.setAttribute("stroke-width", "5");
    svg.appendChild(pathEl);

    var markerX = OFFSET * scale;
    var markerY = roadY(distance);
    var skin = SKINS.find(function (s) { return s.id === state.progress.activeSkin; }) || SKINS[0];
    var marker = document.createElementNS(ns, "text");
    marker.setAttribute("x", markerX.toFixed(1));
    marker.setAttribute("y", (markerY + 7).toFixed(1));
    marker.setAttribute("text-anchor", "middle");
    marker.setAttribute("font-size", "22");
    marker.textContent = skin.glyph;
    svg.appendChild(marker);

    el.routeBiome.textContent = lastBiomeName || biomeAt(distance).name;
    var nextMilestoneIdx = Math.floor(distance / MILESTONE_INTERVAL) + 1;
    var remaining = nextMilestoneIdx * MILESTONE_INTERVAL - distance;
    el.routeMilestone.textContent = jalonName(nextMilestoneIdx) + " \u00b7 dans " + Math.round(remaining);
  }

  function shopCost(item) {
    return item.baseCost + item.costStep * (state.progress.counts[item.id] || 0);
  }

  function renderShop() {
    el.shopGrid.innerHTML = "";
    SHOP_ITEMS.forEach(function (item) {
      var cost = shopCost(item);
      var card = document.createElement("div");
      card.className = "shop__card";
      card.innerHTML = '<span class="shop__card-icon">' + item.icon + '</span><span class="shop__card-name">' + item.name + '</span><span class="shop__card-desc">' + item.desc + '</span>';

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop__card-btn";
      btn.textContent = cost + " bornes";
      btn.disabled = state.progress.bornes < cost;
      btn.addEventListener("click", function () {
        if (state.progress.bornes < shopCost(item)) return;
        state.progress.bornes -= shopCost(item);
        state.progress.counts[item.id] = (state.progress.counts[item.id] || 0) + 1;
        item.buy();
        saveProgress();
        renderRoute();
        renderShop();
        pulseBalance();
      });
      card.appendChild(btn);
      el.shopGrid.appendChild(card);
    });

    el.skinGrid.innerHTML = "";
    SKINS.forEach(function (skin) {
      var owned = state.progress.skinsOwned.indexOf(skin.id) !== -1;
      var equipped = state.progress.activeSkin === skin.id;

      var card = document.createElement("div");
      card.className = "shop__card";
      card.innerHTML = '<span class="shop__card-icon">' + skin.glyph + '</span><span class="shop__card-name">' + skin.name + '</span><span class="shop__card-desc">' + (skin.cost === 0 ? "Le voyageur par défaut." : "Voyageur alternatif.") + '</span>';

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop__card-btn" + (equipped ? " is-equipped" : owned ? " is-owned" : "");

      if (equipped) {
        btn.textContent = "Équipé";
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = "Équiper";
        btn.addEventListener("click", function () {
          state.progress.activeSkin = skin.id;
          saveProgress();
          renderShop();
          renderRoute();
        });
      } else {
        btn.textContent = skin.cost + " bornes";
        btn.disabled = state.progress.bornes < skin.cost;
        btn.addEventListener("click", function () {
          if (state.progress.bornes < skin.cost) return;
          state.progress.bornes -= skin.cost;
          state.progress.skinsOwned.push(skin.id);
          state.progress.activeSkin = skin.id;
          saveProgress();
          renderShop();
          renderRoute();
          pulseBalance();
        });
      }
      card.appendChild(btn);
      el.skinGrid.appendChild(card);
    });
  }

  function openSheet(date) {
    var entry = state.entries.find(function (e) { return e.date === date; });
    if (!entry) return;
    state.editingDate = date;
    el.sheetDate.textContent = formatDateLong(date);
    el.sheetValue.value = entry.value;
    el.sheet.classList.add("is-open");
  }

  function closeSheet() {
    el.sheet.classList.remove("is-open");
    state.editingDate = null;
  }

  el.sheetBackdrop.addEventListener("click", closeSheet);
  el.sheetSave.addEventListener("click", function () {
    var v = parseFloat(el.sheetValue.value);
    if (isNaN(v) || !state.editingDate) return;
    upsertEntry(state.editingDate, v);
    closeSheet();
    renderAll();
  });
  el.sheetDelete.addEventListener("click", function () {
    if (!state.editingDate) return;
    deleteEntry(state.editingDate);
    closeSheet();
    renderAll();
  });

  el.entryForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = parseFloat(el.valueInput.value);
    if (isNaN(v)) return;
    upsertEntry(todayISO(), v);
    el.valueInput.blur();
    renderAll();
  });

  el.todoForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = el.todoInput.value.trim();
    if (!text) return;
    addTodoTemplate(text);
    el.todoInput.value = "";
    el.todoInput.blur();
    renderTodos();
  });

  el.rangeSwitch.addEventListener("click", function (e) {
    var btn = e.target.closest(".range__btn");
    if (!btn) return;
    state.range = btn.getAttribute("data-range");
    Array.prototype.forEach.call(el.rangeSwitch.children, function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    renderChart();
  });

  el.exportBtn.addEventListener("click", function () {
    var sorted = sortedEntries();
    if (sorted.length === 0) return;
    var lines = ["date,valeur"];
    sorted.forEach(function (e) { lines.push(e.date + "," + e.value); });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "horizon-export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  el.resetBtn.addEventListener("click", function () {
    if (!confirm("Effacer toutes les entrées et progression ?")) return;
    state.entries = [];
    state.todos = [];
    state.todoDone = {};
    state.progress = defaultProgress();
    saveEntries(); saveTodoTemplates(); saveTodoDone(); saveProgress();
    renderAll();
  });

  renderAll();
})();