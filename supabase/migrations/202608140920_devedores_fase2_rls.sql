begin;

create policy devedores_negociacoes_ler
on public.devedores_negociacoes for select to authenticated
using (
  exists (
    select 1
    from public.perfis p
    join public.devedores_dividas d on d.id = devedores_negociacoes.divida_id
    where p.user_id = auth.uid()
      and (
        p.perfil in ('operador', 'administrador', 'consulta')
        or (p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id)
      )
  )
);

create policy devedores_parcelas_ler
on public.devedores_parcelas for select to authenticated
using (
  exists (
    select 1
    from public.perfis p
    join public.devedores_dividas d on d.id = devedores_parcelas.divida_id
    where p.user_id = auth.uid()
      and (
        p.perfil in ('operador', 'administrador', 'consulta')
        or (p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id)
      )
  )
);

create policy devedores_pagamentos_ler
on public.devedores_pagamentos for select to authenticated
using (
  exists (
    select 1
    from public.perfis p
    join public.devedores_dividas d on d.id = devedores_pagamentos.divida_id
    where p.user_id = auth.uid()
      and (
        p.perfil in ('operador', 'administrador', 'consulta')
        or (p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id)
      )
  )
);

create policy devedores_pagamentos_estornos_ler
on public.devedores_pagamentos_estornos for select to authenticated
using (
  exists (
    select 1
    from public.perfis p
    join public.devedores_dividas d on d.id = devedores_pagamentos_estornos.divida_id
    where p.user_id = auth.uid()
      and (
        p.perfil in ('operador', 'administrador', 'consulta')
        or (p.perfil = 'gerente' and d.gerente_responsavel_id = p.user_id)
      )
  )
);

commit;
