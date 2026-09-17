# 00 — Modelo [TEMP]

> ⚠️ Tema temporário. Este arquivo existe só para o site montar e mostrar o formato esperado de um tema — será apagado quando os temas reais (01, 02, ...) forem escritos. O conteúdo abaixo NÃO é material de estudo.

---

## 1. Resumo conceitual

### 1.1 Como um tema é organizado

Cada tema é um arquivo `NN-titulo-em-kebab-case.md` nesta pasta, onde `NN` é o número de dois dígitos que liga o tema ao `quiz.json`. Um tema tem:

- **título** em `# NN — Nome do tema`;
- **subtítulo** em uma citação `>` logo abaixo do título — é a frase que aparece no card;
- **seções de estudo** em `##`, que viram o corpo da aba Estudo;
- **uma seção de perguntas abertas** cujo título contenha "perguntas", "cenários resolvidos" ou "estudos de caso" — cada questão começa com `**🟢 pergunta**`, `**🟡 ...**` ou `**🔴 ...**` em uma linha própria, e o resto vira a resposta revelável.

### 1.2 Níveis de dificuldade

| Marca | Nível | Uso esperado |
|---|---|---|
| 🟢 | Básico | conduta inicial, definição, o que não pode errar |
| 🟡 | Intermediário | decisão entre condutas, doses, indicações |
| 🔴 | Avançado | cenário com armadilha, contraindicação, priorização |

### 1.3 Regras de escrita do quiz

As questões de múltipla escolha ficam no `quiz.json` da área, com a chave do tema (`"00"`, `"01"`, ...). Cada questão tem nível, enunciado, quatro alternativas, índice da correta (contando de zero) e explicação. As regras de autoria — alternativas de tamanho parecido, distratoras plausíveis, nunca citar a alternativa por letra na explicação — estão no README da raiz e no material de referência local.

## 2. Perguntas

**🟢 [TEMP] O que este tema de modelo demonstra?**

**Resposta modelo:** Ele demonstra a anatomia de um arquivo de tema: título numerado, subtítulo em citação, seções de estudo com `##`/`###` e a seção de perguntas abertas com marcadores de nível. Quando os temas reais chegarem, este arquivo é apagado.

**🟢 [TEMP] Por que as questões de múltipla escolha ficam no `quiz.json` e não no markdown?**

**Resposta modelo:** Porque o quiz precisa de estrutura rígida para ser validado e balanceado pelo build — quatro alternativas, índice da correta e explicação são validados a cada `node build-site.mjs`. Separar o quiz do texto também deixa a rotação das posições da correta (`balancear-quiz.mjs`) acontecer sem tocar no conteúdo estudado.
