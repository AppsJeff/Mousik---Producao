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
  artistas: [],  // [{id, nome}]
  produtores: [], // [{id, nome}]
  autores: [],    // [{id, nome}]
  obras: [],      // [{id, titulo, editora, letra, autores:[{nome,percentual}]}]
  editingTaskId: null,
  editingObraId: null,
  obraAutoresDraft: [],
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

    const roleDoc = await db.collection("roles").doc(user.uid).get();
    state.role = roleDoc.exists ? roleDoc.data().role : "leitor";
    document.getElementById("role-label").textContent =
      state.role === "editor" ? "Editor" : "Leitor";
    updateHeaderButtons();

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
    state.artistas = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome }));
    fillSelect("f-artista", state.artistas.map((a) => a.nome));
    render();
  });
  db.collection("produtores").orderBy("nome").onSnapshot((snap) => {
    state.produtores = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome }));
    fillSelect("f-produtor", state.produtores.map((p) => p.nome));
    render();
  });
  db.collection("autores").orderBy("nome").onSnapshot((snap) => {
    state.autores = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome }));
    fillObraAutorSelect();
    render();
  });
  db.collection("obras").orderBy("titulo").onSnapshot((snap) => {
    state.obras = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    fillObraSelect();
    render();
  });
}

function fillSelect(id, options) {
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = options.map((o) => `<option value="${o}">${o}</option>`).join("");
  if (options.includes(current)) el.value = current;
}

function fillObraSelect() {
  const el = document.getElementById("f-obra");
  const current = el.value;
  el.innerHTML =
    `<option value="">— Obra temporária (digitar abaixo) —</option>` +
    state.obras.map((o) => `<option value="${o.id}">${o.titulo}</option>`).join("");
  if ([...el.options].some((op) => op.value === current)) el.value = current;
}

function fillObraAutorSelect() {
  const el = document.getElementById("o-add-autor-select");
  if (!el) return;
  el.innerHTML = state.autores.map((a) => `<option value="${a.nome}">${a.nome}</option>`).join("");
}

/* ---------------------- NAVEGAÇÃO ---------------------- */

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (!btn) return;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.tab = btn.dataset.tab;
  updateHeaderButtons();
  render();
});

function updateHeaderButtons() {
  document.getElementById("new-task-btn").classList.toggle(
    "hidden",
    !(state.tab === "tarefas" && state.role === "editor")
  );
  document.getElementById("new-obra-btn").classList.toggle(
    "hidden",
    !(state.tab === "obras" && state.role === "editor")
  );
}

