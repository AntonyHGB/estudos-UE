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
- `index.html`, `manifest.webmanifest`, `sw.js`, `icon-*.png` — **gerados** por `node build-site.mjs`; nunca editar à mão.

As regras completas de autoria e publicação estão no `README.md` da raiz do projeto.
