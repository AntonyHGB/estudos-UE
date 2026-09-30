# Cirurgia — Material de Estudo

Material de estudo de Cirurgia no formato do site: resumos conceituais, quiz de múltipla escolha com correção imediata e questões abertas com autoavaliação.

---

## Como usar este material

**1. Faça o diagnóstico antes de ler.** Cada questão aberta tem um nível:

| Marca | Nível | O que significa |
|---|---|---|
| 🟢 | **Básico** | Conduta inicial e definições que não podem falhar. |
| 🟡 | **Intermediário** | Escolha entre condutas, indicações e limites. |
| 🔴 | **Avançado** | Cenário com armadilha, priorização e exceção à regra. |

Responda em voz alta antes de revelar a resposta. Acertar lendo é reconhecer; acertar respondendo é saber.

**2. Use o quiz para medir.** A aba **Quiz** corrige na hora. Erros entram em **🔁 Revisar erros**.

**3. Deixe a revisão espaçada decidir a ordem.** Tema com 90% ou mais de acerto volta em 14 dias; com 70% ou menos, em 3. A home marca o que está devendo.

**4. Simulado mistura os temas** e não entrega o gabarito até o fim — é o que mais se parece com a prova.

## Estrutura dos arquivos

- `NN-*.md` — resumos e questões abertas de um tema (a fonte de verdade do conteúdo);
- `quiz.json` — questões de múltipla escolha, com a chave do tema;
- `glossario.json` — termos curados que viram atalhos no texto de estudo (primeira menção de cada seção); validado pelo build;
- `index.html`, `manifest.webmanifest`, `sw.js`, `icon-*.png` — **gerados** por `node build-site.mjs`; nunca editar à mão.

As regras completas de autoria e publicação estão no `README.md` da raiz do projeto.

## De onde vem o conteúdo desta trilha

Toda afirmação dos temas vem de **documento de origem identificado**, com arquivo e página do PDF citados no próprio tema. O acervo da disciplina (69 PDFs, pasta do Drive) foi inventariado e está descrito em `_fontes-extraidas/cirurgia/00-inventario.md`, `00-manifesto.md` e `decks/00-manifesto-decks.md`.

| Grupo | Qtd | Papel | Situação |
|---|---|---|---|
| **A. Diretrizes e protocolos** (WSES/AAST/ACS/EAU/SBP, MS/SAMU, ATLS 11ª ed.) | 23 PDFs | Fonte sustentada: afirmações com grau de recomendação e números citáveis | **23/23 extraídos** (`documentos-fontes/cirurgia/referencias/` → `_fontes-extraidas/cirurgia/referencias/`) |
| **B. Decks didáticos** (slides-conteúdo) | 46 PDFs | Esqueleto temático da disciplina, com ênfase e frequência de prova | **46/46 extraídos** (`documentos-fontes/cirurgia/decks/` → `_fontes-extraidas/cirurgia/decks/`) |

Os 46 decks são slides, sem referência bibliográfica formal: onde um número do deck também aparece numa diretriz, o tema confere e **explicita a divergência** quando existe (exemplo: o corte de 200 mL/h na toracotomia — janela de tempo diferente entre o material e a diretriz WSES-AAST 2025).

## Temas integrados localmente (32)

**224 questões abertas e 256 quiz**: 7 abertas e 8 de múltipla escolha por tema. “Integrado” descreve o
build local, não um deploy desta rodada. As citações “slide N” nos decks correspondem à **página N do
PDF local**, não à paginação interna do compilado; os caminhos dos arquivos estão em cada tema.

