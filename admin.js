"use strict";

// Só o administrador entra aqui (senão volta para o login)
const currentUser = Auth.requireRole("admin");
if (!currentUser) throw new Error("Acesso restrito.");


const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "pcvance_os_v1";
const SETTINGS_KEY = "pcvance_settings_v1";
const REQUESTS_KEY = "pcvance_requests_v1";

let orders = loadOrders();
let currentDetailId = null;
let toastTimer;
let pendingRequestId = null;

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadOrders() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveOrders() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSettings() {
  const settings = {
    nome: $("empresaNome").value.trim() || "PCVANCE",
    telefone: $("empresaTelefone").value.trim(),
    email: $("empresaEmail").value.trim(),
    endereco: $("empresaEndereco").value.trim()
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  showToast("Configurações salvas!");
}

function showToast(message, error = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "—";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function nextOSNumber() {
  const year = new Date().getFullYear();
  const prefix = `OS-${year}-`;
  const max = orders.reduce((highest, order) => {
    if (!String(order.numero).startsWith(prefix)) return highest;
    const n = parseInt(String(order.numero).slice(prefix.length), 10);
    return Number.isFinite(n) ? Math.max(highest, n) : highest;
  }, 0);

  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function statusClass(status) {
  if (status === "Concluída") return "green";
  if (status === "Aguardando aprovação") return "purple";
  if (status === "Aguardando peça") return "orange";
  if (status === "Em andamento") return "blue";
  if (status === "Sem reparo" || status === "Retirada sem execução") return "red";
  return "blue";
}

function statusBadge(status) {
  return `<span class="badge ${statusClass(status)}">${escapeHTML(status || "Aberta")}</span>`;
}

function goTo(page) {
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  const target = $(`page-${page}`);
  if (!target) return;

  target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  const titles = {
    dashboard: "Dashboard",
    nova: "Criar ordem de serviço",
    ordens: "Gerenciar OS",
    solicitacoes: "Solicitações",
    relatorios: "Relatórios",
    configuracoes: "Configurações",
    detalhes: "Visualizar ordem de serviço"
  };

  $("pageTitle").textContent = titles[page] || "PCVANCE";
  $("sidebar").classList.remove("open");

  if (page === "dashboard") renderDashboard();
  if (page === "ordens") renderOrders();
  if (page === "relatorios") renderReports();
  if (page === "solicitacoes") renderRequests();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach(btn => {
  btn.addEventListener("click", () => goTo(btn.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(btn => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.go;
    if (page === "nova") resetForm();
    goTo(page);
  });
});

$("menuToggle").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

function renderDashboard() {
  $("statTotal").textContent = orders.length;
  $("statAndamento").textContent = orders.filter(o =>
    ["Aberta", "Em andamento", "Aguardando peça"].includes(o.status)
  ).length;
  $("statAprovacao").textContent = orders.filter(o =>
    o.status === "Aguardando aprovação" ||
    o.aprovacao === "Pendente"
  ).length;
  $("statConcluidas").textContent = orders.filter(o =>
    o.status === "Concluída"
  ).length;

  const recent = [...orders].sort((a, b) =>
    (b.criadoEm || b.dataAbertura || "").localeCompare(
      a.criadoEm || a.dataAbertura || ""
    )
  ).slice(0, 6);

  $("recentTable").innerHTML = recent.map(o => `
    <tr>
      <td class="os-id">${escapeHTML(o.numero)}</td>
      <td>${escapeHTML(o.cliente)}</td>
      <td>${escapeHTML(o.tipoEquipamento)} · ${escapeHTML(o.marca || "Sem marca")}</td>
      <td>${formatDate(o.dataAbertura)}</td>
      <td>${statusBadge(o.status)}</td>
      <td><button class="icon-btn" data-view="${escapeHTML(o.id)}">Abrir</button></td>
    </tr>
  `).join("");

  $("recentEmpty").classList.toggle("hidden", recent.length > 0);
  $("recentTable").closest(".table-wrap").classList.toggle("hidden", recent.length === 0);
}

function renderOrders() {
  const query = $("searchOS").value.trim().toLowerCase();
  const status = $("filterStatus").value;
  const sort = $("sortOS").value;

  let filtered = orders.filter(o => {
    const searchable = [
      o.numero, o.cliente, o.telefone, o.tipoEquipamento, o.marca, o.serie
    ].join(" ").toLowerCase();

    return searchable.includes(query) && (!status || o.status === status);
  });

  filtered.sort((a, b) => {
    if (sort === "client") return (a.cliente || "").localeCompare(b.cliente || "");
    if (sort === "old") return (a.criadoEm || "").localeCompare(b.criadoEm || "");
    return (b.criadoEm || "").localeCompare(a.criadoEm || "");
  });

  $("ordersTable").innerHTML = filtered.map(o => `
    <tr>
      <td class="os-id">${escapeHTML(o.numero)}</td>
      <td>${escapeHTML(o.cliente)}</td>
      <td>${escapeHTML(o.tipoEquipamento)} · ${escapeHTML(o.marca || "—")}</td>
      <td>${formatDate(o.dataAbertura)}</td>
      <td>${BRL.format(Number(o.total) || 0)}</td>
      <td>${statusBadge(o.status)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-view="${escapeHTML(o.id)}" title="Visualizar">Ver</button>
          <button class="icon-btn" data-edit="${escapeHTML(o.id)}" title="Editar">Editar</button>
          <button class="icon-btn" data-delete="${escapeHTML(o.id)}" title="Excluir">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  $("ordersEmpty").classList.toggle("hidden", filtered.length > 0);
  $("ordersTable").closest(".table-wrap").classList.toggle("hidden", filtered.length === 0);
}

$("searchOS").addEventListener("input", renderOrders);
$("filterStatus").addEventListener("change", renderOrders);
$("sortOS").addEventListener("change", renderOrders);

function renderReports() {
  const total = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const completed = orders.filter(o => o.status === "Concluída").length;
  const waiting = orders.filter(o => o.status === "Aguardando peça").length;

  $("reportTotal").textContent = BRL.format(total);
  $("reportTicket").textContent = BRL.format(orders.length ? total / orders.length : 0);
  $("reportRate").textContent = `${orders.length ? Math.round(completed / orders.length * 100) : 0}%`;
  $("reportParts").textContent = waiting;
}

function addItem(item = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="item-name" aria-label="Descrição do serviço ou peça" placeholder="Serviço ou peça" value="${escapeHTML(item.nome || "")}"></td>
    <td><input class="item-qty" aria-label="Quantidade" type="number" min="1" step="1" value="${Number(item.qtd) > 0 ? Number(item.qtd) : 1}"></td>
    <td><input class="item-price" aria-label="Valor unitário" type="number" min="0" step="0.01" value="${Number(item.valor) >= 0 ? Number(item.valor) : 0}"></td>
    <td class="item-subtotal">R$ 0,00</td>
    <td><button type="button" class="icon-btn remove-item" aria-label="Remover item">×</button></td>
  `;

  $("itemsBody").appendChild(tr);

  tr.querySelectorAll(".item-qty, .item-price").forEach(input => {
    input.addEventListener("input", calculateTotal);
  });

  tr.querySelector(".remove-item").addEventListener("click", () => {
    tr.remove();
    calculateTotal();
  });

  calculateTotal();
}

function readItems() {
  return [...$("itemsBody").querySelectorAll("tr")].map(tr => ({
    nome: tr.querySelector(".item-name").value.trim(),
    qtd: Math.max(1, Number(tr.querySelector(".item-qty").value) || 1),
    valor: Math.max(0, Number(tr.querySelector(".item-price").value) || 0)
  })).filter(item => item.nome);
}

function calculateTotal() {
  let total = 0;

  $("itemsBody").querySelectorAll("tr").forEach(tr => {
    const qtd = Math.max(1, Number(tr.querySelector(".item-qty").value) || 1);
    const valor = Math.max(0, Number(tr.querySelector(".item-price").value) || 0);
    const subtotal = qtd * valor;

    tr.querySelector(".item-subtotal").textContent = BRL.format(subtotal);
    total += subtotal;
  });

  $("totalOrcamento").textContent = BRL.format(total);
  return total;
}

$("addItem").addEventListener("click", () => addItem());

function resetForm() {
  $("osForm").reset();
  $("editId").value = "";
  pendingRequestId = null;
  $("formTitle").textContent = "Criar ordem de serviço";
  $("osNumber").value = nextOSNumber();
  $("dataAbertura").value = today();
  $("status").value = "Aberta";
  $("aprovacao").value = "Pendente";
  $("itemsBody").innerHTML = "";
  addItem();
}

function fillForm(o) {
  const fields = [
    "dataAbertura", "dataPrevisao", "tecnico", "cliente", "documento",
    "telefone", "email", "endereco", "cidade", "tipoEquipamento", "marca",
    "serie", "acessorios", "senha", "estadoFisico", "problema", "avarias",
    "pagamento", "aprovacao", "dataAprovacao", "obsOrcamento", "diagnostico",
    "servicosRealizados", "pecasObservacoes", "status", "testeEspecifico",
    "observacoesFinais", "nomeAutorizador", "nomeEntrega"
  ];

  $("editId").value = o.id;
  $("osNumber").value = o.numero;
  $("formTitle").textContent = `Editar ordem ${o.numero}`;

  fields.forEach(key => {
    if ($(key)) $(key).value = o[key] ?? "";
  });

  $("termosAceitos").checked = !!o.termosAceitos;

  document.querySelectorAll('input[name="testes"]').forEach(input => {
    input.checked = (o.testes || []).includes(input.value);
  });

  $("itemsBody").innerHTML = "";
  (o.itens?.length ? o.itens : [{}]).forEach(addItem);
  calculateTotal();

  goTo("nova");
}

function collectForm() {
  const editId = $("editId").value;
  const previous = orders.find(o => o.id === editId);

  return {
    id: editId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    numero: previous?.numero || nextOSNumber(),
    criadoEm: previous?.criadoEm || new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),

    dataAbertura: $("dataAbertura").value,
    dataPrevisao: $("dataPrevisao").value,
    tecnico: $("tecnico").value.trim(),
    cliente: $("cliente").value.trim(),
    documento: $("documento").value.trim(),
    telefone: $("telefone").value.trim(),
    email: $("email").value.trim(),
    endereco: $("endereco").value.trim(),
    cidade: $("cidade").value.trim(),

    tipoEquipamento: $("tipoEquipamento").value,
    marca: $("marca").value.trim(),
    serie: $("serie").value.trim(),
    acessorios: $("acessorios").value.trim(),
    senha: $("senha").value,
    estadoFisico: $("estadoFisico").value.trim(),

    problema: $("problema").value.trim(),
    avarias: $("avarias").value.trim(),

    itens: readItems(),
    total: calculateTotal(),
    pagamento: $("pagamento").value,
    aprovacao: $("aprovacao").value,
    dataAprovacao: $("dataAprovacao").value,
    obsOrcamento: $("obsOrcamento").value.trim(),

    diagnostico: $("diagnostico").value.trim(),
    servicosRealizados: $("servicosRealizados").value.trim(),
    pecasObservacoes: $("pecasObservacoes").value.trim(),

    testes: [...document.querySelectorAll('input[name="testes"]:checked')].map(i => i.value),
    testeEspecifico: $("testeEspecifico").value.trim(),
    status: $("status").value,
    observacoesFinais: $("observacoesFinais").value.trim(),

    termosAceitos: $("termosAceitos").checked,
    nomeAutorizador: $("nomeAutorizador").value.trim(),
    nomeEntrega: $("nomeEntrega").value.trim()
  };
}

$("osForm").addEventListener("submit", event => {
  event.preventDefault();

  const order = collectForm();
  const index = orders.findIndex(o => o.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.push(order);
  }

  try {
    saveOrders();
  } catch {
    showToast("Não foi possível salvar. O armazenamento pode estar cheio.", true);
    return;
  }

  showToast(index >= 0 ? "Ordem atualizada!" : "Ordem cadastrada!");
  if (index < 0) markRequestConverted(order);
  currentDetailId = order.id;
  openDetails(order.id);
});

function openDetails(id) {
  const order = orders.find(o => o.id === id);
  if (!order) return;

  currentDetailId = id;
  renderPrintDocument(order);
  goTo("detalhes");
}

function renderPrintDocument(o) {
  const settings = loadSettings();
  const empresa = escapeHTML(settings.nome || "PCVANCE");
  const contato = [settings.telefone, settings.email, settings.endereco]
    .filter(Boolean).map(escapeHTML).join(" · ");

  const field = (label, value) =>
    `<div class="print-field"><strong>${escapeHTML(label)}:</strong> ${escapeHTML(value || "—")}</div>`;

  const textBlock = (label, value) => `
    <div class="print-section">
      <h2>${escapeHTML(label)}</h2>
      <div class="print-text">${escapeHTML(value || "Não informado.")}</div>
    </div>`;

  const items = o.itens || [];
  const tests = [...(o.testes || [])];
  if (o.testeEspecifico) tests.push(o.testeEspecifico);

  $("printDocument").innerHTML = `
    <div class="print-header">
      <div class="print-logo">PC</div>
      <div>
        <h1>${empresa}</h1>
        <p>ASSISTÊNCIA TÉCNICA · MANUTENÇÃO · OTIMIZAÇÃO</p>
        <p>${contato || "Ordem de Serviço Técnica"}</p>
      </div>
      <div class="print-os-number">
        <strong>${escapeHTML(o.numero)}</strong>
        <span>Ordem de Serviço</span>
      </div>
    </div>

    <div class="print-grid">
      ${field("Data de abertura", formatDate(o.dataAbertura))}
      ${field("Previsão de entrega", formatDate(o.dataPrevisao))}
      ${field("Técnico responsável", o.tecnico)}
      ${field("Status", o.status)}
    </div>

    <div class="print-section">
      <h2>01. Dados do cliente</h2>
      <div class="print-grid">
        ${field("Nome / Empresa", o.cliente)}
        ${field("CPF / CNPJ", o.documento)}
        ${field("Telefone", o.telefone)}
        ${field("E-mail", o.email)}
        ${field("Endereço", o.endereco)}
        ${field("Cidade / UF", o.cidade)}
      </div>
    </div>

    <div class="print-section">
      <h2>02. Identificação do equipamento</h2>
      <div class="print-grid">
        ${field("Tipo", o.tipoEquipamento)}
        ${field("Marca / Modelo", o.marca)}
        ${field("Número de série", o.serie)}
        ${field("Acessórios recebidos", o.acessorios)}
        ${field("Estado físico", o.estadoFisico)}
      </div>
    </div>

    ${textBlock("03. Problema relatado pelo cliente", o.problema)}
    ${textBlock("Condição de entrada / avarias", o.avarias)}

    <div class="print-section">
      <h2>04. Serviços e orçamento</h2>
      <table class="print-table">
        <thead><tr><th>Serviço / peça</th><th>Qtd.</th><th>Valor unitário</th><th>Subtotal</th></tr></thead>
        <tbody>
          ${items.length ? items.map(item => `
            <tr>
              <td>${escapeHTML(item.nome || "—")}</td>
              <td>${Number(item.qtd) || 1}</td>
              <td>${BRL.format(Number(item.valor) || 0)}</td>
              <td>${BRL.format((Number(item.qtd) || 1) * (Number(item.valor) || 0))}</td>
            </tr>`).join("") : `<tr><td colspan="4">Nenhum item informado.</td></tr>`}
        </tbody>
      </table>
      <div class="print-total">Total: ${BRL.format(Number(o.total) || 0)}</div>
      <div class="print-grid" style="margin-top:10px">
        ${field("Forma de pagamento", o.pagamento)}
        ${field("Aprovação do orçamento", o.aprovacao)}
        ${field("Data da aprovação", formatDate(o.dataAprovacao))}
        ${field("Observações do orçamento", o.obsOrcamento)}
      </div>
    </div>

    ${textBlock("05. Diagnóstico técnico", o.diagnostico)}
    ${textBlock("Serviços efetivamente realizados", o.servicosRealizados)}
    ${textBlock("Peças substituídas / observações", o.pecasObservacoes)}

    <div class="print-section">
      <h2>06. Testes e entrega</h2>
      <div class="print-text">Testes realizados: ${escapeHTML(tests.join(", ") || "Não informado.")}</div>
      ${textBlock("Observações finais / recomendações", o.observacoesFinais)}
    </div>

    <div class="print-section">
      <h2>07. Termos e autorização</h2>
      <div class="print-terms">
        <p>• O cliente declara que as informações fornecidas sobre o defeito são verdadeiras e autoriza a avaliação e os serviços expressamente aprovados nesta OS.</p>
        <p>• Serviços adicionais, troca de peças ou custos não previstos dependem de comunicação e aprovação prévia do cliente.</p>
        <p>• Intervenções técnicas podem envolver riscos aos dados. Recomenda-se manter cópia de segurança. Backup ou recuperação de dados deve ser previamente acordado.</p>
        <p>• Equipamento e acessórios devem ser conferidos na entrada e na retirada. Garantia, prazos e condições aplicáveis devem ser informados por escrito conforme o serviço e a legislação vigente.</p>
        <p><strong>Autorização registrada:</strong> ${o.termosAceitos ? "Sim" : "Não assinalada"}</p>
      </div>
    </div>

    <div class="print-signatures">
      <div>Assinatura do cliente<br><strong>${escapeHTML(o.nomeAutorizador || "")}</strong></div>
      <div>Assinatura do técnico / PCVANCE<br><strong>${escapeHTML(o.nomeEntrega || o.tecnico || "")}</strong></div>
    </div>

    <div class="print-footer">
      ${empresa} · Documento gerado pelo sistema de Ordens de Serviço.
      <br>Confira os dados e obtenha as assinaturas necessárias antes de arquivar.
    </div>
  `;

  $("detailEdit").onclick = () => fillForm(o);
}

document.addEventListener("click", event => {
  const viewBtn = event.target.closest("[data-view]");
  const editBtn = event.target.closest("[data-edit]");
  const deleteBtn = event.target.closest("[data-delete]");

  if (viewBtn) openDetails(viewBtn.dataset.view);
  if (editBtn) {
    const order = orders.find(o => o.id === editBtn.dataset.edit);
    if (order) fillForm(order);
  }

  if (deleteBtn) {
    const order = orders.find(o => o.id === deleteBtn.dataset.delete);
    if (!order) return;

    if (confirm(`Deseja excluir a ordem ${order.numero} de ${order.cliente}? Essa ação não pode ser desfeita.`)) {
      orders = orders.filter(o => o.id !== order.id);
      saveOrders();
      renderOrders();
      renderDashboard();
      renderReports();
      showToast("Ordem excluída.");
    }
  }
});

$("printOS").addEventListener("click", () => {
  if (!currentDetailId) return;
  window.print();
});

$("settingsForm").addEventListener("submit", event => {
  event.preventDefault();
  saveSettings();
  if (currentDetailId) {
    const order = orders.find(o => o.id === currentDetailId);
    if (order) renderPrintDocument(order);
  }
});

function loadSettingsIntoForm() {
  const settings = loadSettings();
  $("empresaNome").value = settings.nome || "PCVANCE";
  $("empresaTelefone").value = settings.telefone || "";
  $("empresaEmail").value = settings.email || "";
  $("empresaEndereco").value = settings.endereco || "";
}

$("clearData").addEventListener("click", () => {
  const confirmation = prompt(
    'Esta ação apagará todas as OS deste navegador. Para confirmar, digite APAGAR.'
  );

  if (confirmation !== "APAGAR") {
    showToast("Operação cancelada.");
    return;
  }

  orders = [];
  saveOrders();
  renderDashboard();
  renderOrders();
  renderReports();
  showToast("Ordens locais apagadas.");
  goTo("dashboard");
});

function exportCSV() {
  const headers = [
    "Número OS", "Data abertura", "Cliente", "Telefone", "Equipamento",
    "Marca/modelo", "Técnico", "Status", "Aprovação", "Total"
  ];

  const rows = orders.map(o => [
    o.numero, o.dataAbertura, o.cliente, o.telefone,
    o.tipoEquipamento, o.marca, o.tecnico, o.status, o.aprovacao, o.total
  ]);

  const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [headers, ...rows]
    .map(row => row.map(csvCell).join(";"))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PCVANCE-Relatorio-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

$("exportCSV").addEventListener("click", exportCSV);

$("year").textContent = new Date().getFullYear();
$("dataAbertura").value = today();
$("osNumber").value = nextOSNumber();
loadSettingsIntoForm();
addItem();
renderDashboard();
renderOrders();
renderReports();


/* ===== Sessão ===== */
$("userName").textContent = currentUser.nome;
$("userAvatar").textContent = Auth.initials(currentUser.nome);
$("logoutBtn").addEventListener("click", () => Auth.logout());

$("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("pwdNova").value !== $("pwdNova2").value) return showToast("As senhas novas não conferem.", true);
  try {
    await Auth.changePassword(currentUser.id, $("pwdAtual").value, $("pwdNova").value);
    event.target.reset();
    showToast("Senha alterada!");
  } catch (err) {
    showToast(err.message, true);
  }
});

/* ===== Solicitações dos clientes ===== */
function loadRequests() {
  try {
    const data = JSON.parse(localStorage.getItem(REQUESTS_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveRequests(list) {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(list));
}

function updateRequestBadge() {
  const n = loadRequests().filter((r) => r.status === "Nova").length;
  $("requestBadge").textContent = n;
  $("requestBadge").classList.toggle("hidden", n === 0);
}

function requestStatusBadge(r) {
  if (r.status === "Convertida") return `<span class="badge green">${escapeHTML(r.osNumero || "Convertida")}</span>`;
  if (r.status === "Arquivada") return `<span class="badge orange">Arquivada</span>`;
  return `<span class="badge blue">Nova</span>`;
}

function renderRequests() {
  const filter = $("filterRequests").value;
  const list = loadRequests()
    .filter((r) => !filter || r.status === filter)
    .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));

  $("requestsTable").innerHTML = list.map((r) => `
    <tr>
      <td>${formatDate((r.criadoEm || "").slice(0, 10))}</td>
      <td><strong>${escapeHTML(r.nome)}</strong><br><span class="muted">${escapeHTML(r.telefone || r.email)}</span></td>
      <td>${escapeHTML(r.equipamento)}</td>
      <td>${escapeHTML(r.servico)}</td>
      <td class="req-msg">${escapeHTML(r.mensagem)}</td>
      <td>${requestStatusBadge(r)}</td>
      <td>
        <div class="row-actions">
          ${r.status === "Nova" ? `<button class="icon-btn" data-req-convert="${escapeHTML(r.id)}">Criar OS</button><button class="icon-btn" data-req-archive="${escapeHTML(r.id)}">Arquivar</button>` : ""}
          <button class="icon-btn" data-req-delete="${escapeHTML(r.id)}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  $("requestsEmpty").classList.toggle("hidden", list.length > 0);
  $("requestsTable").closest(".table-wrap").classList.toggle("hidden", list.length === 0);
  updateRequestBadge();
}

function equipmentToOS(name) {
  if (name === "Notebook") return "Notebook";
  if (name === "Computador de mesa" || name === "PC gamer") return "Desktop";
  return "Outro";
}

function convertRequest(id) {
  const r = loadRequests().find((x) => x.id === id);
  if (!r) return;
  resetForm();
  pendingRequestId = id;
  $("cliente").value = r.nome || "";
  $("telefone").value = r.telefone || "";
  $("email").value = r.email || "";
  $("tipoEquipamento").value = equipmentToOS(r.equipamento);
  $("problema").value = `${r.servico || "Atendimento"} — ${r.mensagem || ""}`.trim();
  goTo("nova");
  showToast("Dados da solicitação carregados. Complete e salve a OS.");
}

function markRequestConverted(order) {
  if (!pendingRequestId) return;
  const list = loadRequests();
  const r = list.find((x) => x.id === pendingRequestId);
  if (r) {
    r.status = "Convertida";
    r.osNumero = order.numero;
    saveRequests(list);
  }
  pendingRequestId = null;
  updateRequestBadge();
}

$("filterRequests").addEventListener("change", renderRequests);

document.addEventListener("click", (event) => {
  const convert = event.target.closest("[data-req-convert]");
  const archive = event.target.closest("[data-req-archive]");
  const remove = event.target.closest("[data-req-delete]");

  if (convert) convertRequest(convert.dataset.reqConvert);

  if (archive) {
    const list = loadRequests();
    const r = list.find((x) => x.id === archive.dataset.reqArchive);
    if (r) { r.status = "Arquivada"; saveRequests(list); renderRequests(); }
  }

  if (remove) {
    if (confirm("Excluir esta solicitação? Essa ação não pode ser desfeita.")) {
      saveRequests(loadRequests().filter((x) => x.id !== remove.dataset.reqDelete));
      renderRequests();
      showToast("Solicitação excluída.");
    }
  }
});

updateRequestBadge();