const TAB_META = {
  tarefas: { eyebrow: "Tarefas", title: "Tarefas em produção" },
  cronograma: { eyebrow: "Cronograma", title: "Cronograma de entregas" },
  calendario: { eyebrow: "Calendário", title: "Calendário de entregas" },
  artistas: { eyebrow: "Artistas", title: "Artistas" },
  produtores: { eyebrow: "Produtores", title: "Produtores" },
  autores: { eyebrow: "Autores", title: "Autores" },
  obras: { eyebrow: "Obras", title: "Obras" },
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
  if (state.tab === "artistas") content.innerHTML = renderPessoas("artista", state.artistas, "artistas");
  if (state.tab === "produtores") content.innerHTML = renderPessoas("produtor", state.produtores, "produtores");
  if (state.tab === "autores") content.innerHTML = renderPessoas(null, state.autores, "autores");
  if (state.tab === "obras") content.innerHTML = renderObras();

  attachDynamicListeners();
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

function isAtrasada(entry) {
  if (!entry || entry.confirmada || !entry.data) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataEntrega = new Date(entry.data + "T00:00:00");
  return dataEntrega < hoje;
}

function obraLabel(t) {
  if (t.obraId) {
    const obra = state.obras.find((o) => o.id === t.obraId);
    return obra ? obra.titulo : (t.obraNome || "—");
  }
  return t.obraNome ? `${t.obraNome} (temporária)` : "—";
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
        <p class="task-sub">${t.artista || "Sem artista vinculado"} · Obra: ${obraLabel(t)}</p>
      </div>
      <span class="pill" style="color:#8C8C88;border:1px solid #8C8C8855;background:#8C8C8814">${t.tipo}</span>
      <span style="font-size:12px;color:#8C8C88">${t.produtor}</span>
      <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      <div>
        <span class="date-badge-label">Entrega mixagem</span>
        <span class="date-badge-value ${isAtrasada(t.mixagem) ? "pending" : ""}" data-task="${t.id}" data-field="mixagem">${fmt(t.mixagem.data)}</span>
      </div>
      <div>
        <span class="date-badge-label">Entrega master</span>
        <span class="date-badge-value ${isAtrasada(t.master) ? "pending" : ""}" data-task="${t.id}" data-field="master">${fmt(t.master.data)}</span>
      </div>
      <div class="row-actions">
        ${state.role === "editor" ? `
          <button class="task-edit-btn" data-edit-task="${t.id}">Editar</button>
          <button class="task-edit-btn danger" data-del-task="${t.id}">Excluir</button>
        ` : ""}
      </div>
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

  return `<div class="timeline">${events.map((e) => {
    const atrasada = isAtrasada(e);
    const cor = e.confirmada ? "#9FE870" : atrasada ? "#E5544C" : "#8C8C88";
    const statusTxt = e.confirmada ? "Confirmada" : atrasada ? "Atrasada" : "Pendente";
    return `
    <div class="timeline-item">
      <div class="timeline-dot" style="background:${cor}"></div>
      <div class="timeline-date">${fmt(e.data)}</div>
      <div class="timeline-card" style="border-color:${atrasada ? "#E5544C55" : "#262626"}">
        <div>
          <p style="margin:0;font-size:13px">${e.titulo}</p>
          <p style="margin:3px 0 0;font-size:11px;color:#8C8C88">Entrega de ${e.tipo}</p>
        </div>
        <span class="pill" style="color:${cor};border:1px solid ${cor}55;background:${cor}14">
          ${statusTxt}
        </span>
      </div>
    </div>
  `;
  }).join("")}</div>`;
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
      ${items.map((e) => `<p class="cal-event" style="color:${e.confirmada ? "#9FE870" : (isAtrasada(e) ? "#E5544C" : "#8C8C88")}">● ${e.tipo}</p>`).join("")}
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

/* ---------------------- ARTISTAS / PRODUTORES / AUTORES ---------------------- */

function renderPessoas(taskField, people, collection) {
  const label = { artistas: "artista", produtores: "produtor", autores: "autor" }[collection];
  const addRow = state.role === "editor"
    ? `<div class="people-add">
        <input id="new-person-input" data-collection="${collection}" placeholder="Nome do novo ${label}" />
        <button class="btn-primary" id="new-person-btn" data-collection="${collection}" style="white-space:nowrap">+ Adicionar</button>
      </div>`
    : "";

  if (people.length === 0) {
    return `${addRow}<div class="empty-state"><p>Ninguém cadastrado ainda</p>
      <p style="font-size:11px">${state.role === "editor" ? "Use o campo acima para adicionar." : "Volte em breve."}</p></div>`;
  }

  const cards = people.map((p) => {
    const name = p.nome;
    const related = taskField ? state.tasks.filter((t) => t[taskField] === name) : [];
    const obrasDoAutor = collection === "autores"
      ? state.obras.filter((o) => (o.autores || []).some((a) => a.nome === name))
      : [];
    return `<div class="people-card">
      <div class="people-card-header">
        <p style="margin:0;font-size:14px">${name}</p>
        ${state.role === "editor" ? `
          <div class="row-actions">
            <button class="task-edit-btn" data-edit-person="${p.id}" data-collection="${collection}">Editar</button>
            <button class="task-edit-btn danger" data-del-person="${p.id}" data-collection="${collection}">Excluir</button>
          </div>` : ""}
      </div>
      ${taskField && related.length === 0 ? `<p style="font-size:11px;color:#8C8C88">Nenhuma tarefa no momento</p>` : ""}
      ${related.map((t) => `<div class="people-task-row">
        <span>${t.titulo}</span>
        <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      </div>`).join("")}
      ${collection === "autores" ? (
        obrasDoAutor.length === 0
          ? `<p style="font-size:11px;color:#8C8C88">Nenhuma obra vinculada</p>`
          : obrasDoAutor.map((o) => {
              const pct = (o.autores.find((a) => a.nome === name) || {}).percentual ?? 0;
              return `<div class="people-task-row"><span>${o.titulo}</span><span class="pill" style="color:#E8C468;border:1px solid #E8C46855;background:#E8C46814">${pct}%</span></div>`;
            }).join("")
      ) : ""}
    </div>`;
  }).join("");

  return `${addRow}<div class="people-grid">${cards}</div>`;
}

/* ---------------------- OBRAS ---------------------- */

function renderObras() {
  if (state.obras.length === 0) {
    return `<div class="empty-state"><p>Nenhuma obra cadastrada ainda</p>
      <p style="font-size:11px">${state.role === "editor" ? 'Use o botão "Nova Obra" para começar.' : "Volte em breve."}</p></div>`;
  }
  return `<div class="people-grid">${state.obras.map((o) => {
    const autoresTxt = (o.autores || []).map((a) => `${a.nome} (${a.percentual}%)`).join(", ") || "—";
    const tarefasVinculadas = state.tasks.filter((t) => t.obraId === o.id);
    return `<div class="people-card">
      <div class="people-card-header">
        <p style="margin:0;font-size:14px">${o.titulo}</p>
        ${state.role === "editor" ? `
          <div class="row-actions">
            <button class="task-edit-btn" data-edit-obra="${o.id}">Editar</button>
            <button class="task-edit-btn danger" data-del-obra="${o.id}">Excluir</button>
          </div>` : ""}
      </div>
      <p class="obra-meta">Autores: ${autoresTxt}</p>
      <p class="obra-meta">Editora: ${o.editora || "—"}</p>
      ${tarefasVinculadas.length > 0 ? tarefasVinculadas.map((t) => `<div class="people-task-row">
        <span>${t.titulo}</span>
        <span class="pill" style="color:${STATUS_COLOR[t.status]};border:1px solid ${STATUS_COLOR[t.status]}55;background:${STATUS_COLOR[t.status]}14">${t.status}</span>
      </div>`).join("") : `<p style="font-size:11px;color:#8C8C88;margin-top:6px">Nenhuma tarefa vinculada</p>`}
    </div>`;
  }).join("")}</div>`;
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

  document.querySelectorAll("[data-edit-task]").forEach((btn) => {
    btn.addEventListener("click", () => openTaskModal(btn.dataset.editTask));
  });
  document.querySelectorAll("[data-del-task]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Excluir esta tarefa? Essa ação não pode ser desfeita.")) {
        db.collection("tasks").doc(btn.dataset.delTask).delete();
      }
    });
  });

  document.querySelectorAll("[data-edit-obra]").forEach((btn) => {
    btn.addEventListener("click", () => openObraModal(btn.dataset.editObra));
  });
  document.querySelectorAll("[data-del-obra]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Excluir esta obra? As tarefas vinculadas a ela ficarão sem obra.")) {
        db.collection("obras").doc(btn.dataset.delObra).delete();
      }
    });
  });

  document.querySelectorAll("[data-edit-person]").forEach((btn) => {
    btn.addEventListener("click", () => editPerson(btn.dataset.editPerson, btn.dataset.collection));
  });
  document.querySelectorAll("[data-del-person]").forEach((btn) => {
    btn.addEventListener("click", () => deletePerson(btn.dataset.delPerson, btn.dataset.collection));
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
      db.collection(addBtn.dataset.collection).add({ nome: name });
      input.value = "";
    });
  }
}

