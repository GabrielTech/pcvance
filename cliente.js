"use strict";
const $ = (id) => document.getElementById(id);

// Só cliente entra aqui (administrador é levado ao painel dele)
const user = Auth.requireRole("user");
if (!user) throw new Error("Acesso restrito.");

const ORDERS_KEY = "pcvance_os_v1";
const REQUESTS_KEY = "pcvance_requests_v1";
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
let toastTimer;

function readList(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

function showToast(message, error = false) {
  const t = $("toast");
  t.textContent = message;
  t.classList.toggle("error", error);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

const escapeHTML = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const formatDate = (v) => { if (!v) return "—"; const p = String(v).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; };

function statusClass(s) {
  if (s === "Concluída") return "green";
  if (s === "Aguardando aprovação") return "purple";
  if (s === "Aguardando peça") return "orange";
  if (s === "Sem reparo" || s === "Retirada sem execução") return "red";
  return "blue";
}
const statusBadge = (s) => `<span class="badge ${statusClass(s)}">${escapeHTML(s || "Aberta")}</span>`;

/* ---------- Vínculo OS ↔ cliente (e-mail ou final do WhatsApp) ---------- */
function myOrders() {
  const email = Auth.normEmail(user.email);
  const phone = Auth.normPhone(user.telefone);
  const tail = (s) => Auth.normPhone(s).slice(-9);
  return readList(ORDERS_KEY)
    .filter((o) =>
      (o.email && Auth.normEmail(o.email) === email) ||
      (phone.length >= 9 && tail(o.telefone).length >= 9 && tail(o.telefone) === tail(phone))
    )
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
}

/* ---------- Navegação ---------- */
const titles = { ordens: "Minhas ordens", detalhe: "Detalhes da OS", solicitar: "Solicitar serviço", perfil: "Meu perfil" };

function goTo(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const target = $(`page-${page}`);
  if (!target) return;
  target.classList.add("active");
  document.querySelectorAll(".nav-item[data-page]").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("pageTitle").textContent = titles[page] || "PCVANCE";
  $("sidebar").classList.remove("open");
  if (page === "ordens") renderOrders();
  if (page === "solicitar") renderRequests();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => goTo(b.dataset.page)));
$("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("logoutBtn").addEventListener("click", () => Auth.logout());

/* ---------- Minhas ordens ---------- */
function renderOrders() {
  const orders = myOrders();
  $("cTotal").textContent = orders.length;
  $("cAndamento").textContent = orders.filter((o) => ["Aberta", "Em andamento", "Aguardando peça"].includes(o.status)).length;
  $("cAprovacao").textContent = orders.filter((o) => o.status === "Aguardando aprovação").length;
  $("cConcluidas").textContent = orders.filter((o) => o.status === "Concluída").length;

  $("ordersTable").innerHTML = orders.map((o) => `
    <tr>
      <td class="os-id">${escapeHTML(o.numero)}</td>
      <td>${escapeHTML(o.tipoEquipamento)} · ${escapeHTML(o.marca || "—")}</td>
      <td>${formatDate(o.dataAbertura)}</td>
      <td>${formatDate(o.dataPrevisao)}</td>
      <td>${BRL.format(Number(o.total) || 0)}</td>
      <td>${statusBadge(o.status)}</td>
      <td><button class="icon-btn" data-open="${escapeHTML(o.id)}">Ver</button></td>
    </tr>`).join("");

  $("ordersEmpty").classList.toggle("hidden", orders.length > 0);
  $("ordersTable").closest(".table-wrap").classList.toggle("hidden", orders.length === 0);
}

function stepIndex(status) {
  if (status === "Aberta") return 0;
  if (status === "Aguardando aprovação") return 1;
  if (status === "Aguardando peça" || status === "Em andamento") return 2;
  if (status === "Concluída") return 3;
  return -1;
}

function openOrder(id) {
  const o = myOrders().find((x) => x.id === id); // só abre se for dele
  if (!o) return;

  const idx = stepIndex(o.status);
  const labels = ["Recebida", "Análise / orçamento", "Em execução", "Concluída"];
  const tracker = idx < 0
    ? `<div class="end-note">Atendimento encerrado: ${escapeHTML(o.status)}.</div>`
    : `<div class="tracker">${labels.map((l, i) => `<div class="step ${i < idx || (i === idx && idx === 3) ? "done" : i === idx ? "current" : ""}">${l}</div>`).join("")}</div>`;

  const item = (label, value) => `<div class="detail-item"><span>${label}</span><strong>${escapeHTML(value || "—")}</strong></div>`;
  const block = (title, text) => text ? `<div class="detail-block"><h3>${title}</h3><p>${escapeHTML(text)}</p></div>` : "";

  const items = (o.itens || []);
  const table = items.length ? `
    <div class="detail-block"><h3>Serviços e peças</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th>Qtd.</th><th>Valor unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${items.map((i) => `<tr><td>${escapeHTML(i.nome)}</td><td>${Number(i.qtd) || 1}</td><td>${BRL.format(Number(i.valor) || 0)}</td><td>${BRL.format((Number(i.qtd) || 1) * (Number(i.valor) || 0))}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>` : "";

  $("detTitle").textContent = o.numero;
  $("detSub").textContent = `${o.tipoEquipamento || "Equipamento"}${o.marca ? " · " + o.marca : ""}`;

  // Campos internos (senha, documento, avarias) não são exibidos ao cliente
  $("detailBody").innerHTML = `
    <div class="panel">
      <p style="margin:0 0 10px">${statusBadge(o.status)}</p>
      ${tracker}
      <div class="detail-grid">
        ${item("Abertura", formatDate(o.dataAbertura))}
        ${item("Previsão de entrega", formatDate(o.dataPrevisao))}
        ${item("Técnico responsável", o.tecnico)}
        ${item("Valor total", BRL.format(Number(o.total) || 0))}
        ${item("Orçamento", o.aprovacao)}
        ${item("Forma de pagamento", o.pagamento || "A combinar")}
      </div>
      ${block("Problema relatado", o.problema)}
      ${block("Diagnóstico técnico", o.diagnostico)}
      ${block("Serviços realizados", o.servicosRealizados)}
      ${table}
      ${block("Observações e recomendações", o.observacoesFinais)}
    </div>`;
  goTo("detalhe");
}

document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) openOrder(open.dataset.open);
  const cancel = e.target.closest("[data-cancel]");
  if (cancel && confirm("Cancelar esta solicitação?")) {
    const all = readList(REQUESTS_KEY);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(all.filter((r) => !(r.id === cancel.dataset.cancel && r.userId === user.id && r.status === "Nova"))));
    renderRequests();
    showToast("Solicitação cancelada.");
  }
});

/* ---------- Solicitações ---------- */
function myRequests() {
  return readList(REQUESTS_KEY).filter((r) => r.userId === user.id).sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
}

function requestStatus(r) {
  if (r.status === "Convertida") return `<span class="badge green">Em atendimento · ${escapeHTML(r.osNumero || "")}</span>`;
  if (r.status === "Arquivada") return `<span class="badge orange">Arquivada</span>`;
  return `<span class="badge blue">Aguardando análise</span>`;
}

function renderRequests() {
  const list = myRequests();
  $("requestsTable").innerHTML = list.map((r) => `
    <tr>
      <td>${formatDate((r.criadoEm || "").slice(0, 10))}</td>
      <td>${escapeHTML(r.equipamento)}</td>
      <td>${escapeHTML(r.servico)}</td>
      <td>${requestStatus(r)}</td>
      <td>${r.status === "Nova" ? `<button class="icon-btn" data-cancel="${escapeHTML(r.id)}">Cancelar</button>` : ""}</td>
    </tr>`).join("");
  $("requestsEmpty").classList.toggle("hidden", list.length > 0);
  $("requestsTable").closest(".table-wrap").classList.toggle("hidden", list.length === 0);
}

$("requestForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const request = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: user.id,
    nome: user.nome,
    email: user.email,
    telefone: $("rqTelefone").value.trim(),
    equipamento: $("rqEquipamento").value,
    servico: $("rqServico").value,
    mensagem: $("rqMensagem").value.trim(),
    criadoEm: new Date().toISOString(),
    status: "Nova"
  };
  try {
    const all = readList(REQUESTS_KEY);
    all.push(request);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(all));
  } catch {
    return showToast("Não foi possível enviar. Tente novamente.", true);
  }
  $("rqEquipamento").value = "";
  $("rqServico").value = "";
  $("rqMensagem").value = "";
  renderRequests();
  showToast("Solicitação enviada! A PCVANCE vai entrar em contato.");
});

/* ---------- Perfil ---------- */
$("profileForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const updated = Auth.updateProfile(user.id, { nome: $("pfNome").value, telefone: $("pfTelefone").value });
    user.nome = updated.nome;
    user.telefone = updated.telefone;
    fillUser();
    showToast("Dados atualizados!");
  } catch (err) {
    showToast(err.message, true);
  }
});

$("passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ($("pwdNova").value !== $("pwdNova2").value) return showToast("As senhas novas não conferem.", true);
  try {
    await Auth.changePassword(user.id, $("pwdAtual").value, $("pwdNova").value);
    e.target.reset();
    showToast("Senha alterada!");
  } catch (err) {
    showToast(err.message, true);
  }
});

function fillUser() {
  const first = user.nome.split(" ")[0];
  $("welcome").textContent = `Olá, ${first}!`;
  $("userName").textContent = user.nome;
  $("userAvatar").textContent = Auth.initials(user.nome);
  $("sideEmail").textContent = user.email;
  $("pfNome").value = user.nome;
  $("pfTelefone").value = user.telefone || "";
  $("pfEmail").value = user.email;
  $("rqNome").value = user.nome;
  if (!$("rqTelefone").value) $("rqTelefone").value = user.telefone || "";
}

$("year").textContent = new Date().getFullYear();
fillUser();
renderOrders();
renderRequests();