| Tema | Fontes | Páginas citadas |
|---|---|---|
| 01 — Colecistite aguda | WSES 2016 (guideline) | 3–15 |
| 02 — Apendicite aguda | WSES 2020 (Jerusalem update) | 6–11, 13–35 |
| 03 — Diverticulite aguda | WSES 2020 (ALCD) | 2–14 |
| 04 — Abordagem inicial ao trauma (xABCDE) | deck xABCDE · ATLS 11ª ed. | deck 1–16 · ATLS 26 e 111 |
| 05 — Trauma torácico | deck Trauma torácico · WSES-AAST 2025 | deck 1–10 · WSES 2, 7–8, 14 |
| 06 — Trauma abdominal e pélvico | deck Trauma abdominal · WSES hepático 2020 · WSES pélvico 2017 | deck 1–11 · WSES 2 e 4 · WSES 5 e 8 |
| 07 — Neurotrauma: TCE e coluna | decks TCE e Coluna/TRM · ACS cerebral 2024 · ACS coluna 2022 · WSES medular 2024 · SBP TCE pediátrico 2017 | decks 1–8 e 1–3 · ACS 20 · ACS 10 · WSES 3, 5, 7 · SBP 1 |
| 08 — Fraturas, luxações e lesões ligamentares | decks Fraturas ósseas e Luxações/ligamentares | deck 1–15 · deck 1–8 |
| 09 — Abdome agudo obstrutivo, perfurativo e isquêmico | decks obstrutivo, perfurativo e isquêmico · WSES isquemia mesentérica 2022 · WSES úlcera péptica 2020 | decks 1–9, 1–5, 1–9 · WSES 3–4 · WSES 1–2 |
| 10 — Hemorragia digestiva | deck Hemorragia digestiva · WSES úlcera péptica 2020 | deck 1–22 · WSES 12–13 |
| 11 — Dispepsia, H. pylori e úlcera péptica | deck Síndrome dispéptica | deck 1–8 |
| 12 — Pancreatite aguda | deck Afecções pancreáticas · WSES pancreatite aguda grave 2019 | deck 1–7 · WSES 1–2, 5, 7–8 |
| 13 — Esôfago, disfagia, DRGE e emergências | Síndrome disfágica · WSES emergências esofágicas 2019 | citações no tema 13 |
| 14 — Vias biliares benignas | Afecções benignas das vias biliares | citações no tema 14 |
| 15 — Cólon, reto e polipose | Cólon e reto · Polipose intestinal | citações no tema 15 |
| 16 — Tumores digestivos | Tumores do aparelho digestivo | citações no tema 16 |
| 17 — Hérnias e obesidade | Hérnias · Cirurgia da obesidade | citações no tema 17 |
| 18 — Pré-operatório e técnica | Cuidados pré-operatórios · Técnica operatória | citações no tema 18 |
| 19 — Anestesia | Anestesia | citações no tema 19 |
| 20 — Pós-operatório e feridas | Cuidados pós-operatórios · Feridas, enxertos e retalhos | citações no tema 20 |
| 21 — Cabeça, pescoço e carótidas | Tumores e outras afecções de cabeça/pescoço · Estenose de carótidas | citações no tema 21 |
| 22 — Tórax não traumático | Cirurgia torácica · Tumores pulmonares/mediastino | citações no tema 22 |
| 23 — Vascular periférico | Aneurismas · Doenças venosas · Doença arterial periférica | 1–5 · 1–13 · 1–7 |
| 24 — Urologia benigna/tumores | Afecções urológicas benignas · Tumores urológicos | 1–8 · 1–7 |
| 25 — Trauma urológico | EAU 2026 · ACS geniturinário 2025 | EAU 8–11, 21–27, 34–36 · ACS 23, 60 |
| 26 — Queimaduras, face, pescoço e membros | Queimaduras · Face/pescoço · Membros · ATLS 11ª | decks 1–6, 1–8, 1–2 · ATLS 149–150, 157 |
| 27 — Ortopedia pediátrica, tumores e tendinopatias | Ortopedia pediátrica · Tumores ortopédicos · Tendinites | 1–13 · 1–5 · 1–6 |
| 28 — Cirurgia pediátrica | Cirurgia pediátrica | 1–16 |
| 29 — Oftalmologia | Oftalmologia base | 1–6 |
| 30 — Tumores dermatológicos | Tumores dermatológicos | 1–4 |
| 31 — SBV/SAV SAMU | Protocolos SBV e SAV, foco PCR adulta | SBV 37–39 · SAV 41, 43, 45, 47 |
| 32 — Lesão por pressão | Anvisa 2023 · Protocolo MS · Guia internacional 2026 | 7–14 · 4–5, 7, 9–10 · 2–8, 12–14 |

### Referência complementar para 01–03

