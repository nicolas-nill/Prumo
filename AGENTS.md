<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PRUMO — convenções do projeto

Leia `README.md`, `docs/ARCHITECTURE.md` e `STATUS.md` antes de mudar algo grande.

- **Dinheiro**: sempre centavos inteiros (`number` no TS, `bigint` no banco). Nunca float. Use `src/domain/money.ts` para converter e formatar.
- **Datas**: `ISODate` (`YYYY-MM-DD`) no fuso do espaço. "Hoje" é `todayIn(space.timezone)`, nunca `new Date()` direto na regra de negócio.
- **Cálculos financeiros** ficam em `src/domain` (puro, testado). A IA nunca calcula: ela devolve texto e o código converte.
- **Acesso a dados** passa pelo repositório do viewer (`getSpaceContext().viewer.repo`). Páginas não chamam o Supabase diretamente. Toda regra nova de permissão entra no RLS **e** no `DemoRepository`/`domain/permissions.ts`.
- **Service role** (`getAdminClient`) só em webhook e jobs, com filtros explícitos de membro e privacidade.
- **Mutações**: Server Action em `features/<área>/actions.ts` com schema Zod em `schemas.ts` (arquivos `'use server'` só exportam funções async), `runAction` e `revalidatePath`.
- **Migrations**: nunca edite uma migration já aplicada. Crie uma nova em `supabase/migrations/`, rode `npm run test:db` e `npm run db:types`. Se mudar o dataset demo, rode `npm run db:seed:generate`.
- **UI**: use os componentes de `src/components/ui` e os tokens de `globals.css` (sem hex solto, sem emoji como interface). Cores de gráfico vêm de `--chart-*`/`tone-*-solid`, e status (`success`/`warning`/`danger`) nunca é usado como cor de categoria.
- **Textos** da interface e do WhatsApp em pt-BR. As respostas do WhatsApp ficam centralizadas em `features/whatsapp/replies.ts`.
- **Logs**: `logger` de `lib/observability`, nunca com dados financeiros, telefone ou texto de mensagem (o redator remove as chaves conhecidas, mas não conte só com ele).
- Antes de commitar: `npm run lint && npm run typecheck && npm test` (e `npm run test:db` se tocar em SQL).
