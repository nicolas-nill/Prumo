# Arquitetura

## Visão em camadas

```
 Navegador ─────────────► Next.js (App Router)
   │                        ├─ proxy.ts ............ sessão Supabase, proteção de rotas, bloqueio de /dev
   │                        ├─ app/(app) páginas ... Server Components: leem via repositório (RLS)
   │                        ├─ Server Actions ...... mutações: Zod → repositório → revalidatePath
   │                        └─ api/ ................ webhook WhatsApp, cron, health
   │
 WhatsApp (Meta) ─────────► api/whatsapp/webhook ─► pipeline ─► WhatsAppStore (service role, filtros explícitos)
                                                      └─► AIProvider (regras → OpenAI) ─► Zod
                             Supabase Postgres ◄─ RLS em todas as tabelas · funções SQL · auditoria
```

| Camada | Pasta | Regra |
|---|---|---|
| Domínio | `src/domain` | TypeScript puro, sem I/O. Dinheiro, datas, cálculos, permissões, planos. 100% testável. |
| Casos de uso | `src/features/<área>` | `schemas.ts` (Zod), `actions.ts` (`'use server'`), `queries.ts`, serviços. |
| Dados | `src/server/data` | Contrato `FinanceRepository` com duas implementações: `SupabaseRepository` (cliente do usuário, RLS) e `DemoRepository` (memória, mesmas regras). |
| Sessão | `src/server/session.ts` | `getViewer` / `requireViewer` / `getSpaceContext`, memoizados por requisição. Sempre em tempo de requisição (`connection()`). |
| UI | `src/components` | `ui/` é o design system; o resto é organizado por área. |
| Infra | `src/lib` | Env tipado, erros (`AppError`, `runAction`), logger com redação. |

As páginas nunca falam com o Supabase diretamente: sempre passam pelo repositório do viewer. Assim, trocar demo por Supabase não muda nenhuma página.

## Modos de dados

`getDataMode()` (`src/lib/env`) decide em tempo de execução:

- **supabase**: Supabase configurado. Padrão quando há credenciais.
- **demo**: dados fictícios em memória (`src/server/data/demo`), com login por perfil (Lucas/Marina) e banner fixo. Liga sozinho em desenvolvimento sem Supabase, ou com `PRUMO_DEMO_MODE=on`.
- **unconfigured**: produção sem Supabase. O proxy manda as rotas do app para `/configuracao`.

O dataset demo (`demo/dataset.ts`) é a fonte única: também gera `supabase/seed.sql` (`npm run db:seed:generate`), com datas relativas ao mês corrente.

## Modelo de dados

Tudo gira em torno do **espaço financeiro** (`financial_spaces`). Uma pessoa tem um espaço pessoal e pode participar de um espaço compartilhado (casal). Toda tabela financeira tem `space_id`, e as FKs internas são compostas `(space_id, id)`: uma transação não consegue apontar para a categoria de outro espaço, nem por bug.

| Grupo | Tabelas |
|---|---|
| Identidade | `profiles` (1:1 com `auth.users`), `plans` |
| Espaços | `financial_spaces`, `financial_space_members` (owner/admin/member, status), `space_invitations` (token com hash, validade de 7 dias) |
| Finanças | `category_groups` (necessidades / viver / investimentos), `categories` (`system_key` estável), `accounts`, `cards` (apelido + 4 últimos dígitos), `transactions`, `recurring_rules` |
| Planejamento | `monthly_plans`, `plan_group_budgets`, `plan_category_budgets`, `goals`, `goal_contributions`, view `goals_with_progress` |
| WhatsApp | `whatsapp_identities`, `whatsapp_messages`, `whatsapp_pending_actions` |
| Observabilidade | `ai_usage_events`, `audit_log` (triggers) |

Convenções:

- **Dinheiro em centavos** (`bigint`), sempre positivo. O sinal vem do `type` (`income` / `expense`).
- **Datas** são `date`, no fuso do espaço (padrão `America/Sao_Paulo`). "Hoje" é `todayIn(space.timezone)`, nunca o fuso do servidor.
- Transações não são apagadas fisicamente: `deleted_at` (soft delete) e não existe grant de `DELETE`.
- `space_id`, `created_by` e `source` são imutáveis (trigger `protect_transaction_columns`).
- Idempotência: índice único por `(space_id, source, source_ref, installment_number)` para lançamentos vindos de mensagens, e por `(recurring_rule_id, recurring_occurrence_on)` para recorrências.

## Segurança e privacidade

