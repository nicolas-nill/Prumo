# WhatsApp

O WhatsApp é a porta de entrada principal do PRUMO. A pessoa manda "gastei 47,90 no almoço", um áudio ou a foto de um comprovante, e o lançamento aparece no painel. Tudo passa por **um único pipeline** (`src/features/whatsapp/pipeline.ts`), usado igualmente pelo webhook da Meta e pelo simulador local.

## Configuração na Meta (WhatsApp Cloud API)

1. Em https://developers.facebook.com, crie um app do tipo **Business** e adicione o produto **WhatsApp**.
2. Em **WhatsApp → API Setup**, anote o **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`). Em produção, registre um número próprio.
3. Crie um **System User** no Business Manager com a permissão `whatsapp_business_messaging` e gere um token permanente (`WHATSAPP_ACCESS_TOKEN`). O token temporário da página de setup expira em 24h.
4. Em **App settings → Basic**, copie o **App secret** (`WHATSAPP_APP_SECRET`).
5. Invente um token de verificação qualquer (`WHATSAPP_VERIFY_TOKEN`).
6. Em **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://<seu-app>/api/whatsapp/webhook`
   - Verify token: o mesmo de `WHATSAPP_VERIFY_TOKEN`
   - Assine o campo **messages**.
7. Defina `NEXT_PUBLIC_WHATSAPP_DISPLAY_NUMBER` com o número que o usuário verá no app.
8. O webhook usa a service role: `SUPABASE_SECRET_KEY` precisa estar definida.

Confira em `GET /api/health`: `integrations.whatsapp` deve ser `true`.

## Endpoint

`/api/whatsapp/webhook` (Node.js runtime, fora do proxy de sessão):

- **GET**: verificação da Meta. Compara `hub.verify_token` em tempo constante e devolve `hub.challenge`, ou 403.
- **POST**:
  1. 503 se a integração não estiver configurada.
  2. Corpo limitado a 1 MB (413).
  3. Assinatura `X-Hub-Signature-256` (HMAC-SHA256 com o App secret), comparada em tempo constante (401 se inválida).
  4. Payload validado com Zod e normalizado em eventos (`meta/normalize.ts`). Payload assinado mas inesperado recebe 200, para a Meta não reenviar lixo para sempre.
  5. Só entram mensagens destinadas ao nosso `phone_number_id`.
  6. Responde **200 imediatamente** e processa depois da resposta (`after()`). Reenvios da Meta são descartados pela deduplicação.
- Eventos de **status** (`sent`, `delivered`, `read`, `failed`) atualizam as mensagens enviadas.

## Vínculo de número (identidade)

Um número só registra em nome de alguém depois de provar que é dessa pessoa:

1. No app, em **WhatsApp**, a pessoa informa o número. `start_whatsapp_link` gera um código de 6 dígitos, válido por 15 minutos. O banco guarda só o hash (`sha256(identity_id:código)`).
2. A pessoa manda `PRUMO 123456` para o número do PRUMO.
3. `verify_whatsapp_link` confere o código. Depois de 5 tentativas erradas, a identidade é bloqueada. Um número verificado não pode ser vinculado a outra conta. Há limite de 5 pedidos pendentes por hora.
4. Números brasileiros são comparados com e sem o **9º dígito** (`phoneVariants`), porque a Meta às vezes entrega o formato antigo.

Remetente desconhecido recebe uma única resposta a cada 24h, com o link para conectar. Nada é registrado, e o texto da mensagem não é guardado.

A identidade aponta para um **espaço padrão** (o pessoal ou o do casal), que a pessoa escolhe no app. A cada mensagem, o pipeline confere se ela ainda é membro ativo desse espaço.

## Pipeline

```
evento → dedupe (wamid) → código de vínculo? → identidade → espaço e membro ativo
      → texto | áudio (transcrição) | imagem (leitura do comprovante)
      → pendência aberta? (sim / não / categoria)
      → interpretação (regras primeiro, IA se precisar, validada por Zod)
      → validação determinística: valor, data, categoria, cartão, escopo
      → registrar | pedir confirmação | corrigir | apagar | responder com números do banco
      → resposta → registro da mensagem enviada
```

**Deduplicação.** Toda mensagem recebida é gravada primeiro com índice único `(direction, wa_message_id)`. Se o mesmo `wamid` chegar de novo, o pipeline para ali (`status: duplicate`). Os lançamentos também carregam `source_ref = wamid`, com índice único, como segunda barreira.

**Operações entendidas:**

| Operação | Exemplos |
|---|---|
| Registrar | "gastei 47,90 no almoço", "recebi 5.000 de salário", "notebook 2.400 em 10x no Nubank", "paguei 320 no mercado ontem" |
| Corrigir o último | "na verdade foram 42", "foi no cartão Nubank", "muda para mercado" (lançamentos da própria pessoa nas últimas **2 horas**) |
| Apagar | "apaga o último" (registro da própria pessoa nos últimos **30 min**), "apaga o Uber de 23,50 de ontem" (busca nos últimos **7 dias**; se houver vários candidatos, pergunta qual) |
| Consultar | "quanto ainda posso gastar?", "quanto gastei com mercado?", "resumo do mês", "qual foi meu maior gasto?" |
| Ajuda | "ajuda", "o que você entende?" |