/* ---------------------- EDITAR / EXCLUIR ARTISTA, PRODUTOR, AUTOR ---------------------- */
/* Ao renomear, atualiza também as referências existentes em tarefas e obras */

const TASK_FIELD_BY_COLLECTION = { artistas: "artista", produtores: "produtor" };

function editPerson(id, collection) {
  const list = state[collection];
  const person = list.find((p) => p.id === id);
  if (!person) return;
  const novoNome = prompt("Novo nome:", person.nome);
  if (!novoNome || !novoNome.trim() || novoNome.trim() === person.nome) return;
  const nomeAntigo = person.nome;
  const nomeNovo = novoNome.trim();

  const batch = db.batch();
  batch.update(db.collection(collection).doc(id), { nome: nomeNovo });

  if (collection === "artistas" || collection === "produtores") {
    const field = TASK_FIELD_BY_COLLECTION[collection];
    state.tasks.filter((t) => t[field] === nomeAntigo).forEach((t) => {
      batch.update(db.collection("tasks").doc(t.id), { [field]: nomeNovo });
    });
  }

  if (collection === "autores") {
    state.obras.filter((o) => (o.autores || []).some((a) => a.nome === nomeAntigo)).forEach((o) => {
      const novosAutores = o.autores.map((a) => a.nome === nomeAntigo ? { ...a, nome: nomeNovo } : a);
      batch.update(db.collection("obras").doc(o.id), { autores: novosAutores });
    });
  }

  batch.commit();
}

