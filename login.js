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
}

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
  catch (err) { showMsg(err.message || "Não foi possível concluir."); }
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
    await Auth.registerAdmin({ nome: $("setupNome").value, email: $("setupEmail").value, senha: $("setupSenha").value });
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
    await Auth.registerUser({
      nome: $("regNome").value, email: $("regEmail").value,
      telefone: $("regTelefone").value, senha: $("regSenha").value
    });
    const user = await Auth.login($("regEmail").value, $("regSenha").value);
    location.replace(Auth.home(user.role));
  });
});

refreshPanels();
if (location.hash === "#cadastro") switchTab("register");
