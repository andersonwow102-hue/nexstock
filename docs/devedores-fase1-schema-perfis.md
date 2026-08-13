# DEVEDORES — estrutura confirmada de `public.perfis`

Este documento registra metadados estruturais confirmados por inspeção de catálogo autorizada. Não contém dados de usuários nem credenciais.

## Schema confirmado

O conjunto atual de SQL e frontend presume, em diferentes pontos, as seguintes colunas:

| Coluna | Tipo mínimo presumido | Evidência de uso |
|---|---|---|
| `user_id` | `uuid not null`, PK e FK para `auth.users(id)` com cascade | associação com `auth.uid()` |
| `nome` | `text`, anulável | nome de exibição |
| `perfil` | `text not null default 'consulta'` | `administrador`, `operador`, `gerente` ou `consulta` |
| `criado_em` | `timestamptz not null default now()` | auditoria cadastral |
| `gerente_nome` | `text`, anulável, default vazio | vínculo nominal do gerente |
| `email_temporario` | `boolean not null default false` | fluxo interno de login |
| `email_temporario_expira_em` | `timestamptz`, anulável | fluxo interno de login |
| `login_nome` | `text`, anulável | login alternativo; índice único parcial em minúsculas |
| `rotas_permitidas` | `text[] not null default '{}'` | escopo de rotas dos gerentes |

O frontend também referencia `email_temporario`, `email_temporario_expira_em` e `criado_em`, mas esses campos não são necessários para as RPCs da Fase 1 de DEVEDORES.

RLS está ativa e não forçada. O usuário lê o próprio perfil; o administrador possui leitura e administração conforme policies existentes. O helper real `private.perfil_atual()` retorna `consulta` quando não encontra perfil, portanto DEVEDORES exige adicionalmente a existência da linha real em `public.perfis`.

## Reprodução local

O arquivo `supabase/tests/bootstrap_perfis_local.sql` reproduz somente a estrutura necessária ao teste descartável, helpers, policies mínimas e trigger confirmado. Ele não é migration de produção.

O cadastro público e anônimo desativados são configurações externas do Supabase Auth e não são comprovados nem reproduzidos por migration.

## Bloqueio de produção

O painel confirmou ausência de backups. Nenhuma migration de DEVEDORES pode ser aplicada em produção antes de existir estratégia aprovada e testada de backup e restauração.