function deletePerson(id, collection) {
  const list = state[collection];
  const person = list.find((p) => p.id === id);
  if (!person) return;

  let emUso = false;
  if (collection === "artistas") emUso = state.tasks.some((t) => t.artista === person.nome);
  if (collection === "produtores") emUso = state.tasks.some((t) => t.produtor === person.nome);
  if (collection === "autores") emUso = state.obras.some((o) => (o.autores || []).some((a) => a.nome === person.nome));

  const aviso = emUso
    ? " Ele(a) está vinculado(a) a tarefas ou obras existentes, que manterão o nome mesmo após a exclusão."
    : "";
  if (confirm(`Excluir "${person.nome}"?${aviso}`)) {
    db.collection(collection).doc(id).delete();
  }
}

/* ---------------------- MODAL: NOVA/EDITAR TAREFA ---------------------- */

const taskModal = document.getElementById("task-modal");

function openTaskModal(taskId) {
  state.editingTaskId = taskId || null;
  const task = taskId ? state.tasks.find((t) => t.id === taskId) : null;

  document.getElementById("task-modal-title").textContent = task ? "Editar Tarefa" : "Nova Tarefa";
  document.getElementById("save-task-btn").textContent = task ? "Salvar alterações" : "Salvar tarefa";

  fillSelect("f-artista", state.artistas.map((a) => a.nome));
  fillSelect("f-produtor", state.produtores.map((p) => p.nome));
  fillObraSelect();

  document.getElementById("f-titulo").value = task ? task.titulo : "";
  document.getElementById("f-tipo").value = task ? task.tipo : "Single";
  document.getElementById("f-artista-wrap").classList.toggle("hidden", task ? task.tipo === "Composição" : false);
  if (task && task.artista) document.getElementById("f-artista").value = task.artista;
  if (task && task.produtor) document.getElementById("f-produtor").value = task.produtor;
  document.getElementById("f-status").value = task ? task.status : "Composição";

  document.getElementById("f-obra").value = task && task.obraId ? task.obraId : "";
  document.getElementById("f-obra-temp").value = task && !task.obraId ? (task.obraNome || "") : "";

  document.getElementById("f-mix-data").value = task ? task.mixagem.data || "" : "";
  document.getElementById("f-mix-conf").checked = task ? !!task.mixagem.confirmada : false;
  document.getElementById("f-master-data").value = task ? task.master.data || "" : "";
  document.getElementById("f-master-conf").checked = task ? !!task.master.confirmada : false;

  taskModal.classList.remove("hidden");
}

document.getElementById("new-task-btn").addEventListener("click", () => openTaskModal(null));
document.getElementById("close-modal-btn").addEventListener("click", () => taskModal.classList.add("hidden"));

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
  const obraId = document.getElementById("f-obra").value || null;
  const obraTemp = document.getElementById("f-obra-temp").value.trim();
  const mixData = document.getElementById("f-mix-data").value;
  const mixConf = document.getElementById("f-mix-conf").checked;
  const masterData = document.getElementById("f-master-data").value;
  const masterConf = document.getElementById("f-master-conf").checked;

  if (!titulo) { alert("Preencha o título da tarefa."); return; }
  if (tipo !== "Composição" && !artista) { alert("Selecione ou cadastre um artista."); return; }
  if (!produtor) { alert("Selecione ou cadastre um produtor."); return; }
  if (!obraId && !obraTemp) { alert("Selecione uma obra cadastrada ou digite um nome temporário."); return; }

  const obraNome = obraId
    ? (state.obras.find((o) => o.id === obraId) || {}).titulo || ""
    : obraTemp;

  const payload = {
    titulo, tipo, artista, produtor, status,
    obraId, obraNome,
    mixagem: { data: mixData, confirmada: mixConf },
    master: { data: masterData, confirmada: masterConf },
  };

  if (state.editingTaskId) {
    db.collection("tasks").doc(state.editingTaskId).update(payload);
  } else {
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection("tasks").add(payload);
  }

  taskModal.classList.add("hidden");
  state.editingTaskId = null;
});

