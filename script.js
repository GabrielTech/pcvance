/* =====================================================
VANLOC - script.js
=====================================================
Arquivo único com toda a lógica do site:
1) Camada de dados (localStorage) compartilhada entre
   index.html e dashboard.html
2) Lógica da página principal (index.html)
3) Lógica do Painel do Motorista (dashboard.html)

Cada bloco só executa código que depende do DOM quando
os elementos daquela página realmente existem, então
este mesmo arquivo pode ser incluído tanto no
index.html quanto no dashboard.html sem gerar erros.
===================================================== */


/* =====================================================
VANLOC - CAMADA DE DADOS (localStorage)
=====================================================
Este arquivo centraliza a leitura/escrita dos dados que
precisam ser compartilhados entre o site principal
(index.html) e o Painel do Motorista (dashboard.html).

Como o VANLOC ainda não tem um backend, os dados ficam
salvos no localStorage do navegador. Isso é suficiente
para o motorista cadastrar seus planos no painel e o
cliente ver esses mesmos planos no site, desde que os
dois estejam no mesmo domínio (o que acontece quando o
site é publicado, ex: vanloc.vercel.app).
===================================================== */


const VANLOC_CHAVES = {

    MOTORISTAS: "vanloc_motoristas",

    VIAGENS: "vanloc_viagens",

    SESSAO: "vanloc_sessao_motorista"

};


const VANLOC_LIMITE_PLANOS = 3;

const VANLOC_VALOR_MINIMO_PLANO = 20;



/* =====================================================
LEITURA / ESCRITA BÁSICA
===================================================== */


function vlGetMotoristas() {

    try {

        return (
            JSON.parse(
                localStorage.getItem(VANLOC_CHAVES.MOTORISTAS)
            ) || {}
        );

    } catch (erro) {

        return {};

    }

}


function vlSalvarMotoristas(motoristas) {

    localStorage.setItem(
        VANLOC_CHAVES.MOTORISTAS,
        JSON.stringify(motoristas)
    );

}


function vlGetViagens() {

    try {

        return (
            JSON.parse(
                localStorage.getItem(VANLOC_CHAVES.VIAGENS)
            ) || []
        );

    } catch (erro) {

        return [];

    }

}


function vlSalvarViagens(viagens) {

    localStorage.setItem(
        VANLOC_CHAVES.VIAGENS,
        JSON.stringify(viagens)
    );

}


function vlGetSessaoMotorista() {

    return localStorage.getItem(VANLOC_CHAVES.SESSAO);

}


function vlSalvarSessaoMotorista(email) {

    localStorage.setItem(VANLOC_CHAVES.SESSAO, email);

}


function vlEncerrarSessaoMotorista() {

    localStorage.removeItem(VANLOC_CHAVES.SESSAO);

}



/* =====================================================
MOTORISTA: BUSCAR / SALVAR
===================================================== */


function vlNormalizarEmail(email) {

    return (email || "").trim().toLowerCase();

}


function vlGetMotorista(email) {

    const motoristas = vlGetMotoristas();

    return motoristas[vlNormalizarEmail(email)] || null;

}


function vlSalvarMotorista(dadosMotorista) {

    const motoristas = vlGetMotoristas();

    const email = vlNormalizarEmail(dadosMotorista.email);

    const existente = motoristas[email];


    motoristas[email] = {

        nome: dadosMotorista.nome,

        telefone: dadosMotorista.telefone,

        email: email,

        cpf: dadosMotorista.cpf,

        modeloVan: dadosMotorista.modeloVan,

        placaVan: dadosMotorista.placaVan,

        lugaresVan: dadosMotorista.lugaresVan,

        /* mantém os planos já existentes do motorista */
        planos:
            existente && existente.planos ?
            existente.planos :
            []

    };


    vlSalvarMotoristas(motoristas);

    return motoristas[email];

}



/* =====================================================
VIAGENS: ADICIONAR / LISTAR POR MOTORISTA
===================================================== */


function vlAdicionarViagem(viagem) {

    const viagens = vlGetViagens();


    const novaViagem = {

        id: "v_" + Date.now(),

        motoristaEmail: vlNormalizarEmail(viagem.motoristaEmail),

        origem: viagem.origem,

        destino: viagem.destino,

        data: viagem.data,

        horario: viagem.horario,

        valor: Number(viagem.valor) || 0,

        vagas: viagem.vagas,

        criadaEm: Date.now()

    };


    viagens.push(novaViagem);

    vlSalvarViagens(viagens);

    return novaViagem;

}


