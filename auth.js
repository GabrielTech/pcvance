/* PCVANCE — autenticação Supabase. A chave publishable é pública; nunca coloque service_role aqui. */
"use strict";
const SUPABASE_URL = "https://zriwwzcxsetvcbswxnxx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LBOI8-tFTMxldGLQ1_m7Qw_UXgaVrl3";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const Auth = (() => {
  const CACHE = "pcvance_profile_cache_v1";
  const normEmail = e => String(e || "").trim().toLowerCase();
  const normPhone = p => String(p || "").replace(/\D/g, "");
  const initials = name => String(name || "?").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "?";
  const home = role => role === "admin" ? "admin.html" : "cliente.html";
  function cacheProfile(p) { if (p) localStorage.setItem(CACHE, JSON.stringify(p)); }
  function cachedProfile() { try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch { return null; } }
  async function profileFor(user) {
    const { data, error } = await sb.from("profiles").select("id,nome,email,telefone,tipo,created_at").eq("id", user.id).single();
    if (error) throw new Error("Conta autenticada, mas não foi possível carregar o perfil: " + error.message);
    const p = { ...data, role: data.tipo === "admin" ? "admin" : "user" };
    cacheProfile(p); return p;
  }
  async function registerUser({nome,email,telefone,senha}) {
    nome = String(nome || "").trim(); email = normEmail(email); telefone = String(telefone || "").trim();
    if (nome.length < 2) throw new Error("Informe seu nome completo.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
    if (String(senha || "").length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
    if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) throw new Error("A senha precisa conter letras e números.");
    const { data, error } = await sb.auth.signUp({
      email, password: senha,
      options: { data: { nome, telefone, tipo: "user" } }
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error("O Supabase não retornou os dados da conta.");
    if (!data.session) return { confirmationRequired: true, email };
    const p = await profileFor(data.user); return p;
  }
  async function login(email, senha) {
    const { data, error } = await sb.auth.signInWithPassword({ email: normEmail(email), password: senha });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
    if (!data.user) throw new Error("Não foi possível iniciar a sessão.");
    return await profileFor(data.user);
  }
  async function currentProfile() {
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return null;
    return await profileFor(user);
  }
  function currentUser() { return cachedProfile(); }
  function requireRole(role) {
    const p = cachedProfile();
    if (!p) { location.replace("login.html"); return null; }
    if (p.role !== role) { location.replace(home(p.role)); return null; }
    document.documentElement.style.visibility = "visible";
    return p;
  }
  async function logout() { localStorage.removeItem(CACHE); await sb.auth.signOut(); location.replace("login.html"); }
  async function updateProfile(id, {nome,telefone}) {
    nome = String(nome || "").trim(); if (nome.length < 2) throw new Error("Informe seu nome.");
    const {data,error} = await sb.from("profiles").update({nome,telefone:String(telefone||"").trim()}).eq("id",id).select().single();
    if(error) throw new Error(error.message);
    const p={...data,role:data.tipo === "admin" ? "admin":"user"}; cacheProfile(p); return p;
  }
  async function changePassword(id, atual, nova) {
    if (String(nova||"").length < 8 || !/[A-Za-z]/.test(nova) || !/\d/.test(nova)) throw new Error("A nova senha deve ter pelo menos 8 caracteres e conter letras e números.");
    const {error}=await sb.auth.updateUser({password:nova}); if(error) throw new Error(error.message);
  }
  async function resetPassword(email) { const {error}=await sb.auth.resetPasswordForEmail(normEmail(email),{redirectTo:location.origin+location.pathname.replace(/[^/]*$/,"login.html")}); if(error) throw new Error(error.message); }
  async function hasAdmin() { const {count,error}=await sb.from("profiles").select("id",{count:"exact",head:true}).eq("tipo","admin"); if(error) throw error; return (count||0)>0; }
  return { sb, normEmail,normPhone,initials,home,registerUser,login,currentUser,currentProfile,requireRole,logout,updateProfile,changePassword,resetPassword,hasAdmin };
})();
