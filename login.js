"use strict";
const $ = (id) => document.getElementById(id);

// Já logado? Vai direto para a área certa.
const logged = Auth.currentUser();
if (logged) location.replace(Auth.home(logged.role));

function showMsg(text, ok = false) {
  const el = $("authMsg");
  el.textContent = text || "";
  el.classList.toggle("ok", ok);
}

function refreshPanels() {
  const admin = Auth.hasAdmin();
  $("setupPanel").classList.toggle("hidden", admin);
  $("authPanel").classList.toggle("hidden", !admin);
  $("codePanel").classList.add("hidden");
}

/* ---------- Verificação de e-mail ----------
   1) confere o formato e se o domínio realmente existe e recebe e-mails;
   2) se o envio de código estiver configurado (auth.js → EMAILJS), manda um código
      de 6 dígitos e só continua quando a pessoa digitar o código certo. */
let codeCtx = null; // { email, nome, resolve, reject }

function showCodePanel(email) {
  $("setupPanel").classList.add("hidden");
  $("authPanel").classList.add("hidden");
  $("codePanel").classList.remove("hidden");
  $("codeSub").textContent = `Enviamos um código de 6 dígitos para ${email}.`;
  $("codeInput").value = "";
  $("codeInput").focus();
  startResendTimer();
}

let resendTimer = null;
function startResendTimer() {
  const btn = $("codeResend");
  let left = 30;
  clearInterval(resendTimer);
  btn.disabled = true;
  btn.textContent = `Reenviar código (${left}s)`;
  resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = "Reenviar código"; }
    else btn.textContent = `Reenviar código (${left}s)`;
  }, 1000);
}

async function confirmEmail(email, nome) {
  showMsg("Verificando e-mail...", true);
  const checked = await Auth.checkEmail(email);
  if (!Auth.emailCodeEnabled()) { showMsg(""); return checked.email; }

  showMsg("Enviando código de verificação...", true);
  await Auth.sendEmailCode(checked.email, nome);
  showMsg("");
  showCodePanel(checked.email);
  await new Promise((resolve, reject) => { codeCtx = { email: checked.email, nome, resolve, reject }; });
  return checked.email;
}

$("codeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!codeCtx) return;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await Auth.verifyEmailCode(codeCtx.email, $("codeInput").value);
    showMsg("E-mail confirmado!", true);
    clearInterval(resendTimer);
    const ctx = codeCtx; codeCtx = null;
    ctx.resolve();
  } catch (err) { showMsg(err.message || "Não foi possível confirmar."); }
  finally { btn.disabled = false; }
});

$("codeResend").addEventListener("click", async () => {
  if (!codeCtx) return;
  try {
    await Auth.sendEmailCode(codeCtx.email, codeCtx.nome);
    showMsg("Novo código enviado.", true);
    startResendTimer();
  } catch (err) { showMsg(err.message || "Não foi possível reenviar."); }
});

$("codeCancel").addEventListener("click", () => {
  if (!codeCtx) return;
  clearInterval(resendTimer);
  const ctx = codeCtx; codeCtx = null;
  refreshPanels();
  ctx.reject(new Error("Confirmação de e-mail cancelada."));
});

function refreshPanelsIfNoCode() { if (!codeCtx) refreshPanels(); }

function switchTab(tab) {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("loginForm").classList.toggle("hidden", tab !== "login");
  $("registerForm").classList.toggle("hidden", tab !== "register");
  showMsg("");
}

async function run(form, task) {
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  showMsg("");
  try { await task(); }
  catch (err) { showMsg(err.message || "Não foi possível concluir."); refreshPanelsIfNoCode(); }
  finally { btn.disabled = false; }
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

document.querySelectorAll("[data-eye]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.eye);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
  });
});

$("setupForm").addEventListener("submit", (e) => {
  e.preventDefault();
  run(e.target, async () => {
    if ($("setupSenha").value !== $("setupSenha2").value) throw new Error("As senhas não conferem.");
    const email = await confirmEmail($("setupEmail").value, $("setupNome").value);
    await Auth.registerAdmin({ nome: $("setupNome").value, email, senha: $("setupSenha").value });
    await Auth.login($("setupEmail").value, $("setupSenha").value);
    location.replace("admin.html");
  });
});

$("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  run(e.target, async () => {
    const user = await Auth.login($("loginEmail").value, $("loginSenha").value);
    location.replace(Auth.home(user.role));
  });
});

$("registerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  run(e.target, async () => {
    if ($("regSenha").value !== $("regSenha2").value) throw new Error("As senhas não conferem.");
    const email = await confirmEmail($("regEmail").value, $("regNome").value);
    await Auth.registerUser({
      nome: $("regNome").value, email,
      telefone: $("regTelefone").value, senha: $("regSenha").value
    });
    const user = await Auth.login($("regEmail").value, $("regSenha").value);
    location.replace(Auth.home(user.role));
  });
});

refreshPanels();
if (location.hash === "#cadastro") switchTab("register");