function vlGetViagensDoMotorista(email) {

    const emailNormalizado = vlNormalizarEmail(email);

    return vlGetViagens()
        .filter(v => v.motoristaEmail === emailNormalizado);

}



/* =====================================================
PLANOS: CRIAR / EDITAR / REMOVER
===================================================== */


function vlGetPlanosOrdenados(email) {

    const motorista = vlGetMotorista(email);


    if (!motorista || !motorista.planos) {

        return [];

    }


    /* do mais caro para o mais barato */

    return [...motorista.planos].sort(
        (a, b) => Number(b.valor) - Number(a.valor)
    );

}


function vlSalvarPlano(email, plano) {

    const motoristas = vlGetMotoristas();

    const emailNormalizado = vlNormalizarEmail(email);

    const motorista = motoristas[emailNormalizado];


    if (!motorista) {

        return {
            ok: false,
            mensagem: "Motorista não encontrado."
        };

    }


    if (Number(plano.valor) < VANLOC_VALOR_MINIMO_PLANO) {

        return {

            ok: false,

            mensagem:
                "O valor mínimo do plano é R$ " +
                VANLOC_VALOR_MINIMO_PLANO.toFixed(2).replace(".", ",") +
                " por viagem."

        };

    }


    const jaExiste =
        plano.id &&
        motorista.planos.some(p => p.id === plano.id);


    if (
        !jaExiste &&
        motorista.planos.length >= VANLOC_LIMITE_PLANOS
    ) {

        return {

            ok: false,

            mensagem:
                "Você já atingiu o limite de " +
                VANLOC_LIMITE_PLANOS +
                " planos."

        };

    }


    if (jaExiste) {

        motorista.planos = motorista.planos.map(function(p) {

            if (p.id === plano.id) {

                return {

                    ...p,

                    nome: plano.nome,

                    valor: Number(plano.valor),

                    quantidade: plano.quantidade,

                    vantagens: plano.vantagens

                };

            }

            return p;

        });

    }

    else {

        motorista.planos.push({

            id: "p_" + Date.now(),

            nome: plano.nome,

            valor: Number(plano.valor),

            quantidade: plano.quantidade,

            vantagens: plano.vantagens

        });

    }


    motoristas[emailNormalizado] = motorista;

    vlSalvarMotoristas(motoristas);


    return {
        ok: true,
        motorista: motorista
    };

}


function vlRemoverPlano(email, planoId) {

    const motoristas = vlGetMotoristas();

    const emailNormalizado = vlNormalizarEmail(email);

    const motorista = motoristas[emailNormalizado];


    if (!motorista) {

        return;

    }


    motorista.planos = motorista.planos.filter(
        p => p.id !== planoId
    );


    motoristas[emailNormalizado] = motorista;

    vlSalvarMotoristas(motoristas);

}



/* =====================================================
DADOS DE DEMONSTRAÇÃO (primeiro acesso)
=====================================================
Preenche os 3 motoristas que já aparecem nos cards
estáticos da página inicial, para que o botão
"Consultar planos" funcione de verdade mesmo antes de
qualquer cadastro novo.
===================================================== */


