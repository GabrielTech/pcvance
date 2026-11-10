/* PCVANCE - Gerador de proposta em PDF via impressão do navegador */
(function () {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const money = value => new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL"}).format(Number(value) || 0);
  const date = value => {
    if (!value) return "Não informada";
    const d = new Date(value.length === 10 ? value + "T12:00:00" : value);
    return Number.isNaN(d.getTime()) ? "Não informada" : d.toLocaleDateString("pt-BR");
  };
  function generate(data, meta = {}) {
    const customer = esc(data.clienteNome || "Cliente");
    const title = esc(data.titulo || "Proposta de orçamento");
    const description = esc(data.descricao || "Serviços e itens conforme descrição desta proposta.").replace(/\n/g, "<br>");
    const valid = date(data.validade);
    const issued = date(meta.date || data.criadoEm || new Date().toISOString());
    const amount = money(data.valor);
    const logo = new URL("pcvance_logo.jpeg", window.location.href).href;
    const w = window.open("", "_blank");
    if (!w) { alert("Permita pop-ups para gerar a proposta em PDF."); return; }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Proposta PCVANCE - ${title}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#eef2f7}.sheet{max-width:850px;margin:28px auto;background:#fff;padding:48px 56px;box-shadow:0 8px 32px #14213d18}.header{display:flex;align-items:center;gap:18px;border-bottom:3px solid #1677df;padding-bottom:22px}.logo{width:100px;height:76px;object-fit:contain}.brand h1{font-size:26px;letter-spacing:2px;margin:0;color:#0b1a31}.brand p{margin:6px 0 0;color:#53708f;font-size:11px;letter-spacing:2px}.tag{margin-left:auto;color:#1677df;font-size:12px;font-weight:bold;text-align:right}.intro{margin:30px 0 24px;line-height:1.7}.intro h2{font-size:22px;color:#10213a;margin:0 0 12px}.intro p{margin:8px 0}.details{border:1px solid #dce5ef;border-radius:8px;padding:20px;margin:22px 0}.details h3{font-size:14px;color:#1677df;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px}.description{line-height:1.7;white-space:normal}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.meta div{background:#f4f7fb;padding:14px;border-radius:6px}.meta small{display:block;color:#63748a;font-size:10px;text-transform:uppercase;margin-bottom:7px}.meta strong{font-size:15px}.total{display:flex;justify-content:space-between;align-items:center;background:#0d1b31;color:#fff;padding:20px;border-radius:8px;margin:24px 0}.total strong{font-size:25px;color:#72b7ff}.closing{line-height:1.7;margin-top:26px}.signature{margin-top:42px;border-top:1px solid #dce5ef;padding-top:18px;color:#52647a;font-size:12px}.signature strong{display:block;color:#10213a;font-size:15px;margin-bottom:4px}.actions{max-width:850px;margin:0 auto 24px;display:flex;justify-content:flex-end;gap:10px}.actions button{border:0;border-radius:6px;background:#1677df;color:white;padding:12px 18px;font-weight:bold;cursor:pointer}.actions .close{background:#66758a}@media print{body{background:white}.sheet{margin:0;max-width:none;box-shadow:none;padding:20mm 18mm}.actions{display:none}@page{size:A4;margin:0}}
      @media(max-width:600px){.sheet{padding:28px 22px;margin:0}.header{flex-wrap:wrap}.tag{margin-left:0;width:100%;text-align:left}.meta{grid-template-columns:1fr}}
      </style></head><body><main class="sheet"><header class="header"><img class="logo" src="${esc(logo)}" alt="PCVANCE"><div class="brand"><h1>PCVANCE</h1><p>TECNOLOGIA E DESEMPENHO</p></div><div class="tag">PROPOSTA<br>DE ORÇAMENTO</div></header>
      <section class="intro"><h2>${title}</h2><p><strong>Cliente:</strong> ${customer}</p><p><strong>Data de emissão:</strong> ${issued}</p><p>Prezado(a) ${customer},</p><p>A PCVANCE apresenta esta proposta de orçamento para a prestação dos serviços descritos abaixo. Nosso objetivo é oferecer uma solução técnica adequada às necessidades identificadas, com clareza nas informações, transparência nos valores e cuidado em cada etapa do atendimento.</p></section>
      <section class="details"><h3>Descrição da proposta</h3><div class="description">${description}</div></section>
      <div class="meta"><div><small>Validade da proposta</small><strong>${valid}</strong></div><div><small>Status</small><strong>${esc(meta.status || "Proposta apresentada")}</strong></div></div>
      <div class="total"><span>Valor total do orçamento</span><strong>${amount}</strong></div>
      <section class="closing"><p>Os serviços serão iniciados após a aprovação desta proposta pelo cliente. Caso seja identificada a necessidade de serviços ou peças não contemplados neste orçamento, será apresentado um novo valor para avaliação e autorização prévia.</p><p>Esta proposta tem como finalidade formalizar os serviços previstos e seus respectivos valores. Em caso de dúvidas ou necessidade de esclarecimentos, a equipe PCVANCE permanece à disposição.</p><p>Agradecemos pela confiança e pela oportunidade de apresentar esta proposta.</p><p>Atenciosamente,<br><strong>Equipe PCVANCE</strong></p></section>
      <footer class="signature"><strong>PCVANCE — Tecnologia e Desempenho</strong>Proposta gerada pelo sistema de atendimento PCVANCE.</footer></main><div class="actions"><button class="close" onclick="window.close()">Fechar</button><button onclick="window.print()">Imprimir / Salvar como PDF</button></div></body></html>`);
    w.document.close();
    w.focus();
  }
  window.PCVANCEProposalPDF = { generate };
})();
