(function () {
  "use strict";

  const K_ENTRIES = "horizon-entries-v4";
  const K_TODOS = "horizon-todos-v4";
  const K_DONE = "horizon-done-v4";
  const K_BORNES = "horizon-bornes-v4";
  const K_GH = "horizon-gh-v4";

  let entries = load(K_ENTRIES, []);
  let todos = load(K_TODOS, [
    { id: "1", text: "Boire 1.5L d'eau" },
    { id: "2", text: "Session de code" }
  ]);
  let todoDone = load(K_DONE, {});
  let bornes = parseInt(localStorage.getItem(K_BORNES) || "0", 10);
  
  let currentDisplayYear = new Date().getFullYear();

  function load(k, fallback) {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
  }

  function save() {
    localStorage.setItem(K_ENTRIES, JSON.stringify(entries));
    localStorage.setItem(K_TODOS, JSON.stringify(todos));
    localStorage.setItem(K_DONE, JSON.stringify(todoDone));
    localStorage.setItem(K_BORNES, bornes.toString());
  }

  const todayISO = () => new Date().toISOString().split("T")[0];

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
    historyBody: document.getElementById("historyBody"),
    bornesBadge: document.getElementById("bornesBadge"),
    menuBtn: document.getElementById("menuBtn"),
    configModal: document.getElementById("configModal"),
    configClose: document.getElementById("configClose"),
    configSave: document.getElementById("configSave"),
    ghRepo: document.getElementById("ghRepo"),
    ghToken: document.getElementById("ghToken"),
    syncPushBtn: document.getElementById("syncPushBtn"),
    syncPullBtn: document.getElementById("syncPullBtn")
  };

  el.currentDateLabel.textContent = new Date().toLocaleDateString("fr-FR", { weekday: 'short', day: 'numeric', month: 'short' });

  // Paramètres GitHub
  el.menuBtn.onclick = () => {
    const cfg = load(K_GH, { repo: "", token: "" });
    el.ghRepo.value = cfg.repo;
    el.ghToken.value = cfg.token;
    el.configModal.classList.add("is-open");
  };
  el.configClose.onclick = () => el.configModal.classList.remove("is-open");
  el.configSave.onclick = () => {
    localStorage.setItem(K_GH, JSON.stringify({ repo: el.ghRepo.value.trim(), token: el.ghToken.value.trim() }));
    el.configModal.classList.remove("is-open");
    alert("Paramètres enregistrés !");
  };

  // Enregistrement Valeur
  el.entryForm.onsubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(el.valueInput.value);
    if (isNaN(val)) return;
    const day = todayISO();
    const ex = entries.find(x => x.date === day);
    if (ex) ex.value = val; else entries.push({ date: day, value: val });
    el.valueInput.value = "";
    save();
    renderAll();
  };

  window.deleteEntry = function(date) {
    if (!confirm(`Supprimer l'entrée du ${date} ?`)) return;
    entries = entries.filter(x => x.date !== date);
    save();
    renderAll();
  };

  // Sélecteur d'année Heatmap
  el.prevYearBtn.onclick = () => { currentDisplayYear--; renderHeatmap(); };
  el.nextYearBtn.onclick = () => { currentDisplayYear++; renderHeatmap(); };

  // Heatmap Annuelle rigoureuse (1 case = 1 jour de l'année sélectionnée)
  function renderHeatmap() {
    el.yearLabel.textContent = currentDisplayYear;
    el.heatmapGrid.innerHTML = "";

    const start = new Date(currentDisplayYear, 0, 1);
    const end = new Date(currentDisplayYear, 11, 31);

    // Ajustement pour commencer la grille proprement au premier jour de l'année
    let d = new Date(start);
    while (d.getDay() !== 1) { // Aligner sur le Lundi
      d.setDate(d.getDate() - 1);
    }

    const mapData = {};
    entries.forEach(x => { mapData[x.date] = x.value; });

    while (d <= end || d.getDay() !== 1) {
      const iso = d.toISOString().split("T")[0];
      const box = document.createElement("i");
      box.className = "square";

      if (d.getFullYear() === currentDisplayYear) {
        const doneCount = (todoDone[iso] || []).length;
        const hasVal = mapData[iso] !== undefined;

        let level = 0;
        if (doneCount > 0) level = 2;
        if (doneCount >= 2) level = 3;
        if (doneCount >= 3 || hasVal) level = 4;
        if (!doneCount && !hasVal) level = 0;

        box.classList.add(`l${level}`);
        box.title = `${iso} — ${doneCount} tâches / Val: ${hasVal ? mapData[iso] : 'aucune'}`;
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
    const sorted = [...entries].sort((a,b) => a.date.localeCompare(b.date));

    if (sorted.length < 2) {
      el.chartEmpty.style.display = "flex";
      return;
    }
    el.chartEmpty.style.display = "none";

    const W = 600, H = 160, pad = 20;
    const vals = sorted.map(x => x.value);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = min === max ? 1 : max - min;

    const pts = sorted.map((x, i) => {
      const cx = pad + (i / (sorted.length - 1)) * (W - pad * 2);
      const cy = pad + (1 - (x.value - min) / span) * (H - pad * 2);
      return [cx, cy];
    });

    const ns = "http://www.w3.org/2000/svg";
    const pathD = `M ${pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ")}`;
    const areaD = `${pathD} L ${pts[pts.length-1][0]} ${H - 5} L ${pts[0][0]} ${H - 5} Z`;

    const grad = document.createElementNS(ns, "linearGradient");
    grad.id = "cg"; grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
    grad.innerHTML = `<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>`;
    svg.appendChild(grad);

    const pathArea = document.createElementNS(ns, "path");
    pathArea.setAttribute("d", areaD); pathArea.setAttribute("fill", "url(#cg)");
    svg.appendChild(pathArea);

    const pathLine = document.createElementNS(ns, "path");
    pathLine.setAttribute("d", pathD); pathLine.setAttribute("fill", "none");
    pathLine.setAttribute("stroke", "var(--accent)"); pathLine.setAttribute("stroke-width", "2.5");
    svg.appendChild(pathLine);

    const last = pts[pts.length - 1];
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", last[0]); dot.setAttribute("cy", last[1]);
    dot.setAttribute("r", "4"); dot.setAttribute("fill", "var(--accent)");
    svg.appendChild(dot);
  }

  // To-Do / Routine
  el.todoForm.onsubmit = (e) => {
    e.preventDefault();
    const text = el.todoInput.value.trim();
    if (!text) return;
    todos.push({ id: "t_" + Date.now(), text });
    el.todoInput.value = "";
    save();
    renderTodos();
  };

  window.deleteTodo = function(id) {
    todos = todos.filter(t => t.id !== id);
    save();
    renderTodos();
  };

  window.toggleTodo = function(id) {
    const day = todayISO();
    if (!todoDone[day]) todoDone[day] = [];
    const idx = todoDone[day].indexOf(id);
    if (idx > -1) {
      todoDone[day].splice(idx, 1);
      bornes = Math.max(0, bornes - 10);
    } else {
      todoDone[day].push(id);
      bornes += 10;
    }
    save();
    renderTodos();
    renderHeatmap();
  };

  function renderTodos() {
    el.todoList.innerHTML = "";
    const day = todayISO();
    const doneToday = todoDone[day] || [];

    if (todos.length === 0) {
      el.todoList.innerHTML = `<li style="text-align:center; color: var(--text-dim); padding: 8px;">Aucune routine.</li>`;
      el.todoProgressText.textContent = "0/0";
      el.bornesBadge.textContent = `${bornes} bornes`;
      return;
    }

    todos.forEach(t => {
      const isDone = doneToday.includes(t.id);
      const li = document.createElement("li");
      li.className = `todo-row ${isDone ? "is-done" : ""}`;
      li.innerHTML = `
        <div class="todo-left" onclick="window.toggleTodo('${t.id}')">
          <div class="todo-box">${isDone ? "✓" : ""}</div>
          <span class="todo-text">${t.text}</span>
        </div>
        <button class="btn-del" onclick="window.deleteTodo('${t.id}')">✕</button>
      `;
      el.todoList.appendChild(li);
    });

    el.todoProgressText.textContent = `${doneToday.length}/${todos.length}`;
    el.bornesBadge.textContent = `${bornes} bornes`;
  }

  // Historique Table
  function renderHistory() {
    el.historyBody.innerHTML = "";
    const sorted = [...entries].sort((a,b) => b.date.localeCompare(a.date));
    if (sorted.length === 0) {
      el.historyBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: var(--text-dim);">Vide.</td></tr>`;
      return;
    }
    sorted.forEach(x => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${x.date}</td><td><strong>${x.value}</strong></td><td style="text-align:right;"><button class="btn btn-ghost" style="padding:2px 8px;font-size:0.75rem;color:var(--danger);" onclick="deleteEntry('${x.date}')">Supprimer</button></td>`;
      el.historyBody.appendChild(tr);
    });
  }

  // Sync GitHub
  el.syncPushBtn.onclick = async () => {
    const cfg = load(K_GH, { repo: "", token: "" });
    if (!cfg.repo || !cfg.token) { alert("Configurez les accès GitHub dans l'engrenage !"); return; }
    const url = `https://api.github.com/repos/${cfg.repo}/contents/horizon-data.json`;
    const payload = { entries, todos, todoDone, bornes };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
    
    try {
      el.syncPushBtn.textContent = "Envoi...";
      let sha = null;
      const resGet = await fetch(url, { headers: { "Authorization": `token ${cfg.token}` } });
      if (resGet.ok) sha = (await resGet.json()).sha;

      const body = { message: "Sync Horizon", content: b64 };
      if (sha) body.sha = sha;

      const resPut = await fetch(url, {
        method: "PUT",
        headers: { "Authorization": `token ${cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (resPut.ok) alert("Push réussi !"); else alert("Erreur lors du push.");
    } catch(e) { alert("Erreur réseau : " + e.message); }
    finally { el.syncPushBtn.textContent = "Mettre à jour GitHub"; }
  };

  el.syncPullBtn.onclick = async () => {
    const cfg = load(K_GH, { repo: "", token: "" });
    if (!cfg.repo || !cfg.token) { alert("Configurez les accès GitHub !"); return; }
    const url = `https://api.github.com/repos/${cfg.repo}/contents/horizon-data.json`;
    try {
      el.syncPullBtn.textContent = "Chargement...";
      const res = await fetch(url, { headers: { "Authorization": `token ${cfg.token}` } });
      if (!res.ok) { alert("Fichier distant introuvable."); return; }
      const data = await res.json();
      const parsed = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\s/g, '')))));
      if (parsed.entries) entries = parsed.entries;
      if (parsed.todos) todos = parsed.todos;
      if (parsed.todoDone) todoDone = parsed.todoDone;
      if (parsed.bornes !== undefined) bornes = parsed.bornes;
      save(); renderAll();
      alert("Pull réussi !");
    } catch(e) { alert("Erreur : " + e.message); }
    finally { el.syncPullBtn.textContent = "Récupérer GitHub"; }
  };

  function renderAll() {
    renderTodos();
    renderHeatmap();
    renderTrend();
    renderHistory();
  }

  renderAll();
})();
