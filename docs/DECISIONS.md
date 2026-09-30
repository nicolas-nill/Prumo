# Decisões

Registro curto das decisões de arquitetura e produto, com o porquê. As mais recentes ficam no fim.

## D1. Espaço financeiro como unidade de tudo

Toda informação financeira pertence a um `financial_space`, não a um usuário. O modo casal é um espaço com dois membros, e o pessoal é um espaço com um. O mesmo código atende os dois casos, o convite é só "entrar em um espaço", e o RLS tem uma regra central (`is_space_member`). FKs compostas `(space_id, id)` impedem referências cruzadas entre espaços.

## D2. Privacidade por escopo e visibilidade, aplicada no banco

"Pessoal e privado" é imposto pelo RLS (`can_view_transaction`) e pelas agregações `security invoker`, não pela UI. A regra é espelhada em `domain/permissions.ts` só para a interface decidir o que mostrar como editável. O produto não pode virar ferramenta de vigilância entre parceiros.

## D3. Dinheiro em centavos inteiros, datas no fuso do espaço

`bigint` em centavos, sem float em nenhum cálculo (o ritmo usa pontos-base). "Hoje" é sempre `todayIn(space.timezone)`, porque o servidor roda em UTC, e às 22h de São Paulo já é "amanhã" em UTC.

## D4. A IA nunca faz contas

O modelo devolve o valor como texto literal, e o código converte, soma e compara. Isso elimina uma classe inteira de erros ("a IA somou errado") e torna as respostas auditáveis. Detalhes em [AI.md](AI.md).

## D5. Regras antes da IA

A maioria das mensagens ("gastei 35 no almoço") é resolvida por regras: custo zero, latência zero, determinístico. A IA entra só no que as regras não resolvem com confiança ≥ 0,85, e se falha, o sistema volta às regras. Isso também faz o produto funcionar sem chave da OpenAI.

## D6. Um único pipeline para webhook e simulador

O simulador monta um payload no formato da Meta e chama o mesmo `handleEvents`. Só o transporte de saída muda (`CaptureTransport`). O que funciona no simulador funciona em produção, e os testes cobrem o caminho real.

## D7. Service role só onde não há usuário, com filtros explícitos

O webhook e os jobs não têm sessão, então usam a service role. Para não perder o RLS nesses caminhos, o store aplica membro ativo e privacidade explicitamente, e as agregações recebem o viewer como parâmetro (`*_as`, executáveis só pelo `service_role`). Nas páginas, sempre o cliente do usuário.

## D8. Repositório com implementação demo fiel

`FinanceRepository` tem duas implementações. A demo aplica as mesmas regras de permissão do RLS. Assim o produto roda e é testável sem nenhuma credencial, e a UI não sabe de onde vêm os dados. O dataset demo também gera o `seed.sql`, uma fonte só.

## D9. Confirmação só quando há incerteza

Registrar direto é o que torna o WhatsApp mais rápido que abrir um app. A confirmação aparece em casos objetivos: confiança baixa, valor alto, data estranha, parcelado ou foto. Ver [WHATSAPP.md](WHATSAPP.md#confirmação).

## D10. Idempotência em camadas

Retries da Meta, cron rodando duas vezes e duplo clique não podem duplicar dinheiro. Há três barreiras: índice único de `wamid`, `source_ref` único por espaço e fonte, e `(regra, data)` único para recorrências. Conflito vira "já estava registrado", não erro.

## D11. Não guardar o que não precisa

Mídia nunca é persistida. O texto das mensagens expira em 30 dias. Cartão guarda só apelido e 4 últimos dígitos. O código de vínculo fica só como hash. O logger remove dados financeiros e telefones. O fornecedor de IA é chamado com `store: false`.

## D12. Planos definidos em código e espelhados no banco

`PLAN_ENTITLEMENTS` define limites (membros, ações de IA, recorrências, histórico) sem preço, porque o preço não está decidido. O limite de membros é imposto no banco (`accept_invitation`), e um teste garante que a tabela `plans` e o código concordam. Não há checkout (fora do escopo).

## D13. Next.js 16 com Server Components e Server Actions

Páginas buscam agregados no servidor, e as mutações são Server Actions com Zod. Não há API REST interna para manter. `proxy.ts` (antigo middleware) cuida só de sessão e redirecionamentos. A sessão chama `connection()`, porque o modo de dados vem do ambiente em tempo de execução e nenhuma página pode ser pré-renderizada com um redirect decidido no build.

## D14. Design system próprio com tokens

A paleta preserva a referência visual (verde profundo, neutros quentes, tons suaves por grupo), mas os tokens foram redesenhados para o modo escuro, e não invertidos. Os gráficos usam uma paleta sólida separada, validada para daltonismo e contraste nos dois temas. Os tons pastel ficam só como superfícies. Barras "acima do limite" têm textura própria, para status não ser confundido com a cor de uma categoria.

## D15. Tipografia

Manrope para títulos e números em destaque, DM Sans para texto. Valores em listas usam algarismos tabulares (alinham), e números isolados usam proporcionais (ficam mais bonitos). As fontes são servidas localmente (sem requisição a terceiros).

## D16. Fora do escopo nesta fase

Open Finance, investimentos, imposto de renda, pagamentos/checkout e chatbot genérico. A arquitetura não impede nenhum deles, mas cada um traz risco regulatório ou de produto que precisa de decisão própria.
