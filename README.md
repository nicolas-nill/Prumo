# PRUMO

Assistente financeiro pessoal e compartilhado, **WhatsApp-first**. A pessoa registra gastos e receitas mandando mensagem (texto, áudio ou foto do comprovante) e acompanha no painel web o mês, o planejamento, as metas e o que ainda pode gastar. No modo casal, cada pessoa tem sua conta de acesso e as duas compartilham o espaço financeiro. Gastos pessoais e privados continuam privados.

> Estado atual e próximos passos: [STATUS.md](STATUS.md) · Arquitetura: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · WhatsApp: [docs/WHATSAPP.md](docs/WHATSAPP.md) · IA: [docs/AI.md](docs/AI.md) · Decisões: [docs/DECISIONS.md](docs/DECISIONS.md)

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript estrito, Tailwind CSS 4, Supabase (Postgres + Auth + RLS), Zod, React Hook Form, Radix UI, Lucide, Recharts, next-themes. Testes com Vitest (unitários e banco) e Playwright (E2E).

## Rodando em 1 minuto (modo demonstração)

Não precisa de nenhuma credencial:

```bash
npm install
npm run dev
```

Abra http://localhost:3000/entrar e escolha **Lucas** ou **Marina**. São dados fictícios, guardados em memória. Entre como cada um para ver a privacidade entre membros. O simulador do WhatsApp fica em **/dev/whatsapp** e usa exatamente o mesmo pipeline do webhook real.

Sem Supabase configurado, o modo demo liga sozinho em desenvolvimento. Para forçar: `PRUMO_DEMO_MODE=on`.

## Rodando com Supabase

1. Crie um projeto em https://supabase.com (região São Paulo recomendada).
2. Aplique as migrations de `supabase/migrations/` **em ordem**. Com a CLI:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   Sem a CLI, cole cada arquivo no SQL Editor, na ordem do nome.
3. Copie `.env.example` para `.env.local` e preencha, no mínimo:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` (o webhook e os jobs usam essa última).
4. Configure a autenticação (abaixo) e rode `npm run dev`.

`supabase/seed.sql` cria dois usuários de teste e o espaço de exemplo. **Só para desenvolvimento local**: `npx supabase db reset` aplica migrations e seed. Nunca rode o seed em produção.

### Autenticação (Supabase → Authentication)

- **URL Configuration**: Site URL = `NEXT_PUBLIC_APP_URL`. Redirect URLs: `<app>/auth/confirm` e `<app>/auth/callback`.
- **Email Templates**: use o fluxo com `token_hash`, que funciona em qualquer navegador e dispositivo:
  - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/comecar`
  - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
  - Change email: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`
- Os links padrão do Supabase (`?code=`) também funcionam, via `/auth/callback`.
- Para produção, configure um SMTP próprio (o SMTP embutido do Supabase tem limite baixo de envios).

## Variáveis de ambiente

Todas estão documentadas em [`.env.example`](.env.example). Nenhuma derruba a aplicação: sem uma variável, só o recurso que depende dela fica desligado, e a interface diz o que falta. `GET /api/health` mostra o que está configurado, nunca os valores.

| Variável | Onde | Para quê |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | App | Links de convite, redirects de auth, mensagens do WhatsApp |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API | Banco e auth. A chave publicável pode ir ao navegador: o RLS protege os dados |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API | **Só servidor.** Webhook do WhatsApp e jobs (não há sessão de usuário) |
| `OPENAI_API_KEY` (+ modelos) | platform.openai.com | Interpretação por IA, áudio e comprovantes. Sem ela, o texto simples segue funcionando por regras |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta for Developers | WhatsApp Cloud API. Veja [docs/WHATSAPP.md](docs/WHATSAPP.md) |
| `NEXT_PUBLIC_WHATSAPP_DISPLAY_NUMBER` | App | Número exibido para o usuário mandar mensagens |
| `CRON_SECRET` | App / Vercel | Protege `/api/cron/*` |
| `PRUMO_DEMO_MODE` | App | `on` força o demo; `off` exige Supabase |
| `PRUMO_DEV_TOOLS` | App | `true` libera o simulador fora de desenvolvimento (não use em produção) |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript |
| `npm test` | Testes unitários (domínio, IA por regras, pipeline do WhatsApp) |
| `npm run db:local` | Sobe um PostgreSQL 16 local na porta 54329 (para os testes de banco) |
| `npm run test:db` | Migrations + seed + RLS contra Postgres real (stub do Supabase) |
| `npm run test:e2e` | Playwright em modo demo (desktop e mobile) |
| `npm run db:seed:generate` | Regera `supabase/seed.sql` a partir do dataset demo |
| `npm run db:types` | Regera `src/types/database.types.ts` a partir das migrations |
| `npm run check` | lint + typecheck + testes + build |

Para o E2E reaproveitar um Chromium já instalado, use `PLAYWRIGHT_CHROMIUM_PATH=/caminho/chrome`. Para rodar contra um servidor que já está no ar, use `E2E_BASE_URL=http://localhost:3000`.

## Deploy (Vercel)

1. Importe o repositório, defina as variáveis de ambiente e publique.
2. `vercel.json` agenda dois jobs (horário UTC):
   - `/api/cron/recorrencias`, diário às 09:00: lança as recorrências vencidas.
   - `/api/cron/retencao`, diário às 06:30: apaga o texto das mensagens com mais de 30 dias e expira pendências e convites.

   A Vercel envia o `CRON_SECRET` automaticamente. Em outro provedor, chame com `Authorization: Bearer $CRON_SECRET`.
3. Registre o webhook do WhatsApp em `<app>/api/whatsapp/webhook` (veja [docs/WHATSAPP.md](docs/WHATSAPP.md)).

Em produção sem Supabase, o app mostra `/configuracao` em vez de quebrar.

## Estrutura

```
src/
  app/               rotas (App Router): (auth), (app), api/, landing
  components/        UI: ui/ (design system), dashboard/, transactions/, whatsapp/ …
  domain/            regras puras: dinheiro, datas, cálculos financeiros, permissões, planos
  features/          casos de uso por área: actions, schemas, queries, whatsapp/, ai/
  server/            sessão, clientes Supabase, repositórios (Supabase e demo)
  lib/               env, erros, logger, utilitários
  proxy.ts           sessão e proteção de rotas (Next 16: substitui o middleware)
supabase/            migrations, seed, config da CLI
tests/               unit/ e db/ (Vitest) · e2e/ (Playwright)
docs/                arquitetura, WhatsApp, IA, decisões
```

## Licenças de terceiros

As fontes DM Sans e Manrope são distribuídas sob a SIL Open Font License 1.1 (veja [`src/app/fonts/LICENSE.md`](src/app/fonts/LICENSE.md)).
