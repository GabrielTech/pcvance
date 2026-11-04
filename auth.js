"use strict";
/* PCVANCE — autenticação compartilhada (login.html, admin.html, cliente.html)
   Perfis: "admin" (painel de OS) e "user" (área do cliente).
   ATENÇÃO: tudo fica no localStorage do navegador. Serve para organizar o acesso,
   mas NÃO é segurança real. Para segurança de verdade é preciso um servidor (PHP/MySQL). */
const Auth = (() => {
  const USERS_KEY = "pcvance_users_v1";
  const SESSION_KEY = "pcvance_session_v1";
  const LOCK_KEY = "pcvance_lock_v2";
  const CODE_KEY = "pcvance_emailcode_v1";
  const SESSION_HOURS = 8;
  const ADMIN_SESSION_HOURS = 4;     // sessão do administrador é mais curta
  const ADMIN_IDLE_MINUTES = 30;     // admin parado por 30 min é desconectado
  const MAX_ATTEMPTS = 5;
  const LOCK_SECONDS = 60;           // dobra a cada novo bloqueio (máx. 15 min)
  const MAX_LOCK_SECONDS = 900;
  const ITERATIONS = 100000;
  const CODE_MINUTES = 10;
  const CODE_MAX_TRIES = 5;
  const CODE_RESEND_SECONDS = 30;

  /* ============================================================
     VERIFICAÇÃO DE E-MAIL POR CÓDIGO (opcional, via EmailJS)
     Para o site ENVIAR um código de 6 dígitos ao e-mail do cliente,
     crie uma conta grátis em https://www.emailjs.com e preencha abaixo.
     Passo a passo completo no arquivo LEIA-ME.txt.
     Deixe vazio ("") para usar só a checagem automática do e-mail.
     ============================================================ */
  const EMAILJS = {
    serviceId: "",   // ex.: "service_abc123"
    templateId: "",  // ex.: "template_xyz789"
    publicKey: ""    // ex.: "AbCdEfGhIjKlMnOp"
  };

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

  const COMMON_PASSWORDS = ["12345678", "123456789", "1234567890", "senha123", "password", "password1",
    "qwerty123", "abc12345", "11111111", "00000000", "admin123", "pcvance123", "pcvance2026", "mudar123", "brasil123"];

  function checkPassword(senha, role = "user", email = "") {
    senha = String(senha || "");
    const min = role === "admin" ? 10 : 8;
    if (senha.length < min) throw new Error(`A senha deve ter pelo menos ${min} caracteres.`);
    if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) throw new Error("A senha deve ter letras e números.");
    if (role === "admin" && (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha))) {
      throw new Error("A senha do administrador precisa de letras maiúsculas e minúsculas.");
    }
    if (COMMON_PASSWORDS.includes(senha.toLowerCase())) throw new Error("Essa senha é muito comum. Escolha outra.");
    const local = normEmail(email).split("@")[0];
    if (local.length >= 4 && senha.toLowerCase().includes(local)) throw new Error("A senha não pode conter o seu e-mail.");
    if (/^(.)\1+$/.test(senha)) throw new Error("A senha não pode ser só um caractere repetido.");
  }

  // Comparação sem atalho (dificulta ataques por tempo de resposta)
  function safeEqual(a, b) {
    a = String(a); b = String(b);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
  }

  /* ---------- Verificação de e-mail ---------- */
  const DISPOSABLE = new Set(["mailinator.com", "10minutemail.com", "10minutemail.net", "guerrillamail.com",
    "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "tempmail.com", "temp-mail.org", "temp-mail.io",
    "tempmail.net", "throwawaymail.com", "yopmail.com", "yopmail.net", "trashmail.com", "trashmail.net",
    "getnada.com", "nada.email", "maildrop.cc", "dispostable.com", "fakeinbox.com", "mailnesia.com",
    "mohmal.com", "emailondeck.com", "mintemail.com", "spamgourmet.com", "tempinbox.com", "mytemp.email",
    "burnermail.io", "discard.email", "mailcatch.com", "moakt.com", "tmail.ws", "tmpmail.org", "tmpmail.net",
    "33mail.com", "inboxkitten.com", "anonbox.net", "dropmail.me", "emailfake.com", "fakemail.net", "luxusmail.org"]);

  const DOMAIN_TYPOS = {
    "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.con": "gmail.com", "gmail.co": "gmail.com",
    "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.com.br": "gmail.com",
    "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmaill.com": "hotmail.com",
    "outlok.com": "outlook.com", "outlook.con": "outlook.com", "outllok.com": "outlook.com",
    "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "yaoo.com": "yahoo.com",
    "icloud.con": "icloud.com", "iclod.com": "icloud.com"
  };

  const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

  function checkEmailFormat(email) {
    email = normEmail(email);
    if (email.length > 254 || !EMAIL_RE.test(email) || email.includes("..")) throw new Error("Informe um e-mail válido.");
    const domain = email.split("@")[1];
    if (DOMAIN_TYPOS[domain]) throw new Error(`O domínio "${domain}" parece errado. Você quis dizer ${email.split("@")[0]}@${DOMAIN_TYPOS[domain]}?`);
    if (DISPOSABLE.has(domain)) throw new Error("E-mails temporários não são aceitos. Use seu e-mail pessoal ou profissional.");
    return { email, domain };
  }

  async function dnsQuery(domain, type) {
    const urls = [
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`
    ];
    for (const url of urls) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(url, { headers: { accept: "application/dns-json" }, signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) return await res.json();
      } catch { /* tenta o próximo servidor */ }
    }
    return null; // sem resposta (offline, bloqueado...)
  }

  // Confere se o domínio do e-mail existe e recebe mensagens (registro MX).
  // Retorna "ok", "invalido" ou "desconhecido" (quando não deu para consultar).
  async function checkEmailDomain(domain) {
    const mx = await dnsQuery(domain, 15);
    if (!mx) return "desconhecido";
    if (mx.Status === 3) return "invalido"; // NXDOMAIN: domínio não existe
    const records = (mx.Answer || []).filter((a) => a.type === 15);
    if (records.length) {
      const onlyNull = records.every((a) => /^\s*0\s+\.?\s*$/.test(String(a.data)));
      return onlyNull ? "invalido" : "ok";
    }
    const a = await dnsQuery(domain, 1); // sem MX: o servidor de e-mail pode ser o próprio domínio
    if (!a) return "desconhecido";
    return (a.Answer || []).some((r) => r.type === 1) ? "ok" : "invalido";
  }

  // Validação completa (formato + domínio real). Lança Error com mensagem amigável.
  async function checkEmail(email) {
    const { email: clean, domain } = checkEmailFormat(email);
    const status = await checkEmailDomain(domain);
    if (status === "invalido") throw new Error(`O domínio "${domain}" não existe ou não recebe e-mails. Confira o endereço digitado.`);
    return { email: clean, domainChecked: status === "ok" };
  }

  const emailCodeEnabled = () => !!(EMAILJS.serviceId && EMAILJS.templateId && EMAILJS.publicKey);

  async function sendEmailCode(email, nome) {
    email = normEmail(email);
    const prev = readJSON(sessionStorage, CODE_KEY, null);
    if (prev && prev.email === email && prev.sentAt && Date.now() - prev.sentAt < CODE_RESEND_SECONDS * 1000) {
      const wait = Math.ceil((CODE_RESEND_SECONDS * 1000 - (Date.now() - prev.sentAt)) / 1000);
      throw new Error(`Aguarde ${wait}s para pedir um novo código.`);
    }
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const code = String(arr[0] % 1000000).padStart(6, "0");
    const salt = randomSalt();

    let res;
    try {
      res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: EMAILJS.serviceId, template_id: EMAILJS.templateId, user_id: EMAILJS.publicKey,
          template_params: { to_email: email, nome: String(nome || "").trim(), code, validade: `${CODE_MINUTES} minutos` }
        })
      });
    } catch { throw new Error("Não foi possível enviar o código agora. Verifique sua conexão e tente de novo."); }
    if (!res.ok) throw new Error("Não foi possível enviar o código para esse e-mail. Confira o endereço e tente de novo.");

    sessionStorage.setItem(CODE_KEY, JSON.stringify({
      email, salt, hash: await hashPassword(code, salt),
      exp: Date.now() + CODE_MINUTES * 60 * 1000, tries: 0, sentAt: Date.now()
    }));
  }

  async function verifyEmailCode(email, code) {
    const rec = readJSON(sessionStorage, CODE_KEY, null);
    if (!rec || rec.email !== normEmail(email)) throw new Error("Peça um novo código para continuar.");
    if (rec.exp < Date.now()) { sessionStorage.removeItem(CODE_KEY); throw new Error("O código expirou. Peça um novo."); }
    if (rec.tries >= CODE_MAX_TRIES) { sessionStorage.removeItem(CODE_KEY); throw new Error("Muitas tentativas erradas. Peça um novo código."); }
    const typed = String(code || "").replace(/\D/g, "");
    if (typed.length !== 6) throw new Error("Digite os 6 números do código.");
    if (!safeEqual(await hashPassword(typed, rec.salt), rec.hash)) {
      rec.tries += 1;
      sessionStorage.setItem(CODE_KEY, JSON.stringify(rec));
      throw new Error(`Código incorreto. Tentativas restantes: ${Math.max(0, CODE_MAX_TRIES - rec.tries)}.`);
    }
    sessionStorage.removeItem(CODE_KEY);
    return true;
  }

  async function createUser(role, { nome, email, telefone, senha }) {
    nome = String(nome || "").trim();
    email = normEmail(email);
    telefone = String(telefone || "").trim();
    if (nome.length < 2) throw new Error("Informe seu nome.");
    checkEmailFormat(email);
    checkPassword(senha, role, email);
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
    const hours = user.role === "admin" ? ADMIN_SESSION_HOURS : SESSION_HOURS;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id, role: user.role, exp: Date.now() + hours * 3600 * 1000, last: Date.now()
    }));
  }

  // Bloqueio por e-mail: errar a senha de uma conta não trava as outras.
  const readLocks = () => { const l = readJSON(localStorage, LOCK_KEY, {}); return l && typeof l === "object" && !Array.isArray(l) ? l : {}; };

  async function login(email, senha) {
    const key = normEmail(email);
    const locks = readLocks();
    const lock = locks[key] || { count: 0, until: 0, level: 0 };
    if (lock.until > Date.now()) {
      throw new Error(`Muitas tentativas. Aguarde ${Math.ceil((lock.until - Date.now()) / 1000)}s para tentar de novo.`);
    }

    const user = getUsers().find((u) => u.email === key);
    // Mesmo que o e-mail não exista, faz o cálculo do hash (não revela quais contas existem)
    const hash = await hashPassword(String(senha || ""), user ? user.salt : "00000000000000000000000000000000");

    if (!user || !safeEqual(hash, user.hash)) {
      lock.count = (lock.count || 0) + 1;
      if (lock.count >= MAX_ATTEMPTS) {
        lock.level = (lock.level || 0) + 1;
        lock.until = Date.now() + Math.min(MAX_LOCK_SECONDS, LOCK_SECONDS * 2 ** (lock.level - 1)) * 1000;
        lock.count = 0;
      }
      locks[key] = lock;
      localStorage.setItem(LOCK_KEY, JSON.stringify(locks));
      throw new Error("E-mail ou senha incorretos.");
    }

    delete locks[key];
    localStorage.setItem(LOCK_KEY, JSON.stringify(locks));
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
    if (role === "admin") watchIdle();
    document.documentElement.style.visibility = "visible";
    return user;
  }

  // Desconecta o administrador após um tempo sem uso
  function watchIdle() {
    const touch = () => {
      const s = readJSON(sessionStorage, SESSION_KEY, null);
      if (s) { s.last = Date.now(); sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
    };
    let throttle = 0;
    ["click", "keydown", "mousemove", "touchstart"].forEach((ev) =>
      document.addEventListener(ev, () => { if (Date.now() - throttle > 15000) { throttle = Date.now(); touch(); } }, { passive: true }));
    setInterval(() => {
      const s = readJSON(sessionStorage, SESSION_KEY, null);
      if (!s || Date.now() - (s.last || 0) > ADMIN_IDLE_MINUTES * 60 * 1000) {
        sessionStorage.removeItem(SESSION_KEY);
        location.replace("login.html");
      }
    }, 30000);
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
    if (!safeEqual(await hashPassword(String(atual || ""), user.salt), user.hash)) throw new Error("A senha atual está incorreta.");
    checkPassword(nova, user.role, user.email);
    user.salt = randomSalt();
    user.hash = await hashPassword(nova, user.salt);
    saveUsers(users);
  }

  const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

  return {
    hasAdmin, registerAdmin, registerUser, login, logout, currentUser, requireRole,
    home, updateProfile, changePassword, normEmail, normPhone, initials,
    checkEmail, emailCodeEnabled, sendEmailCode, verifyEmailCode
  };
})();
