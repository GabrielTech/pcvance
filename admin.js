"use strict";

// Administradores e colaboradores autorizados acessam o painel de OS
const currentUser = Auth.requireRole("admin");
if (!currentUser) throw new Error("Acesso restrito.");


const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "pcvance_os_v1";
const SETTINGS_KEY = "pcvance_settings_v1";

let orders = [];
let currentDetailId = null;
let toastTimer;
let pendingRequestId = null;
let serviceRequests = [];

const BRL = new Intl.NumberFormat("pt-BR", {

  style: "currency",
  currency: "BRL"
});

/* Valor "A definir": o item fica sem preço para combinar com o cliente.
   Ordens antigas (sem esse campo) continuam funcionando normalmente. */
function tbdCount(o) { return (o.itens || []).filter(i => i && i.aDefinir).length; }
function isAllTBD(o) { const n = (o.itens || []).length; return n > 0 && tbdCount(o) === n; }
function totalLabel(o) {
  if (isAllTBD(o)) return "A definir";
  return tbdCount(o) ? `${BRL.format(Number(o.total) || 0)} + A definir` : BRL.format(Number(o.total) || 0);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localOrdersBackup() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function cloudRowToOrder(row) {
  return { ...(row.dados || {}), id: row.id, numero: row.numero, clienteId: row.cliente_id || row.dados?.clienteId || null,
    criadoEm: row.dados?.criadoEm || row.created_at,
    atualizadoEm: row.updated_at };
}

async function refreshOrders() {
  const { data, error } = await Auth.sb.from("ordens_servico")
    .select("id,numero,dados,cliente_id,created_by,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as OS: " + error.message);
  orders = (data || []).map(cloudRowToOrder);
  renderDashboard(); renderOrders(); renderReports();
}

async function migrateLocalOrdersIfNeeded() {
  const marker = "pcvance_os_migrated_v1";
  if (localStorage.getItem(marker) === "1") return;
  const legacy = localOrdersBackup();
  if (!legacy.length) { localStorage.setItem(marker, "1"); return; }
  const rows = legacy.map(o => {
    const validUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(o.id || ""));
    const id = validUUID ? o.id : crypto.randomUUID();
    const migratedOrder = { ...o, id };
    const parsedDate = o.criadoEm ? new Date(o.criadoEm) : new Date();
    return { id, numero: o.numero, dados: migratedOrder,
      created_by: currentUser.id,
      created_at: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
      updated_at: new Date().toISOString() };
  });
  const { error } = await Auth.sb.from("ordens_servico").upsert(rows, { onConflict: "numero", ignoreDuplicates: true });
  if (error) throw new Error("Falha ao migrar as OS deste navegador: " + error.message);
  localStorage.setItem(marker, "1");
  showToast(`${legacy.length} OS antigas verificadas para migração.`);
}

async function initializeCloudOrders() {
  try {
    await migrateLocalOrdersIfNeeded();
    await refreshOrders();
    if (!$('editId').value) $('osNumber').value = nextOSNumber();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Erro ao conectar às Ordens de Serviço.", true);
  }
}

async function saveOrderCloud(order) {
  const existing = orders.some(o => o.id === order.id);
  const linkedRequest = pendingRequestId ? serviceRequests.find(r => r.id === pendingRequestId) : null;
  if (linkedRequest) order.clienteId = linkedRequest.userId;
  const payload = { id: order.id, numero: order.numero, dados: order, cliente_id: order.clienteId || null,
    updated_at: new Date().toISOString() };
  if (!existing) {
    payload.created_by = currentUser.id;
    payload.created_at = new Date().toISOString();
  }
  const { error } = await Auth.sb.from("ordens_servico").upsert(payload, { onConflict: "id" });
  if (error) throw new Error("Não foi possível salvar a OS: " + error.message);
}

async function deleteOrderCloud(id) {
  const { error } = await Auth.sb.from("ordens_servico").delete().eq("id", id);
  if (error) throw new Error("Não foi possível excluir a OS: " + error.message);
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

  if (["dashboard", "ordens", "relatorios"].includes(page)) refreshOrders().catch(err => showToast(err.message, true));
  if (page === "solicitacoes") renderRequests().catch(err => showToast(err.message, true));

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
      <td>${totalLabel(o)}</td>
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
  const priced = orders.filter(o => !isAllTBD(o)).length; // OS 100% "A definir" ficam fora do ticket médio
  const completed = orders.filter(o => o.status === "Concluída").length;
  const waiting = orders.filter(o => o.status === "Aguardando peça").length;

  $("reportTotal").textContent = BRL.format(total);
  $("reportTicket").textContent = BRL.format(priced ? total / priced : 0);
  $("reportRate").textContent = `${orders.length ? Math.round(completed / orders.length * 100) : 0}%`;
  $("reportParts").textContent = waiting;
}

