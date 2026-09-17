# 🚑 Material de Estudos — Urgência e Emergência

Material de estudo de Urgência e Emergência (medicina, 5º ano), com site estático gerado a partir dos markdowns: resumos, quiz de múltipla escolha, questões abertas, simulado, revisão espaçada e PWA instalável.

| Área | Temas | Questões abertas | Quiz |
|---|---|---|---|
| [Urgência e Emergência](urgencia-e-emergencia/) | em construção | em construção | em construção |

> ⚠️ O conteúdo ainda está sendo escrito. Hoje o site monta com o tema `00-modelo.md` e 8 questões de quiz marcadas `[TEMP]`, que serão substituídas.

## Como funciona

Os arquivos `NN-*.md` são a fonte de verdade do conteúdo, e o `quiz.json` de cada área guarda as questões de múltipla escolha. O script `build-site.mjs` (Node 22 puro, sem dependências) lê tudo e gera, para cada área:

- `index.html` — página completa e auto-contida, com três abas por tema: **Estudo**, **Quiz** (com correção imediata) e **Questões abertas** (resposta oculta e autoavaliação). Funciona até aberta direto do disco, por `file://`.
- `manifest.webmanifest`, `sw.js` e ícones PNG — camada opcional que torna o site instalável na tela de início e legível offline. Só entra em ação sob `http(s)`.

Na raiz, um `index.html` é o hub que leva à área.

**Os arquivos gerados nunca são editados à mão** — qualquer edição é sobrescrita no próximo build.

## Regras do projeto

1. **A verdade está nos fontes.** Conteúdo e gabaritos vivem nos `NN-*.md` e no `quiz.json`; os HTML/JS gerados são descartáveis.
2. **Mudou algo? Rode `node build-site.mjs`** e commite também o resultado gerado — o CI falha se o arquivo commitado divergir da fonte.
3. **Nada de material sigiloso no repositório.** `documentos-fontes/` (PDFs, imagens e anotações de aula), `_fontes-extraidas/`, `_quiz-fragmentos/`, `_modelo-referencia/` e notas internas ficam fora do versionamento. O que for publicado no GitHub Pages é só o site.
4. **Quiz bem desenhado:**
   - quatro alternativas, com **~10% de diferença de comprimento** entre elas; se a correta ficou longa, corte — o que não cabe pertence à explicação;
   - a correta **não pode ser sistematicamente a mais longa** (alvo ≤ 45% das questões; com quatro alternativas o acaso é 25%);
   - distratora tem que ser erro plausível — o conceito vizinho, a definição correta de outro termo, a resposta que valeria em outro contexto;
   - **nunca** cite a alternativa por letra na explicação ("a opção B...") — as posições são rotacionadas e o texto passaria a mentir. Cite o conteúdo;
   - sem "todas as anteriores" e sem absolutos ("sempre", "nunca") só nas erradas.
5. **Enunciados únicos** no banco inteiro — o build recusa duplicatas.
6. **Nada de `index.html` editado à mão**, nem de conteúdo publicado direto dos documentos-fontes sem reescrita.

### Formato das questões de quiz

```json
{
  "01": [
    {
      "n": "🟡",
      "q": "Enunciado, aceita **negrito** e `código`.",
      "a": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      "c": 1,
      "e": "Explicação do gabarito, mostrada depois da resposta."
    }
  ]
}
```

`n` é o nível (🟢 básico, 🟡 intermediário, 🔴 avançado) e `c` é o índice da alternativa correta, contando de zero.

## Como rodar local

```bash
node build-site.mjs       # gera hub, páginas, manifest, sw e ícones
```

Abra `index.html` na raiz (funciona por `file://`) ou sirva a pasta:

```bash
python3 -m http.server 8080   # depois abra http://localhost:8080
```

Para conferir o CI antes de commitar:

```bash
node build-site.mjs && git diff --exit-code -- . ':(exclude)*.png'
```

### Escrever questões em fragmentos

Cada autor escreve o seu tema em `_quiz-fragmentos/NN.json` (array com as 8 questões do tema, formato acima). Depois:

```bash
node montar-quiz.mjs          # valida os fragmentos e monta urgencia-e-emergencia/quiz.json
node balancear-quiz.mjs urgencia-e-emergencia   # rotaciona a posição da correta
node build-site.mjs           # regenera o site
```

`montar-quiz.mjs` valida schema, exige 8 questões por fragmento e recusa enunciados repetidos entre todos os fragmentos. É idempotente e não quebra se `_quiz-fragmentos/` estiver vazia (o `quiz.json` atual é mantido). Os fragmentos **não são versionados**: só o `quiz.json` montado entra no repositório.

### Balancear as posições

```bash
node balancear-quiz.mjs urgencia-e-emergencia
```

Escrevendo questão é natural deixar a correta sempre na mesma posição — e aí dá para gabaritar marcando sempre a mesma letra. O script troca a correta de lugar seguindo um padrão rotacionado por área e tema (25% por letra). É troca de pares: nenhum texto muda. Ele aborta se alguma explicação citar alternativa por letra.

### Auditoria automática

Todo `node build-site.mjs` mede e imprime a saúde do quiz (alvo: correta mais longa ≤ 45% e ≤ 35% por letra; o acaso é 25% nas duas métricas). Passando dos alvos, o quiz voltou a ser gabaritável sem saber o assunto.

## Progresso

Marcações e respostas ficam no `localStorage` do navegador — por aparelho. Para levar o progresso de um aparelho a outro, use a tela **📲 Levar progresso** dentro do site.

## Publicar

O site é estático e vive em `https://antonyhgb.github.io/estudos-UE/`. Com GitHub Pages:

```bash
gh repo create estudos-UE --public --source=. --remote=origin --push
gh api -X POST repos/:owner/estudos-UE/pages -f 'source[branch]=main' -f 'source[path]=/'
```

As páginas trazem `<meta name="robots" content="noindex, nofollow">` — não aparecem em buscadores; o acesso é por link direto.

Depois de qualquer alteração:

```bash
node build-site.mjs && git add -A && git commit -m "atualiza material" && git push
```

⚠️ O CI (`.github/workflows/ci.yml`) roda o build a cada push e falha se o HTML/JS/manifest commitado divergir da fonte. Rode o build antes de commitar.
