# STATUS

_Atualizado em 30/09/2026 · branch `claude/projeto-prumo-oiy21w`_

**Fase atual:** primeira versão completa do produto, rodando em modo demonstração e pronta para receber credenciais (Supabase, Meta, OpenAI) e ir para um ambiente de staging.

## Verificação

| Checagem | Resultado |
|---|---|
| `npm run lint` | limpo |
| `npm run typecheck` | limpo (TS estrito) |
| `npm test` | 92 testes passando |
| `npm run test:db` | 17 testes passando (Postgres 16 real, migrations + seed + RLS) |
| `npm run test:e2e` | 8 testes passando (4 fluxos × desktop e mobile) |
| `npm run build` | ok, com e sem credenciais (sem credenciais cai em `/configuracao`) |
| Revisão visual | todas as páginas em 1440px e 375px, claro e escuro |

## Implementado

- **Base**: Next.js 16, TypeScript estrito, design system com tokens claro/escuro, tipografia local, env tipado, logger com redação, erros tipados, headers de segurança.
- **Banco**: 21 tabelas, RLS em todas, funções SQL para operações sensíveis (onboarding, convites, planejamento, vínculo de WhatsApp, retenção), auditoria por trigger, idempotência, seed gerado, tipos gerados.
- **Auth**: cadastro, login, confirmação de e-mail (`token_hash` e `code`), recuperação de senha, logout, proteção de rotas no proxy.
- **Onboarding**: nome, tipo de espaço, receita, categorias e modelo de planejamento.
- **Dashboard**: receitas, despesas, resultado, índice de poupança, plano do mês por grupo, disponível para gastar (e por dia), ritmo contra o calendário, destaques, próximos 15 dias (recorrências e faturas), distribuição, evolução em 6 meses (com tabela), recentes, metas. Visões Todos / Eu / Parceiro(a).
- **Movimentações**: lista agrupada por dia, busca, filtros na URL, paginação, criar/editar/excluir, parcelas no cartão, escopo e visibilidade.
- **Recorrentes**: cadastro, pausa, lançamento automático (job) e manual, previsão de 30 dias, limite do plano.
- **Planejamento**: receita prevista, grupos em % ou R$, limites por categoria, copiar do mês anterior.
- **Metas**: criação, aportes, progresso, ritmo necessário por mês, status.
- **Contas e cartões**: contas por pessoa ou conjuntas, cartões com fechamento e vencimento, fatura aberta e fechada.
- **Modo casal**: convite por link (copiar ou enviar pelo WhatsApp), aceite, papéis, remoção, privacidade por escopo e visibilidade no banco.
- **Configurações**: perfil, fuso horário, tema, categorias (criar, editar, arquivar), plano, privacidade.
- **WhatsApp**: webhook com assinatura, deduplicação, vínculo por código, 9º dígito, registro, confirmação por botões, correção, exclusão, consultas, áudio, comprovante, status de entrega, retenção.
- **IA**: regras primeiro; OpenAI com Structured Outputs, validação Zod e `store: false`; fixtures; registro de uso e custo; cota por plano.
- **Simulador** do WhatsApp com o mesmo pipeline. **Jobs** de recorrências e retenção. **Health check**.

## Parcial

- Limite de histórico do plano (`historyMonths`) é exibido, mas não restringe consultas.
- Login com Google: configuração preparada no Supabase, mas desligada.
- PDF enviado pelo WhatsApp não é lido (a resposta pede foto ou texto).
- Custo de IA é registrado, mas só consultável por SQL (sem painel administrativo).
- `audit_log` é gravado, mas não há tela de histórico.
- Transferência entre contas não existe como tipo de lançamento (o enum já prevê `transfer`).
- Saldos de contas: só o saldo inicial, sem conciliação.

## Ausente (fora desta fase ou por decisão)

Open Finance, investimentos, IR, pagamentos/checkout e chatbot genérico (fora do escopo). Notificações proativas no WhatsApp (exigem templates aprovados pela Meta). Exportação CSV. Exclusão de conta e exportação de dados em autoatendimento (LGPD, hoje via suporte). Painel administrativo.

## Não testado contra serviços reais

Tudo foi validado em modo demo, com Postgres 16 local (stub do Supabase) e com fixtures de IA. Ainda **não** foi executado contra:

- um projeto Supabase real (Auth, e-mails, `db push` das migrations);
- a WhatsApp Cloud API real (assinatura e formato de payload estão cobertos por testes, mas a entrega real não);
- a API da OpenAI real (formato das requisições conforme a documentação, sem chamada real);
- Vercel Cron.

## Credenciais que faltam

| Serviço | Variável | Por que é necessária | Onde configurar |
|---|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` | Endereço do banco e da auth | Supabase → Project Settings → API |
| Supabase | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente do navegador/servidor com RLS | Supabase → Project Settings → API Keys |
| Supabase | `SUPABASE_SECRET_KEY` | Webhook do WhatsApp e jobs (sem sessão de usuário) | Supabase → Project Settings → API Keys (só no servidor) |
| OpenAI | `OPENAI_API_KEY` | Texto ambíguo, áudio e comprovantes | platform.openai.com → API keys |
| Meta | `WHATSAPP_VERIFY_TOKEN` | Verificação do webhook | Valor livre, igual no app e em Meta → WhatsApp → Configuration |
| Meta | `WHATSAPP_APP_SECRET` | Validar a assinatura de cada evento | Meta App → Settings → Basic |
| Meta | `WHATSAPP_ACCESS_TOKEN` | Enviar respostas e baixar mídia | Business Manager → System Users (token permanente) |
| Meta | `WHATSAPP_PHONE_NUMBER_ID` | Número de envio e filtro do webhook | Meta → WhatsApp → API Setup |
| App | `NEXT_PUBLIC_WHATSAPP_DISPLAY_NUMBER` | Número exibido ao usuário | Hospedagem (env) |
| App | `NEXT_PUBLIC_APP_URL` | Links de convite, redirects de auth | Hospedagem (env) |
| App | `CRON_SECRET` | Proteger `/api/cron/*` | Hospedagem (env); a Vercel envia sozinha |

## Riscos e débitos técnicos

1. **Primeiro contato com Supabase real**: as migrations foram testadas em Postgres 16 puro com stub. Diferenças de versão ou extensões podem exigir ajuste.
2. **Aprovação da Meta**: número próprio e verificação do negócio levam dias e podem bloquear o lançamento.
3. **Qualidade da IA em áudio real** (ruído, gírias) só se mede com uso real. As regras cobrem o caso comum.
4. Estimativas de custo de IA dependem da tabela de preços em `features/ai/pricing.ts`, que precisa de revisão periódica.
5. O modo demo guarda dados em memória por processo. Não serve para produção (há banner).
6. Faltam E2E contra Supabase real e testes de carga do webhook.

## Próximo passo

1. Criar o projeto Supabase de staging, aplicar as migrations (`supabase db push`), configurar Auth (URLs e templates, veja o README) e preencher as três variáveis do Supabase.
2. Publicar na Vercel com essas variáveis e `CRON_SECRET`, fazer o cadastro real e completar o onboarding.
3. Configurar o app da Meta com o número de teste, registrar o webhook e validar `PRUMO <código>` → "gastei 10 no café".
4. Adicionar `OPENAI_API_KEY` e validar áudio e comprovante reais.
