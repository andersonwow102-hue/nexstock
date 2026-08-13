# DEVEDORES — pressupostos locais sobre `public.perfis`

Este documento mapeia somente referências presentes no repositório. Não descreve nem confirma o schema remoto atual e não contém dados de usuários.

## Schema mínimo presumido pelo código

O conjunto atual de SQL e frontend presume, em diferentes pontos, as seguintes colunas:

| Coluna | Tipo mínimo presumido | Evidência de uso |
|---|---|---|
| `user_id` | `uuid` único ou chave | associação com `auth.uid()` e conflitos por usuário |
| `nome` | `text` | nome de exibição e fallback de identidade |
| `perfil` | `text` | autorização para `administrador`, `operador`, `gerente` e `consulta` |
| `gerente_nome` | `text`, anulável | vínculo nominal do gerente |
| `login_nome` | `text`, anulável | fallback de identidade e login |
| `rotas_permitidas` | `text[]`, anulável | escopo de rotas dos gerentes |

O frontend também referencia `email_temporario`, `email_temporario_expira_em` e `criado_em`, mas esses campos não são necessários para as RPCs da Fase 1 de DEVEDORES.

`supabase/setup_profissional.sql` reproduz apenas `user_id`, `nome`, `perfil` e `criado_em`, com valores de perfil originalmente limitados a `administrador`, `operador` e `consulta`. Migrations posteriores e o frontend presumem `gerente`, `gerente_nome`, `login_nome` e `rotas_permitidas`. Portanto, uma instalação limpa ainda não é comprovadamente reproduzível sem conhecer a estrutura real atual.

## Metadados ainda necessários

Antes de executar os testes SQL locais, é necessário obter somente metadados de estrutura:

- colunas, tipos, nulabilidade e defaults de `public.perfis`;
- chave primária, índices e constraints de unicidade;
- constraints e valores admitidos por `perfil`;
- chaves estrangeiras;
- políticas RLS e grants;
- definição das funções `public.perfil_atual()` e `private.perfil_atual()`;
- triggers associados à tabela.

## Método proposto, não executado

Em ambiente autorizado, usar uma conexão somente leitura e consultar `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_policies`, `information_schema.role_table_grants`, `pg_proc` e `pg_trigger`, filtrando exclusivamente `public.perfis` e as duas funções de perfil. Não selecionar linhas de `public.perfis`, `auth.users` ou qualquer tabela operacional.

Alternativamente, gerar somente o schema com `pg_dump --schema-only --table=public.perfis`, desde que a credencial e o ambiente tenham sido explicitamente autorizados. Nenhum desses acessos foi executado nesta rodada.