function addItem(item = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="item-name" aria-label="Descrição do serviço ou peça" placeholder="Serviço ou peça" value="${escapeHTML(item.nome || "")}"></td>
    <td><input class="item-qty" aria-label="Quantidade" type="number" min="1" step="1" value="${Number(item.qtd) > 0 ? Number(item.qtd) : 1}"></td>
    <td class="price-cell">
      <input class="item-price" aria-label="Valor unitário" type="number" min="0" step="0.01" value="${Number(item.valor) >= 0 ? Number(item.valor) : 0}">
      <label class="tbd-check"><input type="checkbox" class="item-tbd" ${item.aDefinir ? "checked" : ""}> A definir</label>
    </td>
    <td class="item-subtotal">R$ 0,00</td>
    <td><button type="button" class="icon-btn remove-item" aria-label="Remover item">×</button></td>
  `;

  $("itemsBody").appendChild(tr);

  tr.querySelectorAll(".item-qty, .item-price").forEach(input => {
    input.addEventListener("input", calculateTotal);
  });
  tr.querySelector(".item-tbd").addEventListener("change", calculateTotal);

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
    aDefinir: tr.querySelector(".item-tbd").checked,
    valor: tr.querySelector(".item-tbd").checked ? 0 : Math.max(0, Number(tr.querySelector(".item-price").value) || 0)
  })).filter(item => item.nome);
}

function calculateTotal() {
  let total = 0;
  let rows = 0;
  let tbd = 0;

  $("itemsBody").querySelectorAll("tr").forEach(tr => {
    const qtd = Math.max(1, Number(tr.querySelector(".item-qty").value) || 1);
    const aDefinir = tr.querySelector(".item-tbd").checked;
    const priceInput = tr.querySelector(".item-price");
    priceInput.disabled = aDefinir;
    rows++;

    if (aDefinir) {
      tbd++;
      tr.querySelector(".item-subtotal").textContent = "A definir";
      return;
    }

    const valor = Math.max(0, Number(priceInput.value) || 0);
    const subtotal = qtd * valor;
    tr.querySelector(".item-subtotal").textContent = BRL.format(subtotal);
    total += subtotal;
  });

  $("totalOrcamento").textContent =
    rows > 0 && tbd === rows ? "A definir" :
    tbd ? `${BRL.format(total)} + A definir` :
    BRL.format(total);
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
    clienteId: previous?.clienteId || null,

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

$("osForm").addEventListener("submit", async event => {
  event.preventDefault();
  const order = collectForm();
  const index = orders.findIndex(o => o.id === order.id);
  try {
    await saveOrderCloud(order);
    if (index >= 0) orders[index] = order; else orders.push(order);
    showToast(index >= 0 ? "Ordem atualizada na nuvem!" : "Ordem cadastrada na nuvem!");
    if (index < 0 && pendingRequestId) await markRequestConverted(order);
    currentDetailId = order.id;
    renderDashboard(); renderOrders(); renderReports();
    openDetails(order.id);
  } catch (err) { showToast(err.message, true); }
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
      <img class="print-logo" src="pcvance_logo.jpeg" alt="Logotipo PCVANCE">
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
              <td>${item.aDefinir ? "A definir" : BRL.format(Number(item.valor) || 0)}</td>
              <td>${item.aDefinir ? "A definir" : BRL.format((Number(item.qtd) || 1) * (Number(item.valor) || 0))}</td>
            </tr>`).join("") : `<tr><td colspan="4">Nenhum item informado.</td></tr>`}
        </tbody>
      </table>
      <div class="print-total">Total: ${totalLabel(o)}</div>
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
      deleteOrderCloud(order.id).then(() => {
        orders = orders.filter(o => o.id !== order.id);
        renderOrders(); renderDashboard(); renderReports();
        showToast("Ordem excluída da nuvem.");
      }).catch(err => showToast(err.message, true));
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

$("clearData").addEventListener("click", async () => {
  const confirmation = prompt('Esta ação apagará permanentemente todas as OS do banco compartilhado. Para confirmar, digite APAGAR.');
  if (confirmation !== "APAGAR") { showToast("Operação cancelada."); return; }
  try {
    const { error } = await Auth.sb.from("ordens_servico").delete().neq("numero", "");
    if (error) throw error;
    orders = []; renderDashboard(); renderOrders(); renderReports();
    showToast("Todas as OS foram apagadas do banco compartilhado.");
    goTo("dashboard");
  } catch (err) { showToast("Não foi possível apagar as OS: " + err.message, true); }
});

