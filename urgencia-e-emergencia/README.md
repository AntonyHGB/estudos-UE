# Urgência e Emergência — Material de Estudo

Material de estudo de Urgência e Emergência (5º ano de medicina), no formato do site: resumos conceituais, quiz de múltipla escolha com correção imediata e questões abertas com autoavaliação.

---

## Como usar este material

**1. Faça o diagnóstico antes de ler.** Cada questão aberta tem um nível:

| Marca | Nível | O que significa |
|---|---|---|
| 🟢 | **Básico** | Conduta inicial e definições que não podem falhar. |
| 🟡 | **Intermediário** | Escolha entre condutas, doses e indicações. |
| 🔴 | **Avançado** | Cenário com armadilha, priorização e contraindicação. |

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

## Banco de quiz integrado localmente

O banco local contém **361 questões em 12 temas** (29–31 por tema). A integração preserva as 8 questões
publicadas por tema, inclusive ordem das alternativas e gabarito; as questões novas foram balanceadas
somente após esse prefixo. Isso descreve o estado local, não um deploy nem uma revisão clínica integral.

⚠️ As correções dos fragmentos finais foram integradas ao banco local; referências didáticas não equivalem a fontes primárias clinicamente validadas. A questão 6 do tema 11, já publicada, mantém a ambiguidade de conduta no loxoscelismo moderado por divergência entre fontes oficiais; o prefixo legado não foi alterado.