function vlSemearDadosIniciais() {

    const motoristas = vlGetMotoristas();


    if (Object.keys(motoristas).length > 0) {

        return;

    }


    const demo = {

        "charles@vanloc.com": {

            nome: "Charles Fernando",

            telefone: "(87) 90000-0001",

            email: "charles@vanloc.com",

            cpf: "",

            modeloVan: "",

            placaVan: "",

            lugaresVan: "",

            planos: [

                {

                    id: "p_demo_1",

                    nome: "Plano Frequente",

                    valor: 25,

                    quantidade: 10,

                    vantagens: [

                        "Prioridade nas reservas",

                        "Desconto nas viagens",

                        "Atendimento prioritário"

                    ]

                },

                {

                    id: "p_demo_2",

                    nome: "Plano Básico",

                    valor: 20,

                    quantidade: 4,

                    vantagens: [

                        "Reserva antecipada",

                        "Suporte pela VANLOC"

                    ]

                }

            ]

        },


        "joao@vanloc.com": {

            nome: "João Martins",

            telefone: "(87) 90000-0002",

            email: "joao@vanloc.com",

            cpf: "",

            modeloVan: "",

            placaVan: "",

            lugaresVan: "",

            planos: [

                {

                    id: "p_demo_3",

                    nome: "Plano Mensal",

                    valor: 22,

                    quantidade: 8,

                    vantagens: [

                        "Vaga garantida",

                        "Suporte pela VANLOC"

                    ]

                }

            ]

        },


        "marcos@vanloc.com": {

            nome: "Marcos Silva",

            telefone: "(87) 90000-0003",

            email: "marcos@vanloc.com",

            cpf: "",

            modeloVan: "",

            placaVan: "",

            lugaresVan: "",

            planos: [

                {

                    id: "p_demo_4",

                    nome: "Plano Premium",

                    valor: 30,

                    quantidade: 12,

                    vantagens: [

                        "Prioridade máxima",

                        "Descontos especiais",

                        "Benefícios exclusivos"

                    ]

                },

                {

                    id: "p_demo_5",

                    nome: "Plano Econômico",

                    valor: 20,

                    quantidade: 4,

                    vantagens: [

                        "Ideal para viagens ocasionais"

                    ]

                }

            ]

        }

    };


    vlSalvarMotoristas(demo);


    vlSalvarViagens([

        {
            id: "v_demo_1",
            motoristaEmail: "charles@vanloc.com",
            origem: "Serra Talhada",
            destino: "Recife",
            data: "2026-09-15",
            horario: "06:30",
            valor: 80,
            vagas: 12,
            criadaEm: Date.now()
        },

        {
            id: "v_demo_2",
            motoristaEmail: "joao@vanloc.com",
            origem: "Recife",
            destino: "Caruaru",
            data: "2026-09-16",
            horario: "08:00",
            valor: 45,
            vagas: 12,
            criadaEm: Date.now()
        },

        {
            id: "v_demo_3",
            motoristaEmail: "marcos@vanloc.com",
            origem: "Serra Talhada",
            destino: "Petrolina",
            data: "2026-09-17",
            horario: "05:00",
            valor: 100,
            vagas: 12,
            criadaEm: Date.now()
        }

    ]);

}


vlSemearDadosIniciais();


/* =====================================================
MODAIS
===================================================== */


function abrirLogin() {

    document.getElementById("modalLogin").style.display = "block";

}


function fecharLogin() {

    document.getElementById("modalLogin").style.display = "none";

}


function abrirMotorista() {

    document.getElementById("modalMotorista").style.display = "block";

}


function fecharMotorista() {

    document.getElementById("modalMotorista").style.display = "none";

}


function fecharReserva() {

    document.getElementById("modalReserva").style.display = "none";

}


function fecharPlanos() {

    document.getElementById("modalPlanos").style.display = "none";

}



/* =====================================================
FECHAR MODAL CLICANDO FORA
===================================================== */


window.onclick = function(event) {

    const modais = document.querySelectorAll(".modal");

    modais.forEach(function(modal) {

        if (event.target === modal) {

            modal.style.display = "none";

        }

    });

};



/* =====================================================
NOTIFICAÇÃO
===================================================== */


function mostrarNotificacao(mensagem) {

    const notificacao =
        document.getElementById("notificacao");

    const texto =
        document.getElementById("mensagemNotificacao");


    texto.innerText = mensagem;

    notificacao.style.display = "flex";


    setTimeout(function() {

        notificacao.style.display = "none";

    }, 4000);

}



/* =====================================================
LOGIN
===================================================== */


const vlFormLogin =
    document.getElementById("formLogin");

if (vlFormLogin) {

vlFormLogin
.addEventListener("submit", function(event) {

    event.preventDefault();


    fecharLogin();


    mostrarNotificacao(
        "Login realizado com sucesso!"
    );

});

}



/* =====================================================
CADASTRO DO PASSAGEIRO
===================================================== */


const vlFormCadastroPassageiro =
    document.getElementById("formCadastroPassageiro");

if (vlFormCadastroPassageiro) {

vlFormCadastroPassageiro
.addEventListener("submit", function(event) {

    event.preventDefault();


    const nome =
        document
        .getElementById("passageiroNome")
        .value;


    const senha =
        document
        .getElementById("passageiroSenha")
        .value;


    const confirmarSenha =
        document
        .getElementById("passageiroConfirmarSenha")
        .value;


    if (senha !== confirmarSenha) {

        mostrarNotificacao(
            "As senhas não coincidem!"
        );

        return;

    }


    const passageiro = {

        nome: nome,

        email:
            document
            .getElementById("passageiroEmail")
            .value,

        telefone:
            document
            .getElementById("passageiroTelefone")
            .value,

        cidade:
            document
            .getElementById("passageiroCidade")
            .value

    };


    console.log(
        "Passageiro cadastrado:",
        passageiro
    );


    mostrarNotificacao(
        "Cadastro realizado com sucesso! Bem-vindo à VANLOC, " +
        nome +
        "!"
    );


    this.reset();

});

}