**RLS em todas as tabelas.** Os helpers `security definer` (`is_space_member`, `space_role`, `is_space_admin`, `can_view_transaction`, `can_edit_transaction`) evitam recursão entre políticas. O papel `anon` não tem acesso a nada.

Privacidade no modo casal (a regra vive no banco e é espelhada em `src/domain/permissions.ts` para a UI e o demo):

| Escopo | Visibilidade | Quem vê | Quem edita |
|---|---|---|---|
| Compartilhado | espaço | todos os membros | todos os membros |
| Pessoal | espaço | todos os membros | só o responsável / quem criou |
| Pessoal | privado | só o responsável / quem criou | só o responsável / quem criou |

Os totais também respeitam isso: `space_category_totals` é `security invoker`, então um gasto privado do parceiro não entra nos seus números. O planejamento do espaço é comparado com o que cada um pode ver.

**Service role (`SUPABASE_SECRET_KEY`).** Só no servidor (`import 'server-only'`) e só onde não há sessão de usuário: webhook do WhatsApp e jobs. Nesses caminhos, o store aplica explicitamente a verificação de membro ativo e a privacidade, e as agregações usam funções que recebem o viewer como parâmetro (`space_category_totals_as`, executável só pelo `service_role`).

Outras medidas:

- Webhook com assinatura HMAC (`X-Hub-Signature-256`) comparada em tempo constante, limite de 1 MB e filtro por `phone_number_id`.
- Download de mídia só de hosts da Meta, com limite de 10 MB. A mídia nunca é gravada em disco nem no banco.
- Headers de segurança (HSTS, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy).
- O logger remove chaves sensíveis (telefone, texto, valores, descrição, e-mail, tokens, códigos). Telefones aparecem mascarados.
- Nunca guardamos número completo de cartão, CVV, senha ou credencial bancária.

## Regras financeiras (determinísticas, em `src/domain/finance`)

- **Resultado** = receitas − despesas de consumo. Aportes (grupo de investimentos) não são "gasto": aparecem separados.
- **Índice de poupança** = resultado ÷ receitas.
- **Planejamento**: receita prevista distribuída em grupos (% ou R$), com limites opcionais por categoria. O modelo sugerido (50/35/15 ou 50/40/10) é só um ponto de partida.
- **Disponível para gastar** = planejado para consumo − gasto de consumo, com valor por dia até o fim do mês.
- **Ritmo**: consumido vs. mês decorrido, em pontos-base inteiros (sem float). Margens de ±5 e ±15 p.p. definem "no ritmo", "atenção" e "acima do ritmo".
- **Comparações** com o mês anterior usam o mesmo período (dia 1 até o mesmo dia).
- **Parcelas**: o valor é dividido em centavos, e a sobra vai para a primeira parcela. Cada parcela cai na fatura certa pelas datas de fechamento e vencimento do cartão.
- **Recorrências**: calculadas por regra (semanal / mensal / anual, com intervalo) e lançadas pelo job ou pelo botão "Verificar vencimentos". São idempotentes.

## Renderização e dados

- As páginas do app são Server Components dinâmicos. Buscam só agregados (`space_category_totals`, `space_monthly_totals`, `card_spend_totals`), nunca o histórico inteiro.
- As mutações são Server Actions com validação Zod, `runAction` (erros tipados → mensagens em pt-BR) e `revalidatePath`.
- Os filtros de movimentações vivem na URL, o que os torna compartilháveis e compatíveis com o botão voltar.
- Os gráficos têm tabela equivalente (acessibilidade) e paleta validada para daltonismo nos temas claro e escuro.

## Jobs

`/api/cron/[job]` exige `Authorization: Bearer $CRON_SECRET`:

- `recorrencias`: lança ocorrências vencidas de todas as regras ativas com `auto_post`, respeitando o fuso de cada espaço.
- `retencao`: `purge_expired_data()` apaga o texto das mensagens do WhatsApp após 30 dias e expira pendências (30 min) e convites.

## Testes

| Suíte | O que cobre |
|---|---|
| `tests/unit` (Vitest) | dinheiro, datas, cálculos financeiros, ritmo, parcelas, faturas, recorrências, metas, permissões, interpretador por regras, pipeline do WhatsApp completo com store demo |
| `tests/db` (Vitest + Postgres 16) | migrations + seed, RLS entre usuários e espaços, privacidade, convites, funções SQL, idempotência |
| `e2e` (Playwright) | login demo, nova movimentação, simulador do WhatsApp, privacidade entre membros (desktop e mobile) |

Os testes de banco rodam com um stub mínimo do Supabase (`tests/db/supabase-stub.sql`: schema `auth`, `auth.uid()`, papéis), então não precisam de Docker nem da CLI.
