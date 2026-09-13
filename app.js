(function () {
  "use strict";

  const STORAGE_ENTRIES = "horizon-entries-v3";
  const STORAGE_TODOS = "horizon-todos-v3";
  const STORAGE_DONE = "horizon-todo-done-v3";
  const STORAGE_BORNES = "horizon-bornes-v3";
  const GH_CONFIG_KEY = "horizon-gh-config-v3";

  let entries = loadJSON(STORAGE_ENTRIES, []);
  // Liste des tâches récurrente (restent chaque jour par défaut)
  let todos = loadJSON(STORAGE_TODOS, [
    { id: "1", text: "Boire 1.5L d'eau" },
    { id: "2", text: "30 minutes de lecture / code" },
    { id: "3", text: "Activité physique" }
  ]);
  // Stocke les tâches cochées par jour format "YYYY-MM-DD": ["id1", "id2"]
  let todoDone = loadJSON(STORAGE_DONE, {});
  let bornes = parseInt(localStorage.getItem(STORAGE_BORNES) || "0", 10);

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function saveData() {
    localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(entries));
    localStorage.setItem(STORAGE_TODOS, JSON.stringify(todos));
    localStorage.setItem(STORAGE_DONE, JSON.stringify(todoDone));
    localStorage.setItem(STORAGE_BORNES, bornes.toString());
  }

  const todayISO = () => new Date().toISOString().split("T")[0];

  // DOM Elements
  const el = {
    entryForm: document.getElementById("entryForm"),
    valueInput: document.getElementById("valueInput"),
    historyBody: document.getElementById("historyBody"),
    heatmap: document.getElementById("heatmap"),
    todoList: document.getElementById("todoList"),
    todoForm: document.getElementById("todoForm"),
    todoInput: document.getElementById("todoInput"),
    todoProgressText: document.getElementById("todoProgressText"),
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

  // Configuration Modal GitHub
  el.menuBtn.onclick = () => {
    const cfg = getGhConfig();
    el.ghRepo.value = cfg.repo;
    el.ghToken.value = cfg.token;
    el.configModal.classList.add("is-open");
  };
  el.configClose.onclick = () => el.configModal.classList.remove("is-open");
  el.configSave.onclick = () => {
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify({
      repo: el.ghRepo.value.trim(),
      token: el.ghToken.value.trim()
    }));
    el.configModal.classList.remove("is-open");
    alert("Configuration sauvegardée !");
  };

  function getGhConfig() {
    try { return JSON.parse(localStorage.getItem(GH_CONFIG_KEY)) || { repo: "", token: "" }; }
    catch { return { repo: "", token: "" }; }
  }

  // Enregistrement Valeur Jour
  el.entryForm.onsubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(el.valueInput.value);
    if (isNaN(val)) return;

    const currentDay = todayISO();
    const existing = entries.find(en => en.date === currentDay);
    if (existing) {
      existing.value = val;
    } else {
      entries.push({ date: currentDay, value: val });
    }

    saveData();
    el.valueInput.value = "";
    render();
  };

  window.deleteEntry = function (date) {
    if (!confirm(`Supprimer l'entrée du ${date} ?`)) return;
    entries = entries.filter(en => en.date !== date);
    saveData();
    render();
  };

  // Gestion des tâches récurrentes & To-Do
  el.todoForm.onsubmit = (e) => {
    e.preventDefault();
    const text = el.todoInput.value.trim();
    if (!text) return;

    todos.push({ id: "t_" + Date.now(), text });
    el.todoInput.value = "";
    saveData();
    renderTodos();
  };

  window.deleteTodoTemplate = function (id) {
    todos = todos.filter(t => t.id !== id);
    saveData();
    renderTodos();
  };

  function toggleTodo(id) {
    const day = todayISO();
    if (!todoDone[day]) todoDone[day] = [];
    
    const idx = todoDone[day].indexOf(id);
    if (idx > -1) {
      // Décocher (retire des bornes)
      todoDone[day].splice(idx, 1);
      bornes = Math.max(0, bornes - 10);
    } else {
      // Cocher (gagne des bornes inutiles)
      todoDone[day].push(id);
      bornes += 10;
    }
    saveData();
    renderTodos();
    renderHeatmap(); // Met à jour l'activité visuelle en temps réel
  }

  function renderTodos() {
    el.todoList.innerHTML = "";
    const day = todayISO();
    const completedToday = todoDone[day] || [];

    if (todos.length === 0) {
      el.todoList.innerHTML = `<li style="text-align:center; color: var(--text-muted); padding: 10px;">Aucune routine active.</li>`;
      el.todoProgressText.textContent = `0 / 0`;
      el.bornesBadge.textContent = `${bornes} bornes`;
      return;
    }

    todos.forEach(t => {
      const isDone = completedToday.includes(t.id);
      const li = document.createElement("li");
      li.className = `todo-item ${isDone ? "is-completed" : ""}`;
      
      li.innerHTML = `
        <div class="todo-left" onclick="window.toggleTodoItem('${t.id}')">
          <div class="todo-checkbox">${isDone ? "✓" : ""}</div>
          <span class="todo-text">${t.text}</span>
        </div>
        <button class="btn btn-danger" onclick="window.deleteTodoTemplate('${t.id}')">✕</button>
      `;
      el.todoList.appendChild(li);
    });

    el.todoProgressText.textContent = `${completedToday.length} / ${todos.length}`;
    el.bornesBadge.textContent = `${bornes} bornes`;
  }
  window.toggleTodoItem = toggleTodo;

  // Heatmap GitHub (basée sur les tâches validées par jour ou valeurs)
  function renderHeatmap() {
    el.heatmap.innerHTML = "";
    const today = new Date();

    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      
      const box = document.createElement("div");
      box.className = "heat-box";

      const doneCount = (todoDone[iso] || []).length;
      const hasEntry = entries.some(en => en.date === iso);

      let level = 0;
      if (doneCount > 0) level = 2;
      if (doneCount >= 3) level = 4;
      if (hasEntry && level < 3) level = 3;

      box.classList.add(`level-${level}`);
      box.title = `${iso}: ${doneCount} tâches accomplies`;
      el.heatmap.appendChild(box);
    }
  }

  // Historique Table
  function renderHistory() {
    el.historyBody.innerHTML = "";
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    
    if (sorted.length === 0) {
      el.historyBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Aucune entrée enregistrée.</td></tr>`;
      return;
    }

    sorted.forEach(en => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${en.date}</td>
        <td><strong>${en.value}</strong></td>
        <td style="text-align: right;"><button class="btn btn-danger" onclick="deleteEntry('${en.date}')">Supprimer</button></td>
      `;
      el.historyBody.appendChild(tr);
    });
  }

  // Synchronisation GitHub Push & Pull
  el.syncPushBtn.onclick = async () => {
    const cfg = getGhConfig();
    if (!cfg.repo || !cfg.token) { alert("Veuillez configurer GitHub dans l'engrenage (⚙️) !"); return; }

    const path = "horizon-data.json";
    const url = `https://api.github.com/repos/${cfg.repo}/contents/${path}`;
    
    const payload = { entries, todos, todoDone, bornes };
    const contentB64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));

    try {
      el.syncPushBtn.textContent = "⏳ Envoi...";
      let sha = null;
      const getRes = await fetch(url, { headers: { "Authorization": `token ${cfg.token}` } });
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
      }

      const body = { message: "Mise à jour des données Horizon", content: contentB64 };
      if (sha) body.sha = sha;

      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Authorization": `token ${cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (putRes.ok) alert("Push GitHub réussi avec succès !");
      else {
        const err = await putRes.json();
        alert("Erreur GitHub : " + (err.message || putRes.statusText));
      }
    } catch (e) {
      alert("Erreur réseau : " + e.message);
    } finally {
      el.syncPushBtn.textContent = "☁️ Push GitHub";
    }
  };

  el.syncPullBtn.onclick = async () => {
    const cfg = getGhConfig();
    if (!cfg.repo || !cfg.token) { alert("Veuillez configurer GitHub d'abord !"); return; }

    const url = `https://api.github.com/repos/${cfg.repo}/contents/horizon-data.json`;
    try {
      el.syncPullBtn.textContent = "⏳ Chargement...";
      const res = await fetch(url, { headers: { "Authorization": `token ${cfg.token}` } });
      if (!res.ok) { alert("Fichier introuvable sur le dépôt distant."); return; }

      const data = await res.json();
      const jsonStr = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
      const parsed = JSON.parse(jsonStr);

      if (parsed.entries) entries = parsed.entries;
      if (parsed.todos) todos = parsed.todos;
      if (parsed.todoDone) todoDone = parsed.todoDone;
      if (parsed.bornes !== undefined) bornes = parsed.bornes;

      saveData();
      render();
      alert("Pull GitHub réussi !");
    } catch (e) {
      alert("Erreur lors du pull : " + e.message);
    } finally {
      el.syncPullBtn.textContent = "📥 Pull GitHub";
    }
  };

  function render() {
    renderTodos();
    renderHeatmap();
    renderHistory();
  }

  render();
})();
