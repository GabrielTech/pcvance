"use strict";
const $ = id => document.getElementById(id);
function showMsg(text, ok=false) { const el=$("authMsg"); if(el){el.textContent=text||"";el.classList.toggle("ok",ok);} }
function switchTab(tab) {
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  $("loginForm").classList.toggle("hidden",tab!=="login");
  $("registerForm").classList.toggle("hidden",tab!=="register"); showMsg("");
}
function run(form, task) { const btn=form.querySelector('button[type="submit"]'); btn.disabled=true; showMsg(""); Promise.resolve().then(task).catch(err=>showMsg(err.message||"Não foi possível concluir.")).finally(()=>btn.disabled=false); }
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
document.querySelectorAll("[data-eye]").forEach(btn=>btn.addEventListener("click",()=>{const input=$(btn.dataset.eye);input.type=input.type==="password"?"text":"password";}));
$("loginForm").addEventListener("submit",e=>{e.preventDefault();run(e.target,async()=>{const p=await Auth.login($("loginEmail").value,$("loginSenha").value);location.replace(Auth.home(p.role));});});
$("registerForm").addEventListener("submit",e=>{e.preventDefault();run(e.target,async()=>{if($("regSenha").value!==$("regSenha2").value)throw new Error("As senhas não conferem.");const p=await Auth.registerUser({nome:$("regNome").value,email:$("regEmail").value,telefone:$("regTelefone").value,senha:$("regSenha").value});if(p.confirmationRequired){showMsg("Cadastro iniciado! Confirme o e-mail enviado pelo Supabase e depois faça login.",true);switchTab("login");return;}location.replace(Auth.home(p.role));});});
// A criação pública de administrador foi desativada. Cadastre a conta normalmente e promova-a manualmente no SQL Editor.
const setup=$("setupPanel"); if(setup) setup.classList.add("hidden");
const panel=$("authPanel"); if(panel) panel.classList.remove("hidden");
if(location.hash==="#cadastro") switchTab("register");
