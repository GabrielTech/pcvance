-- PCVANCE: execute no Supabase SQL Editor. Não apaga a tabela nem os dados existentes.
-- A tabela public.profiles deve conter: id uuid, nome text, email text,
-- telefone text, tipo text, created_at timestamptz.

alter table public.profiles alter column created_at set default now();

create or replace function public.pcvance_create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email, telefone, tipo, created_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'telefone', ''),
    'user',
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    nome = case when public.profiles.nome = '' then excluded.nome else public.profiles.nome end,
    telefone = case when public.profiles.telefone = '' then excluded.telefone else public.profiles.telefone end;
  return new;
end;
$$;

drop trigger if exists pcvance_on_auth_user_created on auth.users;
create trigger pcvance_on_auth_user_created
after insert on auth.users
for each row execute function public.pcvance_create_profile();

alter table public.profiles enable row level security;
drop policy if exists "PCVANCE: usuário lê próprio perfil" on public.profiles;
create policy "PCVANCE: usuário lê próprio perfil" on public.profiles
for select to authenticated using (auth.uid() = id);
drop policy if exists "PCVANCE: usuário atualiza próprio perfil" on public.profiles;
create policy "PCVANCE: usuário atualiza próprio perfil" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
-- Não permita INSERT público na profiles: o trigger cria o perfil com tipo 'user'.
revoke insert, delete on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
