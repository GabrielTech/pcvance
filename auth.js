"use strict";
/* PCVANCE — autenticação compartilhada (login.html, admin.html, cliente.html)
   Perfis: "admin" (painel de OS) e "user" (área do cliente).
   ATENÇÃO: tudo fica no localStorage do navegador. Serve para organizar o acesso,
   mas NÃO é segurança real. Para segurança de verdade é preciso um servidor (PHP/MySQL). */
const Auth = (() => {
  const USERS_KEY = "pcvance_users_v1";
  const SESSION_KEY = "pcvance_session_v1";
  const LOCK_KEY = "pcvance_lock_v1";
  const SESSION_HOURS = 8;
  const MAX_ATTEMPTS = 5;
  const LOCK_SECONDS = 60;
  const ITERATIONS = 100000;

  const readJSON = (storage, key, fallback) => {
    try { const v = JSON.parse(storage.getItem(key)); return v ?? fallback; }
    catch { return fallback; }
  };

  const getUsers = () => {
    const list = readJSON(localStorage, USERS_KEY, []);
    return Array.isArray(list) ? list : [];
  };
  const saveUsers = (list) => localStorage.setItem(USERS_KEY, JSON.stringify(list));
  const normEmail = (e) => String(e || "").trim().toLowerCase();
  const normPhone = (p) => String(p || "").replace(/\D/g, "");
  const hasAdmin = () => getUsers().some((u) => u.role === "admin");
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const randomSalt = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return toHex(a); };

  async function hashPassword(password, salt) {
    if (window.crypto && crypto.subtle) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: enc.encode(salt), iterations: ITERATIONS, hash: "SHA-256" }, key, 256
      );
      return "pbkdf2$" + toHex(bits);
    }
    // Plano B para navegadores sem crypto.subtle (hash fraco)
    let h = 5381;
    const s = salt + password;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return "weak$" + (h >>> 0).toString(16);
  }

  function checkPassword(senha) {
    if (String(senha || "").length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
  }

  async function createUser(role, { nome, email, telefone, senha }) {
    nome = String(nome || "").trim();
    email = normEmail(email);
    telefone = String(telefone || "").trim();
    if (nome.length < 2) throw new Error("Informe seu nome.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
    checkPassword(senha);
    if (role === "admin" && hasAdmin()) throw new Error("Já existe um administrador cadastrado.");

    const users = getUsers();
    if (users.some((u) => u.email === email)) throw new Error("Este e-mail já está cadastrado.");

    const salt = randomSalt();
    const user = {
      id: uid(), role, nome, email, telefone, salt,
      hash: await hashPassword(senha, salt),
      criadoEm: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);
    return user;
  }

  const registerAdmin = (data) => createUser("admin", data);
  const registerUser = (data) => createUser("user", data);

  function startSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id, role: user.role, exp: Date.now() + SESSION_HOURS * 3600 * 1000
    }));
  }

  async function login(email, senha) {
    const lock = readJSON(localStorage, LOCK_KEY, { count: 0, until: 0 });
    if (lock.until > Date.now()) {
      throw new Error(`Muitas tentativas. Aguarde ${Math.ceil((lock.until - Date.now()) / 1000)}s para tentar de novo.`);
    }

    const user = getUsers().find((u) => u.email === normEmail(email));
    const hash = user ? await hashPassword(String(senha || ""), user.salt) : null;

    if (!user || hash !== user.hash) {
      lock.count = (lock.count || 0) + 1;
      if (lock.count >= MAX_ATTEMPTS) { lock.until = Date.now() + LOCK_SECONDS * 1000; lock.count = 0; }
      localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
      throw new Error("E-mail ou senha incorretos.");
    }

    localStorage.removeItem(LOCK_KEY);
    startSession(user);
    return user;
  }

  function currentUser() {
    const s = readJSON(sessionStorage, SESSION_KEY, null);
    if (!s || s.exp < Date.now()) { sessionStorage.removeItem(SESSION_KEY); return null; }
    const user = getUsers().find((u) => u.id === s.id);
    if (!user || user.role !== s.role) { sessionStorage.removeItem(SESSION_KEY); return null; }
    return user;
  }

  const home = (role) => (role === "admin" ? "admin.html" : "cliente.html");

  // Protege uma página: só deixa entrar quem tem o perfil certo
  function requireRole(role) {
    const user = currentUser();
    if (!user) { location.replace("login.html"); return null; }
    if (user.role !== role) { location.replace(home(user.role)); return null; }
    document.documentElement.style.visibility = "visible";
    return user;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    location.replace("login.html");
  }

  function updateProfile(id, { nome, telefone }) {
    const users = getUsers();
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error("Usuário não encontrado.");
    nome = String(nome || "").trim();
    if (nome.length < 2) throw new Error("Informe seu nome.");
    user.nome = nome;
    user.telefone = String(telefone || "").trim();
    saveUsers(users);
    return user;
  }

  async function changePassword(id, atual, nova) {
    const users = getUsers();
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error("Usuário não encontrado.");
    if ((await hashPassword(String(atual || ""), user.salt)) !== user.hash) throw new Error("A senha atual está incorreta.");
    checkPassword(nova);
    user.salt = randomSalt();
    user.hash = await hashPassword(nova, user.salt);
    saveUsers(users);
  }

  const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

  return {
    hasAdmin, registerAdmin, registerUser, login, logout, currentUser, requireRole,
    home, updateProfile, changePassword, normEmail, normPhone, initials
  };
})();