As respostas de consulta usam as mesmas funções do dashboard. Nenhum número vem da IA.

## Confirmação

Um lançamento é registrado direto quando está claro. Pede confirmação, com botões **Confirmar / Cancelar**, quando (`CONFIRMATION_RULES`):

| Motivo | Regra |
|---|---|
| Baixa confiança | confiança < 0,75 |
| Valor alto | ≥ R$ 5.000 |
| Data no futuro | depois de hoje |
| Data antiga | mais de 60 dias atrás |
| Parcelado | sempre |
| Comprovante (foto) | sempre |

Sem categoria reconhecível, o PRUMO oferece até 3 sugestões em botões. As pendências expiram em 30 minutos. Responder "sim" ou "não" por texto também funciona.

Depois de registrar, a resposta inclui o ritmo da categoria quando há orçamento ("Você já usou 72% do orçamento de Restaurantes com 60% do mês").

## Áudio e imagem

- **Áudio**: baixado da Meta (só hosts da Meta, até 10 MB), transcrito (`OPENAI_TRANSCRIPTION_MODEL`) e interpretado como texto. A confirmação mostra o que foi entendido ("Entendi: ...").
- **Imagem**: leitura estruturada do comprovante (estabelecimento, total, data, forma de pagamento, parcelas). Sempre pede confirmação. Se não for comprovante ou o total estiver ilegível, pede o valor em texto.
- **Documento (PDF)**: ainda não é lido. A resposta pede foto ou texto.
- A mídia fica só na memória durante o processamento: **nunca é gravada** em disco, no banco ou em storage.
- Cada chamada de IA (texto que as regras não resolvem, áudio e imagem) conta na cota mensal do plano: Free 150, Premium 3.000. Texto resolvido por regras não conta. Quando a cota acaba, o texto continua funcionando por regras.
- Sem `OPENAI_API_KEY`, áudio e imagem recebem uma resposta educada pedindo texto. O texto simples continua funcionando por regras.

## Dados guardados

| Dado | Retenção |
|---|---|
| Texto da mensagem, transcrição, legenda | 30 dias (`content_expires_at`), para correções e suporte. Depois vira `null` pelo job `retencao` |
| Metadados (tipo, status, horários, intenção sanitizada) | Enquanto a conta existir |
| Hash do remetente | Enquanto a conta existir (identifica desconhecidos sem guardar o número) |
| Áudio e imagem | Nunca |
| Código de vínculo | Só o hash, até verificar ou expirar |

Os logs usam `correlationId` e mascaram o telefone. Texto, valores e descrições são removidos pelo logger.

## Simulador (desenvolvimento)

Em **/dev/whatsapp** (só em desenvolvimento, ou com `PRUMO_DEV_TOOLS=true`):

- Monta um payload **no formato da Meta**, normaliza e chama o **mesmo** `handleEvents`.
- A única diferença é o transporte: `CaptureTransport` captura as respostas para exibir na tela em vez de chamar a Graph API.
- Dá para escolher o remetente (Lucas, Marina ou um número qualquer, para testar desconhecido e vínculo), enviar texto, "áudio" (texto que simula a transcrição) ou foto (exemplos prontos ou um arquivo real), e responder aos botões.
- O painel lateral mostra status, intenção interpretada, origem (regras ou IA) e o lançamento criado.
- Sem chave da OpenAI, áudio e foto usam fixtures determinísticos (`features/ai/fixtures.ts`). Com chave, a interpretação usa a OpenAI de verdade.
- Em produção, `/dev/*` responde 404 no proxy.

## Testando com a Meta de verdade

1. Publique (ou exponha o localhost com um túnel HTTPS) e registre o webhook.
2. Na página de setup da Meta, adicione seu número como destinatário de teste.
3. No app, conecte o número em **WhatsApp**, mande `PRUMO <código>` e depois "gastei 10 no café".
4. Acompanhe `whatsapp.*` nos logs (JSON em produção).

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Verificação do webhook falha | `WHATSAPP_VERIFY_TOKEN` diferente do informado na Meta |
| 401 "Invalid signature" | `WHATSAPP_APP_SECRET` errado, ou proxy alterando o corpo |
| Mensagens chegam mas não há resposta | `WHATSAPP_ACCESS_TOKEN` expirado (use token de System User) ou `SUPABASE_SECRET_KEY` ausente |
| "Este número ainda não está conectado" | O número não foi verificado com o código |
| Resposta de erro fora da janela de 24h | A Meta só permite mensagens livres até 24h depois da última mensagem da pessoa. O PRUMO sempre responde dentro dessa janela |