/* =====================================================
RESERVA
===================================================== */


function reservar(viagem) {

    document
    .getElementById("modalReserva")
    .style.display = "block";


    document
    .getElementById("viagemSelecionada")
    .innerText =
        "Você está reservando: " + viagem;

}


const vlFormReserva =
    document.getElementById("formReserva");

if (vlFormReserva) {

vlFormReserva
.addEventListener("submit", function(event) {

    event.preventDefault();


    fecharReserva();


    mostrarNotificacao(
        "Sua reserva foi enviada com sucesso!"
    );


    this.reset();

});

}



/* =====================================================
CONSULTAR PLANOS DE UM MOTORISTA
===================================================== */


function consultarPlanos(motoristaEmail) {


    const motorista =
        vlGetMotorista(motoristaEmail);


    document
    .getElementById("modalPlanos")
    .style.display = "block";


    document
    .getElementById("tituloPlanos")
    .innerText =
        motorista ?
        "Planos de " + motorista.nome :
        "Planos disponíveis";


    document
    .getElementById("subtituloPlanos")
    .innerText =
        motorista ?
        "Planos criados por " + motorista.nome + "." :
        "";


    const planos =
        vlGetPlanosOrdenados(motoristaEmail);


    const lista =
        document
        .getElementById("listaPlanos");


    if (planos.length === 0) {

        lista.innerHTML = `

            <div class="plano-vazio">

                <i class="fa-solid fa-circle-info"></i>

                <p>

                    Este motorista ainda não cadastrou
                    planos mensais. Você pode reservar a
                    viagem avulsa normalmente.

                </p>

            </div>

        `;

        return;

    }


    lista.innerHTML = planos
    .map(function(plano, indice) {

        const destaque =
            indice === 0 ?
            "plano-card plano-destaque" :
            "plano-card";


        return `

            <div class="${destaque}">

                ${
                    indice === 0 ?
                    `
                    <div class="mais-escolhido">
                        PLANO MAIS COMPLETO
                    </div>
                    `
                    :
                    ""
                }

                <div class="plano-titulo">

                    <i class="fa-solid fa-tags"></i>

                    <h3>
                        ${escapeHtml(plano.nome)}
                    </h3>

                </div>


                <div class="preco-plano">

                    <small>
                        Valor por viagem
                    </small>

                    <strong>
                        R$ ${formatarMoeda(plano.valor)}
                    </strong>

                    <span>
                        por viagem
                    </span>

                </div>


                <ul>

                    <li>

                        <i class="fa-solid fa-check"></i>

                        ${
                            plano.quantidade ?
                            plano.quantidade + " viagens/mês"
                            :
                            "Quantidade personalizada"
                        }

                    </li>

                    ${
                        (plano.vantagens || [])
                        .map(function(vantagem) {

                            return `
                                <li>
                                    <i class="fa-solid fa-check"></i>
                                    ${escapeHtml(vantagem)}
                                </li>
                            `;

                        })
                        .join("")
                    }

                </ul>


                <button
                    onclick="assinarPlano('${escapeHtml(plano.nome)}')"
                >

                    Assinar plano

                </button>

            </div>

        `;

    })
    .join("");


}



/* =====================================================
ASSINAR PLANO
===================================================== */


function assinarPlano(plano) {


    fecharPlanos();


    mostrarNotificacao(
        "Você selecionou o " +
        plano +
        ". Faça login para continuar."
    );


    setTimeout(function() {

        abrirLogin();

    }, 1000);

}



/* =====================================================
CADASTRO DO MOTORISTA
===================================================== */


const vlFormMotorista =
    document.getElementById("formMotorista");

