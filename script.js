// MENU MOBILE

const menuBtn = document.getElementById("menuBtn");
const menu = document.getElementById("menu");

menuBtn.addEventListener("click", () => {

    menu.classList.toggle("active");

});


// FECHAR MENU AO CLICAR EM UM LINK

const menuLinks = document.querySelectorAll("#menu a");

menuLinks.forEach(link => {

    link.addEventListener("click", () => {

        menu.classList.remove("active");

    });

});


// ANO AUTOMÁTICO NO RODAPÉ

document.getElementById("year").textContent =
    new Date().getFullYear();


// ANIMAÇÃO AO APARECER NA TELA

const cards = document.querySelectorAll(
    ".service-card, .process-item"
);

const observer = new IntersectionObserver(
    entries => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";

            }

        });

    },
    {
        threshold: 0.15
    }
);


cards.forEach(card => {

    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "0.6s ease";

    observer.observe(card);

});
