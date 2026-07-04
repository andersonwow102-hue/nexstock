begin;

-- Dados de pagamento e nota fiscal ficam fora da tabela visível aos gerentes.
create table if not exists public.consertos_equipamentos (
  equipamento_id bigint primary key references public.equipamentos(id) on delete cascade,
  conserto_defeito text,
  conserto_assistencia text,
  conserto_previsao date,
  conserto_pix text,
  conserto_valor numeric(12,2) not null default 0 check (conserto_valor >= 0),
  conserto_nota_nome text,
  conserto_nota_arquivo text,
  conserto_solicitado_em timestamptz,
  conserto_solicitado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now(),
  constraint conserto_nota_tamanho check (conserto_nota_arquivo is null or length(conserto_nota_arquivo) <= 4300000),
  constraint conserto_nota_imagem check (
    conserto_nota_arquivo is null
    or conserto_nota_arquivo ~ '^data:image/(jpeg|jpg|png|webp);base64,'
  )
);

insert into public.consertos_equipamentos (
  equipamento_id, conserto_defeito, conserto_assistencia, conserto_previsao,
  conserto_pix, conserto_valor, conserto_nota_nome, conserto_nota_arquivo,
  conserto_solicitado_em, conserto_solicitado_por
)
select
  id, conserto_defeito, conserto_assistencia, conserto_previsao,
  conserto_pix, coalesce(conserto_valor, 0), conserto_nota_nome, conserto_nota_arquivo,
  conserto_solicitado_em, conserto_solicitado_por
from public.equipamentos
where coalesce(conserto_defeito, '') <> ''
   or coalesce(conserto_assistencia, '') <> ''
   or conserto_previsao is not null
   or coalesce(conserto_pix, '') <> ''
   or coalesce(conserto_valor, 0) > 0
   or coalesce(conserto_nota_arquivo, '') <> ''
on conflict (equipamento_id) do update set
  conserto_defeito = excluded.conserto_defeito,
  conserto_assistencia = excluded.conserto_assistencia,
  conserto_previsao = excluded.conserto_previsao,
  conserto_pix = excluded.conserto_pix,
  conserto_valor = excluded.conserto_valor,
  conserto_nota_nome = excluded.conserto_nota_nome,
  conserto_nota_arquivo = excluded.conserto_nota_arquivo,
  conserto_solicitado_em = excluded.conserto_solicitado_em,
  conserto_solicitado_por = excluded.conserto_solicitado_por,
  atualizado_em = now();

alter table public.consertos_equipamentos enable row level security;
drop policy if exists consertos_equipamentos_admin_operador on public.consertos_equipamentos;
create policy consertos_equipamentos_admin_operador
on public.consertos_equipamentos for all to authenticated
using (public.perfil_atual() in ('administrador', 'operador'))
with check (public.perfil_atual() in ('administrador', 'operador'));

alter table public.equipamentos
  drop column if exists conserto_defeito,
  drop column if exists conserto_assistencia,
  drop column if exists conserto_previsao,
  drop column if exists conserto_pix,
  drop column if exists conserto_valor,
  drop column if exists conserto_nota_nome,
  drop column if exists conserto_nota_arquivo,
  drop column if exists conserto_solicitado_em,
  drop column if exists conserto_solicitado_por;

-- Equipamentos: admin/operador gerenciam tudo; gerente só lê e altera o próprio estoque.
drop policy if exists equipamentos_escrever on public.equipamentos;
drop policy if exists equipamentos_ler on public.equipamentos;
drop policy if exists equipamentos_admin_operador on public.equipamentos;
drop policy if exists equipamentos_gerente_atualizar on public.equipamentos;
create policy equipamentos_ler on public.equipamentos for select to authenticated
using (
  public.perfil_atual() in ('administrador', 'operador')
  or (
    public.perfil_atual() = 'gerente'
    and (
      gerente_responsavel = public.gerente_atual()
      or localizacao in (
        select pt.nome_fantasia from public.pontos pt
        where exists (
          select 1 from public.perfis p
          where p.user_id = auth.uid()
            and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
        )
      )
    )
  )
);
create policy equipamentos_admin_operador on public.equipamentos for all to authenticated
using (public.perfil_atual() in ('administrador', 'operador'))
with check (public.perfil_atual() in ('administrador', 'operador'));
create policy equipamentos_gerente_atualizar on public.equipamentos for update to authenticated
using (public.perfil_atual() = 'gerente' and gerente_responsavel = public.gerente_atual())
with check (public.perfil_atual() = 'gerente' and gerente_responsavel = public.gerente_atual());