if (vlFormMotorista) {

vlFormMotorista
.addEventListener("submit", function(event) {

    event.preventDefault();


    const nome =
        document
        .getElementById("nomeMotorista")
        .value;


    const telefone =
        document
        .getElementById("telefoneMotorista")
        .value;


    const email =
        document
        .getElementById("emailMotorista")
        .value;


    const cpf =
        document
        .getElementById("cpfMotorista")
        .value;


    const modeloVan =
        document
        .getElementById("modeloVan")
        .value;


    const placaVan =
        document
        .getElementById("placaVan")
        .value;


    const lugaresVan =
        document
        .getElementById("lugaresVan")
        .value;


    const origem =
        document
        .getElementById("origem")
        .value;


    const destino =
        document
        .getElementById("destino")
        .value;


    const data =
        document
        .getElementById("dataViagem")
        .value;


    const horario =
        document
        .getElementById("horarioViagem")
        .value;


    const valor =
        document
        .getElementById("valorViagem")
        .value;


    const vagas =
        document
        .getElementById("vagasViagem")
        .value;



    /* =================================================
    FOTO DA VAN
    ================================================= */


    const fotoInput =
        document
        .getElementById("fotoVan");


    let fotoVan =
        "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80";


    if (
        fotoInput.files.length > 0
    ) {

        fotoVan =
            URL.createObjectURL(
                fotoInput.files[0]
            );

    }



    /* =================================================
    SALVAR MOTORISTA E VIAGEM (localStorage)
    ================================================= */


    vlSalvarMotorista({

        nome: nome,

        telefone: telefone,

        email: email,

        cpf: cpf,

        modeloVan: modeloVan,

        placaVan: placaVan,

        lugaresVan: lugaresVan

    });


    vlAdicionarViagem({

        motoristaEmail: email,

        origem: origem,

        destino: destino,

        data: data,

        horario: horario,

        valor: valor,

        vagas: vagas

    });


    vlSalvarSessaoMotorista(
        email.trim().toLowerCase()
    );



    /* =================================================
    MOSTRAR A NOVA VIAGEM NA PÁGINA
    ================================================= */


    adicionarViagem(

        nome,

        email,

        origem,

        destino,

        data,

        horario,

        valor,

        fotoVan

    );



    fecharMotorista();


    mostrarNotificacao(
        "Cadastro realizado! Levando você ao seu Painel do Motorista..."
    );


    this.reset();


    setTimeout(function() {

        window.location.href = "dashboard.html";

    }, 1400);

});

}



/* =====================================================
ADICIONAR VIAGEM
===================================================== */


function adicionarViagem(

    nome,
    email,
    origem,
    destino,
    data,
    horario,
    valor,
    foto

) {


    const lista =
        document
        .getElementById("listaViagens");


    const iniciais =
        nome
        .split(" ")
        .map(
            palavra =>
            palavra.charAt(0)
        )
        .slice(0, 2)
        .join("")
        .toUpperCase();


    const novaViagem = `

        <div class="viagem-card">

            <div class="imagem-van">

                <img
                    src="${foto}"
                    alt="Van cadastrada"
                >

                <span class="disponivel">

                    Disponível

                </span>

            </div>


            <div class="viagem-info">


                <div class="motorista-info">

                    <div class="avatar">

                        ${iniciais}

                    </div>


                    <div>

                        <strong>

                            ${nome}

                        </strong>


                        <span>

                            Motorista cadastrado

                            <i
                                class="fa-solid fa-circle-check"
                            ></i>

                        </span>

                    </div>

                </div>



                <h3>

                    ${origem}

                    <i class="fa-solid fa-arrow-right"></i>

                    ${destino}

                </h3>



                <div class="detalhes">


                    <span>

                        <i class="fa-solid fa-calendar"></i>

                        ${formatarData(data)}

                    </span>


                    <span>

                        <i class="fa-solid fa-clock"></i>

                        ${horario}

                    </span>


                </div>



                <div class="rodape-viagem">


                    <div class="preco">


                        <small>

                            Viagem avulsa

                        </small>


                        <strong>

                            R$ ${formatarMoeda(valor)}

                        </strong>


                        <small class="valor-minimo">

                            Planos a partir de R$ 20,00/viagem

                        </small>


                    </div>



                    <div class="botoes-viagem">


                        <button
                            class="btn-planos"
                            onclick="consultarPlanos('${escapeHtml(email)}')"
                        >

                            <i class="fa-solid fa-tags"></i>

                            Consultar planos

                        </button>



                        <button
                            class="btn-reservar"
                            onclick="reservar(
                                '${escapeHtml(origem)} para ${escapeHtml(destino)}'
                            )"
                        >

                            Reservar

                        </button>


                    </div>


                </div>


            </div>


        </div>

    `;


    lista.insertAdjacentHTML(
        "afterbegin",
        novaViagem
    );


    document
    .getElementById("viagens")
    .scrollIntoView({

        behavior: "smooth"

    });

}