function exportCSV() {
  const headers = [
    "Número OS", "Data abertura", "Cliente", "Telefone", "Equipamento",
    "Marca/modelo", "Técnico", "Status", "Aprovação", "Total"
  ];

  const rows = orders.map(o => [
    o.numero, o.dataAbertura, o.cliente, o.telefone,
    o.tipoEquipamento, o.marca, o.tecnico, o.status, o.aprovacao, tbdCount(o) ? totalLabel(o) : o.total
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
initializeCloudOrders();
window.addEventListener("focus", () => refreshOrders().catch(err => showToast(err.message, true)));


/* ===== Sessão ===== */
$("userName").textContent = currentUser.nome;
if ($("userRoleLabel")) $("userRoleLabel").textContent = currentUser.role === "colaborador" ? "Colaborador" : "Administrador";
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

/* ===== Solicitações dos clientes — sincronizadas pelo Supabase ===== */
async function loadRequests() {
  const { data, error } = await Auth.sb.from("solicitacoes_servico")
    .select("id,user_id,dados,status,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as solicitações: " + error.message);
  serviceRequests = (data || []).map(row => ({ ...(row.dados || {}), id: row.id, userId: row.user_id, status: row.status, criadoEm: row.dados?.criadoEm || row.created_at, updatedAt: row.updated_at }));
  return serviceRequests;
}

async function updateRequestBadge() {
  const n = serviceRequests.filter(r => r.status === "Nova").length;
  $("requestBadge").textContent = n;
  $("requestBadge").classList.toggle("hidden", n === 0);
}

function requestStatusBadge(r) {
  if (r.status === "Convertida") return `<span class="badge green">OS ${escapeHTML(r.osNumero || "criada")}</span>`;
  if (r.status === "Arquivada") return `<span class="badge orange">Arquivada</span>`;
  return `<span class="badge blue">Pendente de aprovação</span>`;
}

async function renderRequests() {
  const filter = $("filterRequests").value;
  const list = (await loadRequests()).filter(r => !filter || r.status === filter);
  $("requestsTable").innerHTML = list.map(r => `
    <tr>
      <td>${formatDate((r.criadoEm || "").slice(0, 10))}</td>
      <td><strong>${escapeHTML(r.nome)}</strong><br><span class="muted">${escapeHTML(r.telefone || r.email)}</span></td>
      <td>${escapeHTML(r.equipamento)}</td>
      <td>${escapeHTML(r.servico)}</td>
      <td class="req-msg">${escapeHTML(r.mensagem)}</td>
      <td>${requestStatusBadge(r)}</td>
      <td><div class="row-actions">
        ${r.status === "Nova" ? `<button class="icon-btn" data-req-convert="${escapeHTML(r.id)}">Aceitar / Criar OS</button><button class="icon-btn" data-req-archive="${escapeHTML(r.id)}">Recusar</button>` : ""}
        <button class="icon-btn" data-req-delete="${escapeHTML(r.id)}">Excluir</button>
      </div></td>
    </tr>`).join("");
  $("requestsEmpty").classList.toggle("hidden", list.length > 0);
  $("requestsTable").closest(".table-wrap").classList.toggle("hidden", list.length === 0);
  await updateRequestBadge();
}

function equipmentToOS(name) {
  if (name === "Notebook") return "Notebook";
  if (name === "Computador de mesa" || name === "PC gamer") return "Desktop";
  return "Outro";
}

async function convertRequest(id) {
  await loadRequests();
  const r = serviceRequests.find((x) => x.id === id);
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

async function markRequestConverted(order) {
  if (!pendingRequestId) return;
  const r = serviceRequests.find(x => x.id === pendingRequestId);
  if (r) {
    const updatedData = { ...r, osNumero: order.numero };
    const { error } = await Auth.sb.from("solicitacoes_servico").update({ status: "Convertida", dados: updatedData, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) throw new Error("A OS foi salva, mas não foi possível atualizar a solicitação: " + error.message);
  }
  pendingRequestId = null;
  await renderRequests();
}

$("filterRequests").addEventListener("change", () => renderRequests().catch(err => showToast(err.message, true)));

document.addEventListener("click", async (event) => {
  const convert = event.target.closest("[data-req-convert]");
  const archive = event.target.closest("[data-req-archive]");
  const remove = event.target.closest("[data-req-delete]");
  try {
    if (convert) await convertRequest(convert.dataset.reqConvert);
    if (archive) {
      const { error } = await Auth.sb.from("solicitacoes_servico").update({ status: "Arquivada", updated_at: new Date().toISOString() }).eq("id", archive.dataset.reqArchive);
      if (error) throw error;
      await renderRequests(); showToast("Solicitação recusada/arquivada.");
    }
    if (remove && confirm("Excluir esta solicitação? Essa ação não pode ser desfeita.")) {
      const { error } = await Auth.sb.from("solicitacoes_servico").delete().eq("id", remove.dataset.reqDelete);
      if (error) throw error;
      await renderRequests(); showToast("Solicitação excluída.");
    }
  } catch (err) { showToast(err.message || "Falha ao atualizar solicitação.", true); }
});

loadRequests().then(updateRequestBadge).catch(err => showToast(err.message, true));
window.addEventListener("focus", () => {
  refreshOrders().catch(err => showToast(err.message, true));
  if (document.getElementById("page-solicitacoes")?.classList.contains("active")) renderRequests().catch(err => showToast(err.message, true));
});
Auth.sb.channel("admin-solicitacoes")
  .on("postgres_changes", { event: "*", schema: "public", table: "solicitacoes_servico" }, () => {
    loadRequests().then(() => { updateRequestBadge(); if (document.getElementById("page-solicitacoes")?.classList.contains("active")) renderRequests(); }).catch(err => showToast(err.message, true));
  }).subscribe();
