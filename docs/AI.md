# IA

## Princípio

**A IA lê linguagem, o código faz as contas.** O modelo só transforma "paguei trezentos e vinte no mercado ontem" em uma estrutura (`operation`, `amountText: "trezentos e vinte"`, `date`, `categoryKey`, ...). Tudo o que é número (converter o valor em centavos, dividir parcelas, somar o mês, calcular o que resta do orçamento, o ritmo e a fatura) é feito por código determinístico e testado (`src/domain`). O valor volta como **texto literal** e é convertido por `parseMoneyToCents`. Se a IA "inventar" uma soma, ela nem tem onde colocá-la.

Consequências:

- Consultas ("quanto ainda posso gastar?") são respondidas com os mesmos agregados SQL do dashboard. A IA só identifica a pergunta.
- Toda saída é validada por Zod (`src/features/ai/schemas.ts`) antes de seguir. Um campo fora do formato vira erro controlado, nunca um dado gravado.
- Categorias só podem ser escolhidas entre as chaves do espaço. Uma chave desconhecida é descartada, e o PRUMO pergunta a categoria.

## Camadas

```
texto ─► interpretWithRules (regex, grátis, instantâneo)
           │ confiança ≥ 0,85, ou sim/não/ajuda ─► usa as regras
           ▼
         AIProvider.interpret (se configurado e dentro da cota)
           │ falhou / indisponível / "unknown" ─► volta para as regras
           ▼
         Zod ─► validação determinística ─► confirmação (docs/WHATSAPP.md)
```

| Provider | Arquivo | Uso |
|---|---|---|
| Regras | `features/ai/rules.ts` | Sempre roda primeiro. Entende os formatos comuns de valor ("47,90", "1.200", "2 mil", "R$ 35"), datas relativas ("ontem", "sexta", "dia 5"), parcelas ("10x"), cartões e contas pelo nome, categorias por palavras-chave, correções, exclusões, consultas, sim/não e ajuda. |
| OpenAI | `features/ai/openai.ts` | Texto ambíguo, áudio e comprovantes. |
| Fixtures | `features/ai/fixtures.ts` | Simulador e testes sem chave: áudio e imagem com respostas determinísticas. |

A interface `AIProvider` (`features/ai/provider.ts`) é pequena: `interpret`, `transcribe` e `extractReceipt`, mais `capabilities`. Para trocar de fornecedor, basta implementá-la e registrar em `features/whatsapp/deps.ts`.

## OpenAI

- **Texto e visão**: Responses API (`POST /responses`) com **Structured Outputs** (`text.format = json_schema`, `strict: true`). Os schemas de transporte (JSON Schema) ficam ao lado dos schemas Zod de validação.
- **Áudio**: `POST /audio/transcriptions`. O texto transcrito passa pelo mesmo interpretador.
- `store: false`: as mensagens financeiras não ficam guardadas no fornecedor para consulta posterior.
- Em modelos de raciocínio (`gpt-5*`, `o*`), o esforço é `low`: é uma tarefa curta de extração.
- Timeout de 20s por chamada (`OPENAI_TIMEOUT_MS`). A transcrição tem 20s a mais.
- O prompt de sistema traz a data de hoje e o fuso do espaço (para resolver "ontem"), as categorias do espaço com suas chaves, os apelidos de cartões e contas, e se o espaço é de casal. Ele proíbe calcular valores e repetir dados sensíveis (CPF, documentos, senhas).
- Comprovantes: extrai só estabelecimento, total **como impresso**, data, meio de pagamento e parcelas. Não lista itens e não guarda a imagem.

Variáveis (`.env.example`):

| Variável | Padrão | Observação |
|---|---|---|
| `OPENAI_API_KEY` | — | Sem ela, só regras. Áudio e foto respondem pedindo texto |
| `OPENAI_TEXT_MODEL` | `gpt-5-mini` | Interpretação de texto |
| `OPENAI_VISION_MODEL` | `gpt-5-mini` | Comprovantes |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | Áudio |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Proxy/gateway compatível |
| `OPENAI_TIMEOUT_MS` | `20000` | |

## Custo e cotas

- Toda chamada grava um `ai_usage_events`: operação, provider, modelo, tokens, segundos de áudio, **custo estimado** (micro-USD), latência, sucesso e `correlation_id`. Nunca guarda o conteúdo.
- A tabela de preços de estimativa fica em `features/ai/pricing.ts`. **Revise contra a página de preços do fornecedor** antes de usar os números para decidir planos. Um modelo desconhecido registra custo `null`, nunca um número errado.
- A cota mensal por espaço vem de `PLAN_ENTITLEMENTS.aiActionsPerMonth` (Free 150, Premium 3.000, ambos provisórios). Acabou a cota, o texto segue por regras, e áudio e foto recebem um aviso.
- Custo por usuário no mês:
  ```sql
  select user_id, count(*), sum(estimated_cost_usd_micros) / 1e6 as usd
  from ai_usage_events
  where created_at >= date_trunc('month', now())
  group by 1 order by 3 desc;
  ```

## Privacidade

- A mídia (áudio e imagem) só existe na memória durante o processamento.
- A intenção guardada em `whatsapp_messages.intent` é **sanitizada**: operação, tipo, chave de categoria, se havia valor, data, parcelas, escopo, pergunta e confiança. Não guarda texto livre, valor nem descrição.
- O texto da mensagem fica 30 dias (para "na verdade foram 42" e suporte) e depois é apagado pelo job de retenção.
- Os logs registram só metadados (`ai.called`: operação, modelo, latência, sucesso).

## Qualidade e testes

- `tests/unit/ai-rules.test.ts`: frases reais em pt-BR (valores, datas, parcelas, cartões, correções, consultas).
- `tests/unit/whatsapp-pipeline.test.ts`: pipeline completo com fixtures: registro, categoria ambígua, confirmação, correção, exclusão, dedupe, vínculo, áudio, comprovante, consultas, privacidade entre membros, cota de IA e ausência de dados sensíveis.
- Para avaliar um modelo novo: rode o simulador com `OPENAI_API_KEY`, mande as frases do teste de regras e compare a coluna "origem" (regras × IA) e a intenção no painel lateral.

## O que a IA não faz (de propósito)

Não conversa sobre assuntos gerais (não é um chatbot), não dá recomendação de investimento, não calcula imposto, não acessa banco (sem Open Finance) e não toma decisões sem confirmação em casos incertos.
