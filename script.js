/* PCVance — interações do site
   IMPORTANTE: substitua o número abaixo pelo WhatsApp comercial.
   Use código do país + DDD + número, somente dígitos.
   Exemplo de formato: 5587999999999
*/
const PCVANCE_WHATSAPP = "5587999034059"; // TROQUE PELO NÚMERO REAL

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");
  const contactForm = document.getElementById("contactForm");
  const serviceSelect = document.getElementById("servico");
  const feedback = document.getElementById("formFeedback");

  // Menu para celular
  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.innerHTML = isOpen
        ? '<i class="fa-solid fa-xmark"></i>'
        : '<i class="fa-solid fa-bars"></i>';
    });

    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
      });
    });
  }

  // Preenche o serviço no formulário ao clicar em um cartão
  document.querySelectorAll("[data-service]").forEach((link) => {
    link.addEventListener("click", () => {
      const service = link.dataset.service;
      if (serviceSelect) {
        const option = Array.from(serviceSelect.options).find((item) => item.value === service || item.text === service);
        if (option) serviceSelect.value = option.value || option.text;
      }
    });
  });

  // Ano automático no rodapé
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Formulário: prepara mensagem e abre o WhatsApp
  if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;

      const name = document.getElementById("nome").value.trim();
      const phone = document.getElementById("telefone").value.trim();
      const equipment = document.getElementById("equipamento").value;
      const service = serviceSelect.value;
      const message = document.getElementById("mensagem").value.trim();

      const text = [
        "Olá! Vim pelo site da PCVance e gostaria de solicitar um orçamento.",
        "",
        `Nome: ${name}`,
        phone ? `Meu WhatsApp: ${phone}` : "",
        `Equipamento: ${equipment}`,
        `Serviço: ${service}`,
        `Descrição: ${message}`
      ].filter(Boolean).join("\n");

      const number = PCVANCE_WHATSAPP.replace(/\D/g, "");
      if (!number || number === "5587999999999") {
        feedback.textContent = "O formulário está pronto, mas o número de WhatsApp ainda é um exemplo. Abra o script.js e configure PCVANCE_WHATSAPP com seu número real.";
        feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }

      const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      feedback.textContent = "Mensagem preparada! Se o WhatsApp não abriu, verifique se o navegador bloqueou a nova janela.";
    });
  }

  // Link flutuante leva ao formulário para que o contato seja preenchido corretamente
  const floatingWhatsapp = document.getElementById("floatingWhatsapp");
  if (floatingWhatsapp) floatingWhatsapp.href = "#contato";

  // Se já estiver logado, o botão do menu vira "Minha área"
  try {
    const session = JSON.parse(sessionStorage.getItem("pcvance_session_v1") || "null");
    const navLogin = document.getElementById("navLogin");
    if (session && session.exp > Date.now() && navLogin) {
      navLogin.href = session.role === "admin" ? "admin.html" : "cliente.html";
      navLogin.innerHTML = '<i class="fa-solid fa-user"></i> Minha área';
    }
  } catch {}
});