`documentos-fontes/cirurgia/decks/abdome-agudo-inflamatorio.pdf`: **PDF p. 1–3** (apendicite),
**12–15** (colecistite) e **20–23** (diverticulite), efetivamente conferidas nesta rodada. É referência
didática, sem alterar as 21 abertas/24 quiz dos temas 01–03. ⚠️ A p. 23 prescreve antibiótico nos quadros
leves de diverticulite de forma geral; não substitui a recomendação WSES 2020 de omitir antibiótico em
imunocompetentes com doença não complicada sem inflamação sistêmica, já explicitada no tema 03.

## Cobertura documental e limites

Esta trilha **não** representa a cobertura completa da disciplina. A matriz documento a documento está em `_fontes-extraidas/cirurgia/00-matriz-cobertura.md`:

| Situação | Qtd |
|---|---|
| PDFs com destino integrado (tema ou referência) | **68** (23 diretrizes/protocolos + 45 decks) |
| PDFs sem destino por volume de redação | **0** |
| PDF **bloqueado** por insuficiência de fonte | **1** (`cirurgia-cardiaca`) |

Cada um dos **69 documentos** tem destino na matriz local: tema(s), referência ou bloqueio com motivo.
Isso não significa leitura integral dos volumes: SAMU cobre PCR adulta; lesão por pressão cobre
prevenção/classificação; ACS urológico tem leitura seletiva de escala renal e genital. Os decks são
didáticos, sem revisão bibliográfica atual para todas as recomendações. Cortes e fluxos históricos não
se tornam condutas universais pelo fato de estarem integrados.

⚠️ **Inconsistências tratadas nesta rodada:** gasometria de priapismo em kPa excluída; conflito G < 6 ×
G ≤ 6 do deck prostático sinalizado; taxas ATLS corrigidas (500 mL/h, divisor 16 como taxa titulável);
“regra dos dois” atribuída a Meckel, não intussuscepção; infiltrado linfocitário do melanoma retirado
do gabarito; “metacarpos” no pé sinalizado como erro. Fluxo cervical do instável não foi completado
por inferência. As fontes EAU/ACS não adotam exclusivamente escalas distintas: a nota EAU distingue
as versões das referências da escala atual apresentada.

⚠️ SAMU do acervo baseia-se em AHA 2015, não em uma atualização 2026. O guia LPP de setembro/2026
tem recomendações condicionais e não dispensa seus capítulos completos, ausentes nesta leitura.

### Validação local

```bash
node montar-quiz.mjs cirurgia
node balancear-quiz.mjs cirurgia
node build-site.mjs
node testes/nuvem.mjs
```

Validação em 30/09/2026: montagem/schema, balanceamento (64 corretas por posição), parser (7 abertas e
8 quiz em cada um dos 32 temas), enunciados únicos e build determinístico passaram. Os testes de
progresso passaram nas duas áreas: **62 testes, zero falhas**. Todos os 20 arquivos versionados de UE
permaneceram byte a byte iguais ao `HEAD` local. Há **13 avisos não bloqueantes** de comprimento de
alternativas nos temas 08–12.

❓ A validação de interface no navegador nesta retomada não foi executada: o servidor para a cópia
temporária sem Firebase foi bloqueado por permissão de diretório externo. Os testes Node usam mocks;
não comprovam os fluxos de interface nem o funcionamento remoto da nuvem. Sem commit/push/deploy
nesta integração.

### Lacuna declarada, não preenchida por inferência

**`Cirurgia_cardiaca.pdf`** dos decks é **esqueleto/agenda**: 4 páginas de tópicos com perguntas-guia ("Quando indicar?", "Com ou sem extracorpórea?", "CAA vs TAVI") e **sem o conteúdo das respostas**. Por isso **não gera tema nem questões** enquanto não houver fonte adicional — nenhuma conduta cardíaca foi escrita por dedução.

Também está sinalizada, no tema 08, uma lacuna pontual: o item do deck de luxações sobre a articulação mais acometida ("50% das luxações, 85% anteriores") aparece fragmentado no texto extraído, **sem o segmento anatômico**; o tema registra a lacuna em vez de completar por suposição.

**Nenhuma questão de origem foi transplantada:** a pasta `QUESTÕES/` do Drive está vazia; as questões desta trilha são de autoria própria, escritas a partir das afirmações constantes dos PDFs citados.
