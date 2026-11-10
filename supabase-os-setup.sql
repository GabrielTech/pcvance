-- PCVANCE | Integração das Ordens de Serviço com Supabase
-- Execute no SQL Editor do projeto Supabase DEPOIS do supabase-setup.sql.
-- Não apaga nem altera os registros já existentes em profiles.

create table if not exists public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  dados jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ordens_servico_created_at_idx
  on public.ordens_servico (created_at desc);
create index if not exists ordens_servico_created_by_idx
  on public.ordens_servico (created_by);

alter table public.ordens_servico enable row level security;

-- Função SECURITY DEFINER evita recursão de RLS ao consultar profiles.
create or replace function public.pcvance_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.tipo in ('admin', 'colaborador')
  );
$$;

revoke all on function public.pcvance_is_staff() from public;
grant execute on function public.pcvance_is_staff() to authenticated;

-- Recria somente as políticas desta tabela.
drop policy if exists "PCVANCE equipe pode consultar OS" on public.ordens_servico;
create policy "PCVANCE equipe pode consultar OS"
  on public.ordens_servico for select to authenticated
  using ((select public.pcvance_is_staff()));

drop policy if exists "PCVANCE equipe pode cadastrar OS" on public.ordens_servico;
create policy "PCVANCE equipe pode cadastrar OS"
  on public.ordens_servico for insert to authenticated
  with check (
    (select public.pcvance_is_staff())
    and created_by = (select auth.uid())
  );

drop policy if exists "PCVANCE equipe pode atualizar OS" on public.ordens_servico;
create policy "PCVANCE equipe pode atualizar OS"
  on public.ordens_servico for update to authenticated
  using ((select public.pcvance_is_staff()))
  with check ((select public.pcvance_is_staff()));

drop policy if exists "PCVANCE equipe pode excluir OS" on public.ordens_servico;
create policy "PCVANCE equipe pode excluir OS"
  on public.ordens_servico for delete to authenticated
  using ((select public.pcvance_is_staff()));

grant select, insert, update, delete on public.ordens_servico to authenticated;
revoke all on public.ordens_servico from anon;

-- Impede que um usuário comum promova a própria conta alterando o campo tipo.
-- O perfil continua podendo atualizar nome e telefone pelo formulário do site.
revoke update on public.profiles from authenticated;
grant update (nome, telefone) on public.profiles to authenticated;

-- Para autorizar um colaborador, primeiro cadastre a conta normalmente no site.
-- Depois, substitua o e-mail abaixo e execute manualmente no SQL Editor:
-- update public.profiles set tipo = 'colaborador' where email = 'colaborador@exemplo.com';
-- Para promover um administrador:
-- update public.profiles set tipo = 'admin' where email = 'admin@exemplo.com';

-- ===== Solicitações dos clientes e vínculo das OS com o cliente =====
-- Esta etapa permite que o cliente envie uma solicitação, a equipe a aceite
-- e a OS correspondente apareça na dashboard do próprio cliente.

alter table public.ordens_servico
  add column if not exists cliente_id uuid references auth.users(id) on delete set null;

create index if not exists ordens_servico_cliente_id_idx
  on public.ordens_servico (cliente_id);

-- O cliente pode consultar somente as OS vinculadas à sua conta.
drop policy if exists "Cliente consulta suas proprias OS" on public.ordens_servico;
create policy "Cliente consulta suas proprias OS"
  on public.ordens_servico for select to authenticated
  using (cliente_id = (select auth.uid()));

create table if not exists public.solicitacoes_servico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'Nova',
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solicitacoes_servico_user_id_idx
  on public.solicitacoes_servico (user_id);
create index if not exists solicitacoes_servico_status_idx
  on public.solicitacoes_servico (status);

alter table public.solicitacoes_servico enable row level security;

drop policy if exists "Cliente cria sua propria solicitacao" on public.solicitacoes_servico;
create policy "Cliente cria sua propria solicitacao"
  on public.solicitacoes_servico for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'Nova');

drop policy if exists "Cliente consulta suas proprias solicitacoes" on public.solicitacoes_servico;
create policy "Cliente consulta suas proprias solicitacoes"
  on public.solicitacoes_servico for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Equipe consulta todas as solicitacoes" on public.solicitacoes_servico;