-- Pontos: operador edita, mas criação e exclusão ficam bloqueadas no banco.
drop policy if exists pontos_escrever on public.pontos;
drop policy if exists pontos_ler on public.pontos;
drop policy if exists pontos_admin_all on public.pontos;
drop policy if exists pontos_operador_atualizar on public.pontos;
create policy pontos_ler on public.pontos for select to authenticated
using (
  public.perfil_atual() in ('administrador', 'operador')
  or (
    public.perfil_atual() = 'gerente'
    and exists (
      select 1 from public.perfis p
      where p.user_id = auth.uid()
        and public.pontos.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
  )
);
create policy pontos_admin_all on public.pontos for all to authenticated
using (public.perfil_atual() = 'administrador')
with check (public.perfil_atual() = 'administrador');
create policy pontos_operador_atualizar on public.pontos for update to authenticated
using (public.perfil_atual() = 'operador')
with check (public.perfil_atual() = 'operador');

-- Despesas: somente administração e gerente da rota; operador não lê nem escreve.
drop policy if exists despesas_ler on public.despesas_mensais;
drop policy if exists despesas_escrever on public.despesas_mensais;
drop policy if exists despesas_gerente_criar on public.despesas_mensais;
drop policy if exists despesas_gerente_alterar on public.despesas_mensais;
drop policy if exists despesas_gerente_remover on public.despesas_mensais;
create policy despesas_ler on public.despesas_mensais for select to authenticated
using (
  public.perfil_atual() = 'administrador'
  or (
    public.perfil_atual() = 'gerente'
    and exists (
      select 1 from public.pontos pt join public.perfis p on p.user_id = auth.uid()
      where pt.id = public.despesas_mensais.ponto_id
        and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
  )
);
create policy despesas_escrever on public.despesas_mensais for all to authenticated
using (
  public.perfil_atual() = 'administrador'
  or (
    public.perfil_atual() = 'gerente'
    and competencia = date_trunc('month', current_date)::date
    and extract(day from current_date) >= 10
    and exists (
      select 1 from public.pontos pt join public.perfis p on p.user_id = auth.uid()
      where pt.id = public.despesas_mensais.ponto_id
        and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
  )
)
with check (
  public.perfil_atual() = 'administrador'
  or (
    public.perfil_atual() = 'gerente'
    and competencia = date_trunc('month', current_date)::date
    and extract(day from current_date) >= 10
    and exists (
      select 1 from public.pontos pt join public.perfis p on p.user_id = auth.uid()
      where pt.id = public.despesas_mensais.ponto_id
        and pt.gerente = any(coalesce(p.rotas_permitidas, array[]::text[]))
    )
  )
);

-- Histórico não fica disponível para perfis sem escopo operacional.
drop policy if exists historico_equip_ler on public.historico_equipamentos;
drop policy if exists historico_equip_escrever on public.historico_equipamentos;
drop policy if exists historico_equip_gerente_criar on public.historico_equipamentos;
create policy historico_equip_ler on public.historico_equipamentos for select to authenticated
using (
  public.perfil_atual() in ('administrador', 'operador')
  or (
    public.perfil_atual() = 'gerente'
    and item_id in (select id from public.equipamentos)
  )
);
create policy historico_equip_escrever on public.historico_equipamentos for insert to authenticated
with check (public.perfil_atual() in ('administrador', 'operador'));
create policy historico_equip_gerente_criar on public.historico_equipamentos for insert to authenticated
with check (
  public.perfil_atual() = 'gerente'
  and tipo in ('cadastro', 'edicao', 'entrada', 'saida', 'conserto', 'retorno', 'defeito', 'disponivel', 'baixa', 'ponto', 'envio_gerente', 'recebimento_gerente')
  and item_id in (select id from public.equipamentos)
);

drop policy if exists historico_pontos_ler on public.historico_pontos;
create policy historico_pontos_ler on public.historico_pontos for select to authenticated
using (
  public.perfil_atual() in ('administrador', 'operador')
  or (
    public.perfil_atual() = 'gerente'
    and nome in (select nome_fantasia from public.pontos)
  )
);

-- Chat: remetente não pode falsificar perfil; UPDATE fica limitado à coluna lida_em.
alter table public.mensagens_internas
  drop constraint if exists mensagens_internas_mensagem_tamanho;
alter table public.mensagens_internas
  add constraint mensagens_internas_mensagem_tamanho check (char_length(btrim(mensagem)) between 1 and 4000);
drop policy if exists mensagens_internas_enviar on public.mensagens_internas;
create policy mensagens_internas_enviar on public.mensagens_internas for insert to authenticated
with check (
  remetente_id = auth.uid()
  and remetente_perfil = public.perfil_atual()
  and (
    (public.perfil_atual() = 'administrador' and destino_tipo in ('gerente', 'operador'))
    or (public.perfil_atual() = 'operador' and destino_tipo in ('gerente', 'administracao'))
    or (
      public.perfil_atual() = 'gerente'
      and gerente_nome = public.gerente_atual()
      and destino_tipo in ('administracao', 'operador')
    )
  )
);
revoke update on public.mensagens_internas from authenticated;
grant update (lida_em) on public.mensagens_internas to authenticated;

-- Menor superfície para API anônima e remoção de privilégios SQL desnecessários.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke execute on function public.criar_perfil_novo_usuario() from public, anon, authenticated;
revoke execute on function public.perfil_atual() from public, anon;
revoke execute on function public.gerente_atual() from public, anon;
grant execute on function public.perfil_atual() to authenticated, service_role;
grant execute on function public.gerente_atual() to authenticated, service_role;
revoke execute on function public.email_por_login(text) from public, authenticated;
grant execute on function public.email_por_login(text) to anon;

commit;
