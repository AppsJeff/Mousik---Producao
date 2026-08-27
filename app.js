/* ==========================================================
   MOUSIK — Central de Produção
   ========================================================== */

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const STATUS_COLOR = {
  "Composição": "#8C8C88",
  "Produção": "#E8C468",
  "Mixagem": "#7FB8E8",
  "Masterização": "#9FE870",
  "Recall": "#E5544C",
};

let state = {
  role: "leitor",
  tab: "tarefas",
  tasks: [],
  artistas: [],
  produtores: [],
};

/* ---------------------- AUTENTICAÇÃO ---------------------- */

document.getElementById("login-btn").addEventListener("click", () => {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  auth.signInWithEmailAndPassword(email, pass).catch((err) => {
    errEl.textContent = "E-mail ou senha inválidos.";
    console.error(err);
  });
});

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(async (user) => {
  if (user) {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("user-email").textContent = user.email;

    // Busca o papel (editor/leitor) do usuário na coleção "roles"
    const roleDoc = await db.collection("roles").doc(user.uid).get();
    state.role = roleDoc.exists ? roleDoc.data().role : "leitor";
    document.getElementById("role-label").textContent =
      state.role === "editor" ? "Editor" : "Leitor";
    document.getElementById("new-task-btn").classList.toggle("hidden", state.role !== "editor");

    listenToData();
  } else {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
});

/* ---------------------- FIRESTORE LISTENERS ---------------------- */

function listenToData() {
  db.collection("tasks").orderBy("createdAt", "desc").onSnapshot((snap) => {
    state.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  db.collection("artistas").orderBy("nome").onSnapshot((snap) => {
    state.artistas = snap.docs.map((d) => d.data().nome);
    fillSelect("f-artista", state.artistas);
    render();
  });
  db.collection("produtores").orderBy("nome").onSnapshot((snap) => {
    state.produtores = snap.docs.map((d) => d.data().nome);
    fillSelect("f-produtor", state.produtores);
    render();
  });
}

function fillSelect(id, options) {
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = options.map((o) => `<option value="${o}">${o}</option>`).join("");
  if (options.includes(current)) el.value = current;
}

/* ---------------------- NAVEGAÇÃO ---------------------- */

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.tab = btn.dataset.tab;
  document.getElementById("new-task-btn").classList.toggle(
    "hidden",
    !(state.tab === "tarefas" && state.role === "editor")
  );
  render();
});

const TAB_META = {
  tarefas: { eyebrow: "Tarefas", title: "Tarefas em produção" },
  cronograma: { eyebrow: "Cronograma", title: "Cronograma de entregas" },
  calendario: { eyebrow: "Calendário", title: "Calendário de entregas" },
  artistas: { eyebrow: "Artistas", title: "Artistas" },
  produtores: { eyebrow: "Produtores", title: "Produtores" },
};

/* ---------------------- RENDER PRINCIPAL ---------------------- */

function render() {
  const meta = TAB_META[state.tab];
  document.getElementById("tab-eyebrow").textContent = meta.eyebrow;
  document.getElementById("tab-title").textContent = meta.title;

  const content = document.getElementById("content");
  if (state.tab === "tarefas") content.innerHTML = renderTarefas();
  if (state.tab === "cronograma") content.innerHTML = renderCronograma();
  if (state.tab === "calendario") content.innerHTML = renderCalendario();
  if (state.tab === "artistas") content.innerHTML = renderPessoas("artista", state.artistas);
  if (state.tab === "produtores") content.innerHTML = renderPessoas("produtor", state.produtores);

  attachDynamicListeners();
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

/* ---------------------- TAREFAS ---------------------- */

function renderTarefas() {
  if (state.tasks.length === 0) {
    return `<div class="empty-state"><p>Nenhuma tarefa cadastrada ainda</p>
      <p style="font-size:11px">${state.role === "editor" ? 'Use o botão "Nova Tarefa" para começar.' : "Assim que houver tarefas, elas aparecem aqui."}</p></div>`;
  }
  return state.tasks.map((t) => `
    <div class="task-card">
      <div>
        <p class="task-title">${t.titulo}</p>
        <p class="task-sub">${t.artista || "Sem artista vinculado"}</p>
      </div>
      <span class="pill" style="color:#8C8C88;border:1px solid #8C8C8855;background:#8C8C8814">${t.tipo}</span>
      <span style="font-size:12px;color:#8C8C88">${t.produtor}</span>
      <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      <div>
        <span class="date-badge-label">Entrega mixagem</span>
        <span class="date-badge-value ${t.mixagem.confirmada ? "" : "pending"}" data-task="${t.id}" data-field="mixagem">${fmt(t.mixagem.data)}</span>
      </div>
      <div>
        <span class="date-badge-label">Entrega master</span>
        <span class="date-badge-value ${t.master.confirmada ? "" : "pending"}" data-task="${t.id}" data-field="master">${fmt(t.master.data)}</span>
      </div>
      <div></div>
    </div>
  `).join("");
}

/* ---------------------- CRONOGRAMA ---------------------- */

function renderCronograma() {
  const events = [];
  state.tasks.forEach((t) => {
    events.push({ titulo: t.titulo, tipo: "Mixagem", ...t.mixagem });
    events.push({ titulo: t.titulo, tipo: "Master", ...t.master });
  });
  events.sort((a, b) => (a.data || "").localeCompare(b.data || ""));

  if (events.length === 0) {
    return `<div class="empty-state"><p>Nenhuma entrega no cronograma</p>
      <p style="font-size:11px">As entregas aparecem aqui assim que houver tarefas cadastradas.</p></div>`;
  }

  return `<div class="timeline">${events.map((e) => `
    <div class="timeline-item">
      <div class="timeline-dot" style="background:${e.confirmada ? "#9FE870" : "#E5544C"}"></div>
      <div class="timeline-date">${fmt(e.data)}</div>
      <div class="timeline-card" style="border-color:${e.confirmada ? "#262626" : "#E5544C55"}">
        <div>
          <p style="margin:0;font-size:13px">${e.titulo}</p>
          <p style="margin:3px 0 0;font-size:11px;color:#8C8C88">Entrega de ${e.tipo}</p>
        </div>
        <span class="pill" style="color:${e.confirmada ? "#9FE870" : "#E5544C"};border:1px solid ${e.confirmada ? "#9FE87055" : "#E5544C55"};background:${e.confirmada ? "#9FE87014" : "#E5544C14"}">
          ${e.confirmada ? "Confirmada" : "Pendente"}
        </span>
      </div>
    </div>
  `).join("")}</div>`;
}

/* ---------------------- CALENDÁRIO ---------------------- */

let calMonthOffset = 0;

function renderCalendario() {
  const base = new Date(2026, 7 + calMonthOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const byDay = {};
  state.tasks.forEach((t) => {
    [{ ...t.mixagem, tipo: "Mixagem", titulo: t.titulo }, { ...t.master, tipo: "Master", titulo: t.titulo }].forEach((e) => {
      if (!e.data) return;
      const d = new Date(e.data);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        byDay[day] = byDay[day] || [];
        byDay[day].push(e);
      }
    });
  });

  let cells = "";
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const items = byDay[d] || [];
    cells += `<div class="cal-cell">
      <div class="cal-day-num">${d}</div>
      ${items.map((e) => `<p class="cal-event" style="color:${e.confirmada ? "#9FE870" : "#E5544C"}">● ${e.tipo}</p>`).join("")}
    </div>`;
  }

  return `
    <div class="cal-header">
      <button class="btn-icon" id="cal-prev">‹</button>
      <p style="text-transform:capitalize;font-size:13px;width:160px">${monthName}</p>
      <button class="btn-icon" id="cal-next">›</button>
    </div>
    <div class="cal-grid" style="margin-bottom:8px">
      ${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
    </div>
    <div class="cal-grid">${cells}</div>
  `;
}

/* ---------------------- ARTISTAS / PRODUTORES ---------------------- */

function renderPessoas(field, names) {
  const addRow = state.role === "editor"
    ? `<div class="people-add">
        <input id="new-person-input" placeholder="Nome do novo ${field}" />
        <button class="btn-primary" id="new-person-btn" style="white-space:nowrap">+ Adicionar</button>
      </div>`
    : "";

  if (names.length === 0) {
    return `${addRow}<div class="empty-state"><p>Ninguém cadastrado ainda</p>
      <p style="font-size:11px">${state.role === "editor" ? "Use o campo acima para adicionar." : "Volte em breve."}</p></div>`;
  }

  const cards = names.map((name) => {
    const related = state.tasks.filter((t) => t[field] === name);
    return `<div class="people-card">
      <div class="people-card-header"><p style="margin:0;font-size:14px">${name}</p></div>
      ${related.length === 0 ? `<p style="font-size:11px;color:#8C8C88">Nenhuma tarefa no momento</p>` : ""}
      ${related.map((t) => `<div class="people-task-row">
        <span>${t.titulo}</span>
        <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      </div>`).join("")}
    </div>`;
  }).join("");

  return `${addRow}<div class="people-grid">${cards}</div>`;
}

/* ---------------------- LISTENERS DINÂMICOS (após cada render) ---------------------- */

function attachDynamicListeners() {
  document.querySelectorAll(".date-badge-value").forEach((el) => {
    el.addEventListener("click", () => {
      if (state.role !== "editor") return;
      const taskId = el.dataset.task;
      const field = el.dataset.field;
      const task = state.tasks.find((t) => t.id === taskId);
      db.collection("tasks").doc(taskId).update({
        [`${field}.confirmada`]: !task[field].confirmada,
      });
    });
  });

  const prevBtn = document.getElementById("cal-prev");
  const nextBtn = document.getElementById("cal-next");
  if (prevBtn) prevBtn.addEventListener("click", () => { calMonthOffset--; render(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { calMonthOffset++; render(); });

  const addBtn = document.getElementById("new-person-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const input = document.getElementById("new-person-input");
      const name = input.value.trim();
      if (!name) return;
      const collection = state.tab === "artistas" ? "artistas" : "produtores";
      db.collection(collection).add({ nome: name });
      input.value = "";
    });
  }
}

/* ---------------------- MODAL: NOVA TAREFA ---------------------- */

const modal = document.getElementById("task-modal");

document.getElementById("new-task-btn").addEventListener("click", () => {
  modal.classList.remove("hidden");
  fillSelect("f-artista", state.artistas);
  fillSelect("f-produtor", state.produtores);
});

document.getElementById("close-modal-btn").addEventListener("click", () => modal.classList.add("hidden"));

document.getElementById("f-tipo").addEventListener("change", (e) => {
  document.getElementById("f-artista-wrap").classList.toggle("hidden", e.target.value === "Composição");
});

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener("click", () => {
    const collection = btn.dataset.add;
    const name = prompt(`Nome do novo ${collection === "artistas" ? "artista" : "produtor"}:`);
    if (name && name.trim()) {
      db.collection(collection).add({ nome: name.trim() });
    }
  });
});

document.getElementById("save-task-btn").addEventListener("click", () => {
  const titulo = document.getElementById("f-titulo").value.trim();
  const tipo = document.getElementById("f-tipo").value;
  const artista = tipo === "Composição" ? null : document.getElementById("f-artista").value;
  const produtor = document.getElementById("f-produtor").value;
  const status = document.getElementById("f-status").value;
  const mixData = document.getElementById("f-mix-data").value;
  const mixConf = document.getElementById("f-mix-conf").checked;
  const masterData = document.getElementById("f-master-data").value;
  const masterConf = document.getElementById("f-master-conf").checked;

  if (!titulo) { alert("Preencha o título da tarefa."); return; }
  if (tipo !== "Composição" && !artista) { alert("Selecione ou cadastre um artista."); return; }
  if (!produtor) { alert("Selecione ou cadastre um produtor."); return; }

  db.collection("tasks").add({
    titulo, tipo, artista, produtor, status,
    mixagem: { data: mixData, confirmada: mixConf },
    master: { data: masterData, confirmada: masterConf },
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // limpa o formulário
  document.getElementById("f-titulo").value = "";
  document.getElementById("f-mix-data").value = "";
  document.getElementById("f-mix-conf").checked = false;
  document.getElementById("f-master-data").value = "";
  document.getElementById("f-master-conf").checked = false;
  modal.classList.add("hidden");
});