/* ---------------------- MODAL: NOVA/EDITAR OBRA ---------------------- */

const obraModal = document.getElementById("obra-modal");

function openObraModal(obraId) {
  state.editingObraId = obraId || null;
  const obra = obraId ? state.obras.find((o) => o.id === obraId) : null;

  document.getElementById("obra-modal-title").textContent = obra ? "Editar Obra" : "Nova Obra";
  document.getElementById("save-obra-btn").textContent = obra ? "Salvar alterações" : "Salvar obra";

  document.getElementById("o-titulo").value = obra ? obra.titulo : "";
  document.getElementById("o-editora").value = obra ? obra.editora || "" : "";
  document.getElementById("o-letra").value = obra ? obra.letra || "" : "";

  state.obraAutoresDraft = obra ? JSON.parse(JSON.stringify(obra.autores || [])) : [];
  fillObraAutorSelect();
  renderObraAutoresDraft();

  obraModal.classList.remove("hidden");
}

document.getElementById("new-obra-btn").addEventListener("click", () => openObraModal(null));
document.getElementById("close-obra-modal-btn").addEventListener("click", () => obraModal.classList.add("hidden"));

function renderObraAutoresDraft() {
  const list = document.getElementById("o-autores-list");
  list.innerHTML = state.obraAutoresDraft.map((a, i) => `
    <div class="autor-row">
      <span>${a.nome}</span>
      <input type="number" min="0" max="100" value="${a.percentual}" data-autor-idx="${i}" />
      <span>%</span>
      <button type="button" data-remove-autor="${i}">✕</button>
    </div>
  `).join("");

  list.querySelectorAll("input[data-autor-idx]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.autorIdx);
      state.obraAutoresDraft[idx].percentual = Number(e.target.value) || 0;
      updateObraTotalLabel();
    });
  });
  list.querySelectorAll("[data-remove-autor]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.removeAutor);
      state.obraAutoresDraft.splice(idx, 1);
      renderObraAutoresDraft();
      updateObraTotalLabel();
    });
  });

  updateObraTotalLabel();
}

function updateObraTotalLabel() {
  const total = state.obraAutoresDraft.reduce((s, a) => s + (a.percentual || 0), 0);
  const label = document.getElementById("o-total-label");
  label.textContent = `Total: ${total}%`;
  label.className = "field-hint " + (total === 100 ? "ok" : "warn");
}

document.getElementById("o-add-autor-btn").addEventListener("click", () => {
  const select = document.getElementById("o-add-autor-select");
  const nome = select.value;
  if (!nome) { alert("Cadastre um autor na aba Autores primeiro."); return; }
  if (state.obraAutoresDraft.some((a) => a.nome === nome)) { alert("Esse autor já foi adicionado."); return; }
  state.obraAutoresDraft.push({ nome, percentual: 0 });
  renderObraAutoresDraft();
});

document.getElementById("save-obra-btn").addEventListener("click", () => {
  const titulo = document.getElementById("o-titulo").value.trim();
  const editora = document.getElementById("o-editora").value.trim();
  const letra = document.getElementById("o-letra").value.trim();
  const autores = state.obraAutoresDraft;

  if (!titulo) { alert("Preencha o título da obra."); return; }
  if (autores.length === 0) { alert("Adicione ao menos um autor."); return; }
  const total = autores.reduce((s, a) => s + (a.percentual || 0), 0);
  if (total !== 100) { alert(`Os percentuais precisam somar 100%. Atualmente somam ${total}%.`); return; }

  const payload = { titulo, editora, letra, autores };

  if (state.editingObraId) {
    db.collection("obras").doc(state.editingObraId).update(payload);
  } else {
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    db.collection("obras").add(payload);
  }

  obraModal.classList.add("hidden");
  state.editingObraId = null;
});