/* =====================================================
BUSCAR VIAGEM
===================================================== */


function buscarViagem() {


    const destino =
        document
        .getElementById("buscaDestino")
        .value
        .toLowerCase()
        .trim();


    const data =
        document
        .getElementById("buscaData")
        .value;


    const viagens =
        document
        .querySelectorAll(".viagem-card");


    let encontradas = 0;


    viagens.forEach(function(viagem) {


        const texto =
            viagem
            .innerText
            .toLowerCase();


        const destinoEncontrado =
            destino === "" ||
            texto.includes(destino);


        const dataCard =
            viagem.dataset.data;


        const dataEncontrada =
            data === "" ||
            dataCard === data;


        if (
            destinoEncontrado &&
            dataEncontrada
        ) {

            viagem.style.display = "block";

            encontradas++;

        }

        else {

            viagem.style.display = "none";

        }

    });


    if (encontradas === 0) {

        mostrarNotificacao(
            "Nenhuma viagem encontrada."
        );

    }

    else {

        mostrarNotificacao(
            encontradas +
            " viagem(ns) encontrada(s)!"
        );


        document
        .getElementById("viagens")
        .scrollIntoView({

            behavior: "smooth"

        });

    }

}



/* =====================================================
LIMPAR BUSCA
===================================================== */


const vlBuscaDestino =
    document.getElementById("buscaDestino");

if (vlBuscaDestino) {

vlBuscaDestino
.addEventListener(
    "input",
    function() {

        if (this.value === "") {

            const viagens =
                document
                .querySelectorAll(
                    ".viagem-card"
                );


            viagens.forEach(
                function(viagem) {

                    viagem.style.display =
                        "block";

                }
            );

        }

    }
);

}



/* =====================================================
FORMATAR DATA
===================================================== */


function formatarData(data) {

    if (!data) {

        return "";

    }


    const partes =
        data.split("-");


    return (
        partes[2] +
        "/" +
        partes[1] +
        "/" +
        partes[0]
    );

}



/* =====================================================
FORMATAR MOEDA
===================================================== */


function formatarMoeda(valor) {

    return Number(valor)
        .toFixed(2)
        .replace(".", ",");

}



/* =====================================================
PROTEGER HTML
===================================================== */