create policy "Equipe consulta todas as solicitacoes"
  on public.solicitacoes_servico for select to authenticated
  using ((select public.pcvance_is_staff()));

drop policy if exists "Equipe atualiza solicitacoes" on public.solicitacoes_servico;
create policy "Equipe atualiza solicitacoes"
  on public.solicitacoes_servico for update to authenticated
  using ((select public.pcvance_is_staff()))
  with check ((select public.pcvance_is_staff()));

drop policy if exists "Equipe exclui solicitacoes" on public.solicitacoes_servico;
create policy "Equipe exclui solicitacoes"
  on public.solicitacoes_servico for delete to authenticated
  using ((select public.pcvance_is_staff()));

drop policy if exists "Cliente cancela solicitacao nova" on public.solicitacoes_servico;
create policy "Cliente cancela solicitacao nova"
  on public.solicitacoes_servico for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'Nova');

grant select, insert, update, delete on public.solicitacoes_servico to authenticated;
revoke all on public.solicitacoes_servico from anon;

-- Habilita atualização em tempo real para as dashboards (se ainda não estiver habilitada).
do $$
begin
  alter publication supabase_realtime add table public.solicitacoes_servico;
exception when duplicate_object then
  null;
when undefined_object then
  raise notice 'Publication supabase_realtime não encontrada; as telas ainda atualizarão ao abrir/retornar à página.';
end $$;

do $$
begin
  alter publication supabase_realtime add table public.ordens_servico;
exception when duplicate_object then
  null;
when undefined_object then
  raise notice 'Publication supabase_realtime não encontrada; as telas ainda atualizarão ao abrir/retornar à página.';
end $$;


-- ===== Propostas de orçamento enviadas pela equipe ao cliente =====
create table if not exists public.propostas_orcamento (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  dados jsonb not null default '{}'::jsonb,
  status text not null default 'Enviada'
    check (status in ('Enviada','Aprovada','Recusada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists propostas_orcamento_client_id_idx
  on public.propostas_orcamento (client_id, created_at desc);

alter table public.propostas_orcamento enable row level security;

drop policy if exists "Equipe consulta propostas" on public.propostas_orcamento;
create policy "Equipe consulta propostas"
  on public.propostas_orcamento for select to authenticated
  using ((select public.pcvance_is_staff()));

drop policy if exists "Cliente consulta suas propostas" on public.propostas_orcamento;
create policy "Cliente consulta suas propostas"
  on public.propostas_orcamento for select to authenticated
  using (client_id = (select auth.uid()));

drop policy if exists "Equipe cria propostas" on public.propostas_orcamento;
create policy "Equipe cria propostas"
  on public.propostas_orcamento for insert to authenticated
  with check ((select public.pcvance_is_staff()) and created_by = (select auth.uid()));

drop policy if exists "Equipe exclui propostas" on public.propostas_orcamento;
create policy "Equipe exclui propostas"
  on public.propostas_orcamento for delete to authenticated
  using ((select public.pcvance_is_staff()));

drop policy if exists "Equipe atualiza status das propostas" on public.propostas_orcamento;
create policy "Equipe atualiza status das propostas"
  on public.propostas_orcamento for update to authenticated
  using ((select public.pcvance_is_staff()))
  with check ((select public.pcvance_is_staff()));

drop policy if exists "Cliente responde proposta recebida" on public.propostas_orcamento;
create policy "Cliente responde proposta recebida"
  on public.propostas_orcamento for update to authenticated
  using (client_id = (select auth.uid()) and status = 'Enviada')
  with check (client_id = (select auth.uid()) and status in ('Aprovada','Recusada'));

grant select, insert, delete on public.propostas_orcamento to authenticated;
grant update (status, updated_at) on public.propostas_orcamento to authenticated;
revoke all on public.propostas_orcamento from anon;

-- A equipe precisa listar os clientes cadastrados para direcionar cada proposta.
drop policy if exists "Equipe consulta perfis de clientes" on public.profiles;
create policy "Equipe consulta perfis de clientes"
  on public.profiles for select to authenticated
  using ((select public.pcvance_is_staff()));

do $$
begin
  alter publication supabase_realtime add table public.propostas_orcamento;
exception when duplicate_object then
  null;
when undefined_object then
  raise notice 'Publication supabase_realtime não encontrada; propostas serão atualizadas ao abrir/retornar à página.';
end $$;