function escapeHtml(texto) {

    if (!texto) {

        return "";

    }


    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =====================================================
PAINEL DO MOTORISTA
===================================================== */


let vantagensEmEdicao = [];

let planoEmEdicaoId = null;

let emailMotoristaLogado = null;



/* =====================================================
INICIALIZAÇÃO / SESSÃO
===================================================== */


document.addEventListener("DOMContentLoaded", function() {

    /* só executa a lógica do painel se este arquivo
    estiver sendo carregado dentro do dashboard.html */

    const estaNoPainel =
        document.getElementById("abaVisaoGeral");

    if (!estaNoPainel) {

        return;

    }


    const email = vlGetSessaoMotorista();


    if (!email) {

        window.location.href = "index.html";

        return;

    }


    const motorista = vlGetMotorista(email);


    if (!motorista) {

        window.location.href = "index.html";

        return;

    }


    emailMotoristaLogado = email;


    document
    .getElementById("saudacaoMotorista")
    .innerText =
        "Olá, " + motorista.nome.split(" ")[0] + "!";


    atualizarVisaoGeral();

    renderizarPlanos();

});



/* =====================================================
NAVEGAÇÃO ENTRE ABAS
===================================================== */


function mostrarAba(aba) {

    const abas = ["visaoGeral", "planos"];


    abas.forEach(function(item) {

        document
        .getElementById(
            "aba" +
            item.charAt(0).toUpperCase() +
            item.slice(1)
        )
        .style.display =
            item === aba ? "block" : "none";

    });


    document
    .querySelectorAll(".painel-nav-item")
    .forEach(function(botao) {

        botao.classList.toggle(
            "ativo",
            botao.dataset.aba === aba
        );

    });

}



/* =====================================================
SAIR DO PAINEL
===================================================== */


function sairPainel() {

    vlEncerrarSessaoMotorista();

    window.location.href = "index.html";

}



/* =====================================================
VISÃO GERAL
===================================================== */


function atualizarVisaoGeral() {

    const viagens =
        vlGetViagensDoMotorista(emailMotoristaLogado);


    const motorista =
        vlGetMotorista(emailMotoristaLogado);


    const planos =
        (motorista && motorista.planos) ?
        motorista.planos :
        [];


    document
    .getElementById("statViagens")
    .innerText =
        viagens.length;


    const receitaPotencial =
        viagens.reduce(
            (total, v) => total + Number(v.valor || 0),
            0
        );


    document
    .getElementById("statReceita")
    .innerText =
        "R$ " + formatarMoedaPainel(receitaPotencial);


    document
    .getElementById("statPlanos")
    .innerText =
        planos.length + "/" + VANLOC_LIMITE_PLANOS;


    const ticketMedio =
        planos.length > 0 ?
        planos.reduce(
            (total, p) => total + Number(p.valor || 0), 0
        ) / planos.length
        :
        0;


    document
    .getElementById("statTicketMedio")
    .innerText =
        "R$ " + formatarMoedaPainel(ticketMedio);


    const lista =
        document
        .getElementById("listaViagensMotorista");


    if (viagens.length === 0) {

        lista.innerHTML = `
            <div class="viagens-vazio">
                Você ainda não cadastrou nenhuma viagem.
            </div>
        `;

        return;

    }


    lista.innerHTML = viagens
    .slice()
    .reverse()
    .map(function(v) {

        return `

            <div class="linha-viagem">

                <strong>

                    ${escapeHtmlPainel(v.origem)}
                    <i class="fa-solid fa-arrow-right"></i>
                    ${escapeHtmlPainel(v.destino)}

                </strong>

                <span>

                    ${formatarDataPainel(v.data)} • ${v.horario}

                </span>

                <span>

                    R$ ${formatarMoedaPainel(v.valor)}

                </span>

            </div>

        `;

    })
    .join("");

}



/* =====================================================
RENDERIZAR PLANOS
===================================================== */


function renderizarPlanos() {

    const planos =
        vlGetPlanosOrdenados(emailMotoristaLogado);


    const lista =
        document
        .getElementById("listaPlanosMotorista");


    const botaoNovo =
        document
        .getElementById("btnNovoPlano");


    botaoNovo.disabled =
        planos.length >= VANLOC_LIMITE_PLANOS;

    botaoNovo.innerHTML =
        planos.length >= VANLOC_LIMITE_PLANOS ?
        `<i class="fa-solid fa-check"></i> Limite de planos atingido`
        :
        `<i class="fa-solid fa-plus"></i> Criar novo plano`;


    if (planos.length === 0) {

        lista.innerHTML = `

            <div class="planos-vazio-painel">

                <i class="fa-solid fa-tags"></i>

                <p>

                    Você ainda não criou nenhum plano.
                    Crie até 3 planos mensais para que
                    apareçam para os seus passageiros.

                </p>

            </div>

        `;

        return;

    }


    lista.innerHTML = planos
    .map(function(plano, indice) {

        const rotulo =
            indice === 0 ?
            "Mais caro" :
            (
                indice === planos.length - 1 ?
                "Mais barato" :
                "Intermediário"
            );


        return `

            <div class="plano-card-painel">

                <span class="badge-ordem">${rotulo}</span>

                <h3>${escapeHtmlPainel(plano.nome)}</h3>

                <div class="valor">

                    R$ ${formatarMoedaPainel(plano.valor)}
                    <span>/ viagem</span>

                </div>

                <ul>

                    <li>

                        <i class="fa-solid fa-check"></i>
                        ${
                            plano.quantidade ?
                            plano.quantidade + " viagens/mês" :
                            "Quantidade personalizada"
                        }

                    </li>

                    ${
                        (plano.vantagens || [])
                        .map(function(vantagem) {

                            return `
                                <li>
                                    <i class="fa-solid fa-check"></i>
                                    ${escapeHtmlPainel(vantagem)}
                                </li>
                            `;

                        })
                        .join("")
                    }

                </ul>

                <div class="plano-acoes">

                    <button
                        class="btn-editar-plano"
                        onclick="abrirFormPlano('${plano.id}')"
                    >
                        Editar
                    </button>

                    <button
                        class="btn-remover-plano"
                        onclick="removerPlano('${plano.id}')"
                    >
                        Remover
                    </button>

                </div>

            </div>

        `;

    })
    .join("");

}



/* =====================================================
FORMULÁRIO DE PLANO
===================================================== */


function abrirFormPlano(planoId) {

    const motorista =
        vlGetMotorista(emailMotoristaLogado);


    const limiteAtingido =
        !planoId &&
        motorista.planos.length >= VANLOC_LIMITE_PLANOS;


    if (limiteAtingido) {

        mostrarNotificacaoPainel(
            "Você já atingiu o limite de " +
            VANLOC_LIMITE_PLANOS +
            " planos."
        );

        return;

    }


    planoEmEdicaoId = planoId || null;


    const planoExistente =
        planoId ?
        motorista.planos.find(p => p.id === planoId) :
        null;


    document
    .getElementById("formPlanoTitulo")
    .innerText =
        planoExistente ? "Editar plano" : "Novo plano";


    document
    .getElementById("inputNomePlano")
    .value =
        planoExistente ? planoExistente.nome : "";


    document
    .getElementById("inputValorPlano")
    .value =
        planoExistente ? planoExistente.valor : "";


    document
    .getElementById("inputQuantidadePlano")
    .value =
        planoExistente ? planoExistente.quantidade : "";


    vantagensEmEdicao =
        planoExistente && planoExistente.vantagens ?
        [...planoExistente.vantagens] :
        [];


    renderizarVantagensForm();


    document
    .getElementById("formPlanoContainer")
    .style.display = "block";


    document
    .getElementById("formPlanoContainer")
    .scrollIntoView({ behavior: "smooth" });

}


function fecharFormPlano() {

    document
    .getElementById("formPlanoContainer")
    .style.display = "none";


    planoEmEdicaoId = null;

    vantagensEmEdicao = [];

}


function adicionarVantagem() {

    const input =
        document
        .getElementById("inputVantagem");


    const texto = input.value.trim();


    if (texto === "") {

        return;

    }


    vantagensEmEdicao.push(texto);

    input.value = "";

    renderizarVantagensForm();

}


function removerVantagem(indice) {

    vantagensEmEdicao.splice(indice, 1);

    renderizarVantagensForm();

}


function renderizarVantagensForm() {

    const lista =
        document
        .getElementById("listaVantagens");


    lista.innerHTML = vantagensEmEdicao
    .map(function(vantagem, indice) {

        return `

            <li>

                ${escapeHtmlPainel(vantagem)}

                <button
                    type="button"
                    onclick="removerVantagem(${indice})"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </li>

        `;

    })
    .join("");

}


function salvarPlano() {

    const nome =
        document
        .getElementById("inputNomePlano")
        .value
        .trim();


    const valor =
        document
        .getElementById("inputValorPlano")
        .value;


    const quantidade =
        document
        .getElementById("inputQuantidadePlano")
        .value;


    if (nome === "" || valor === "") {

        mostrarNotificacaoPainel(
            "Preencha ao menos o nome e o valor do plano."
        );

        return;

    }


    const resultado =
        vlSalvarPlano(emailMotoristaLogado, {

            id: planoEmEdicaoId,

            nome: nome,

            valor: valor,

            quantidade: quantidade,

            vantagens: vantagensEmEdicao

        });


    if (!resultado.ok) {

        mostrarNotificacaoPainel(resultado.mensagem);

        return;

    }


    fecharFormPlano();

    renderizarPlanos();

    atualizarVisaoGeral();


    mostrarNotificacaoPainel("Plano salvo com sucesso!");

}


function removerPlano(planoId) {

    vlRemoverPlano(emailMotoristaLogado, planoId);

    renderizarPlanos();

    atualizarVisaoGeral();

    mostrarNotificacaoPainel("Plano removido.");

}



/* =====================================================
UTILITÁRIOS
===================================================== */


function formatarMoedaPainel(valor) {

    return Number(valor || 0)
        .toFixed(2)
        .replace(".", ",");

}


function formatarDataPainel(data) {

    if (!data) {

        return "";

    }


    const partes = data.split("-");

    return partes[2] + "/" + partes[1] + "/" + partes[0];

}


function escapeHtmlPainel(texto) {

    if (!texto) {

        return "";

    }

    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


function mostrarNotificacaoPainel(mensagem) {

    const notificacao =
        document.getElementById("notificacao");

    const texto =
        document.getElementById("mensagemNotificacao");


    texto.innerText = mensagem;

    notificacao.style.display = "flex";


    setTimeout(function() {

        notificacao.style.display = "none";

    }, 4000);

}
