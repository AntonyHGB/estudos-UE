# 🚑 Material de Estudos — Urgência e Emergência e Cirurgia

Material de estudo de medicina com site estático gerado a partir dos markdowns: resumos, quiz de múltipla escolha, questões abertas, simulado, revisão espaçada e PWA instalável.

| Área | Temas | Questões abertas | Quiz |
|---|---|---|---|
| [Urgência e Emergência](urgencia-e-emergencia/) | 12 | 88 | 361 |
| [Cirurgia](cirurgia/) | 32 | 224 | 656 |

> O material local de Urgência e Emergência contém **12 temas**, **88 questões abertas** com resposta modelo e **361 questões de quiz** (29–31 por tema). O site é gerado por `node build-site.mjs` e publicado no GitHub Pages — veja [Como rodar local](#como-rodar-local) e [Publicar](#publicar).

> A trilha **Cirurgia** tem **32 temas**, **224 questões abertas** e **656 questões de quiz**: 24 temas foram expandidos e os temas **09–16** permanecem com as 8 questões publicadas cada (expansão pendente após recusa do provider; não houve reenvio nem nova geração). Dos **69 PDFs locais**, **68** têm destino temático ou referência complementar e **1** permanece bloqueado: cirurgia cardíaca é agenda sem respostas. Há limites de fonte e cobertura seletiva — não é cobertura integral de cada página nem atualização clínica universal. Veja [`cirurgia/README.md`](cirurgia/README.md) e `_fontes-extraidas/cirurgia/00-matriz-cobertura.md`. PDFs e textos extraídos continuam fora do versionamento/publicação.

## Como funciona

Os arquivos `NN-*.md` são a fonte de verdade do conteúdo, e o `quiz.json` de cada área guarda as questões de múltipla escolha. Uma área pode ter também um `glossario.json` curado: termos que viram atalhos discretos no texto de estudo (veja [Glossário e atalhos](#glossário-e-atalhos-no-texto-de-estudo)). O script `build-site.mjs` (Node 22 puro, sem dependências) lê tudo e gera, para cada área:

- `index.html` — página completa e auto-contida, com três abas por tema: **Estudo**, **Quiz** (com correção imediata) e **Questões abertas** (resposta oculta e autoavaliação). Funciona até aberta direto do disco, por `file://`.
- `manifest.webmanifest`, `sw.js` e ícones PNG — camada opcional que torna o site instalável na tela de início e legível offline. Só entra em ação sob `http(s)`.

Na raiz, um `index.html` é o hub que leva à área.

Para acrescentar uma trilha: registre-a em `SITES` (no `build-site.mjs`, com pasta, título, emoji e cores) e crie a pasta com os `NN-*.md`, o `README.md` e o `quiz.json`. O card no hub, o site da área e o namespace de progresso saem sozinhos.

**Os arquivos gerados nunca são editados à mão** — qualquer edição é sobrescrita no próximo build.

## Regras do projeto

1. **A verdade está nos fontes.** Conteúdo e gabaritos vivem nos `NN-*.md` e no `quiz.json`; os atalhos do texto de estudo vivem no `glossario.json` de cada área. Os HTML/JS gerados são descartáveis.
2. **Mudou algo? Rode `node build-site.mjs`** e commite também o resultado gerado — o CI falha se o arquivo commitado divergir da fonte.
3. **Nada de material sigiloso no repositório.** `documentos-fontes/` (PDFs, imagens e anotações de aula), `_fontes-extraidas/`, `_quiz-fragmentos/`, `_modelo-referencia/` e notas internas ficam fora do versionamento. O que for publicado no GitHub Pages é só o site. Exceção intencional: `firebase-config.json` contém apenas a config **pública** do app web e precisa ficar no HTML publicado para o site funcionar — nunca coloque credencial de administrador nele (o build recusa).
4. **Quiz bem desenhado:**
   - quatro alternativas, com **~10% de diferença de comprimento** entre elas; a auditoria avisa acima de 15% e o build falha acima de 30% — se a correta ficou longa, corte; o que não cabe pertence à explicação;
   - a correta **não pode ser sistematicamente a mais longa** (aviso acima de 35% das questões, o build falha acima de 45%; com quatro alternativas o acaso é 25%) — ser a mais longa de vez em quando não é problema;
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

Para **expandir** um banco já publicado sem substituir as questões existentes, use o modo explícito append-only e balanceie somente as novas posições:

```bash
node montar-quiz.mjs --append urgencia-e-emergencia
node balancear-quiz.mjs --novas urgencia-e-emergencia
node build-site.mjs
```

`--append` verifica o prefixo do `quiz.json` contra `HEAD`, preserva questões publicadas (`n/q/a/c/e` e ordem), mantém temas sem fragmento e só aceita novos temas depois dos existentes na ordem numérica. Sem a opção, `montar-quiz.mjs` mantém o comportamento legado de substituição. `balancear-quiz.mjs --novas` também compara com `HEAD`: em cada tema, deixa intacta a quantidade já publicada e balanceia só os índices posteriores. Sem a opção, o balanceamento legado continua abrangendo o banco inteiro. **Não** use o modo legado numa expansão que precisa preservar respostas/sessões. Monte e balanceie antes de commitar; só comece outra expansão após publicar/commitar a anterior, para `HEAD` marcar a fronteira correta.

A idempotência de `--append` exige que o sufixo atual seja exatamente igual ao fragmento **antes do balanceamento**. Depois de balancear ou corrigir um fragmento já integrado, repetir `--append` não substitui o rascunho: pode recusar duplicatas. Nesta integração local, os bancos foram reconstruídos a partir dos fragmentos finais com validação integral dos prefixos de `HEAD` e backup ignorado, sem executar `--append` nem alterar os scripts.

⚠️ Esta integração não é validação clínica das fontes primárias. Há conteúdo didático com limites explicitados nas explicações; a ambiguidade legada de UE tema 11, questão 6 (loxoscelismo moderado e divergência entre fontes oficiais) foi preservada no prefixo publicado, não corrigida nesta rodada.

O build registra um hash SHA-256 do quiz e carrega compatibilidades anteriores do `index.html` gerado/versionado. Só sessões que já guardam SHA-256 podem ser migradas após validação integral do prefixo; simulados legados sem esse digest **não são reinterpretados nem apagados**. Eles ficam preservados localmente, bloqueados com aviso, e só podem ser substituídos após confirmação e cópia local explícita. ⚠️ Não apague os `index.html` anteriores antes de gerar os novos nem entre expansões: eles carregam a cadeia de compatibilidade forte para versões publicadas.

⚠️ Progresso de quiz local/na nuvem ainda usa `fp/chash` de 16 bits e chaves por tema/índice; não tem prova SHA-256 por questão. Append-only mantém essas referências corretas. Uma reescrita/reordenação com índice ainda válido pode continuar associando progresso antigo por índice — o aviso de material alterado não prova que isso foi evitado. A sincronização não foi migrada nesta etapa.

`montar-quiz.mjs` valida o schema de cada fragmento, avisa quando um tema não tem 8 questões e recusa enunciados repetidos entre todos os fragmentos. É idempotente e não quebra se `_quiz-fragmentos/` estiver vazia (o `quiz.json` atual é mantido). Os fragmentos **não são versionados**: só o `quiz.json` montado entra no repositório.

Fora de `urgencia-e-emergencia`, os fragmentos ficam em `_quiz-fragmentos/<area>/NN.json` e o comando recebe a área: `node montar-quiz.mjs cirurgia`. Sem argumento, ele continua montando `urgencia-e-emergencia/quiz.json` a partir de `_quiz-fragmentos/NN.json` (layout antigo). Fragmentos de uma área não são reaproveitados na outra.

### Balancear as posições

```bash
node balancear-quiz.mjs urgencia-e-emergencia
```

Escrevendo questão é natural deixar a correta sempre na mesma posição — e aí dá para gabaritar marcando sempre a mesma letra. O script troca a correta de lugar seguindo um padrão rotacionado por área e tema (25% por letra). É troca de pares: nenhum texto muda. Ele aborta se alguma explicação citar alternativa por letra.

### Glossário e atalhos no texto de estudo

Cada área pode ter um `glossario.json` **curado à mão** com os termos que merecem um atalho para o ponto do material em que o conceito é definido:

```json
{
  "termos": [
    { "termo": "coledocolitíase", "tema": "14", "secao": "sec-4-coledocolitíase" },
    { "termo": "Glasgow", "tema": "09", "secao": "sec-4-escala-de-coma-de-glasgow" }
  ]
}
```

`secao` é opcional: sem ela, o destino é o topo do tema. O atalho só entra no **texto das seções de estudo** — quiz, alternativas, gabaritos, explicações, questões abertas e títulos nunca ganham link. Regras do autolink:

- **palavra inteira** e sem diferenciar maiúsculas — `hérnia inguinal` não casa dentro de outra palavra;
- **uma vez por termo por seção** (a primeira menção) e nunca na própria seção de destino;
- nada de âncora aninhada: o autolink não entra em link existente, código ou título;
- o clique rola até a seção de destino e a destaca; o `href` real (`#topic/NN/estudo`) preserva o **Voltar** do histórico quando o destino é outro tema. No mesmo tema e aba o hash não mudaria (e o `hashchange` não dispararia), então o destaque é aplicado direto.

O build **recusa** o arquivo quando o schema está errado, quando o termo é ambíguo (um termo que é prefixo de palavra de outro, como `hérnia` diante de `hérnia inguinal`), quando o tema ou a seção de destino não existem no material, quando o destino é a bibliografia (`Fontes deste tema`) ou quando a entrada não gera nenhum atalho — mapa curado não tem destino inventado nem entrada morta. `node build-site.mjs --glossario` lista cada termo com o número de atalhos gerados.

### Auditoria automática

Todo `node build-site.mjs` mede e imprime a saúde do quiz. Os limiares:

| Medida | Aviso | Erro (o build falha) |
|---|---|---|
| Diferença de comprimento entre a maior e a menor alternativa da questão | > 15% | > 30% |
| Questões em que a correta é a mais longa | > 35% | > 45% |
| Frequência da letra da correta (em uma letra) | > 35% | — (rode `node balancear-quiz.mjs`) |

O alvo do projeto é ~10% de diferença de comprimento dentro da questão e, como são quatro alternativas, o acaso é 25%. A correta **não** precisa ser sempre curta nem nunca a mais longa: o que não pode é ela ser a mais longa em quase todas as questões — aí dá para gabaritar sem saber o assunto.

Antes de gerar, o build também valida a integridade do banco: a raiz do `quiz.json` precisa ser um objeto; as chaves precisam ter par exato com os arquivos `NN-*.md` (nos dois sentidos); listas de questões vazias são recusadas; e cada questão precisa seguir o schema (`n`, `q`, quatro alternativas não vazias, `c` de 0 a 3, `e`).

## Progresso

Marcações e respostas ficam no `localStorage` do navegador — por aparelho — e continuam disponíveis offline. Para sincronizar entre aparelhos, use **☁️ Progresso na nuvem** com uma conta verificada e aprovada pelo admin.

Links antigos com `?p=` não importam mais progresso; ao abri-los, o site avisa e encaminha à tela de nuvem. Nada é alterado no navegador por esse aviso. O progresso local e os documentos existentes na nuvem são preservados.

## Progresso na nuvem (opcional)

O progresso continua **local-first**: sem configurar nada, tudo funciona como hoje, offline e por aparelho. A nuvem é um recurso opcional para levar o progresso entre aparelhos, e é ligada por quem publica o site. Enquanto não houver `firebase-config.json`, a aba **☁️ Progresso na nuvem** só explica que o recurso está desligado — nada quebra, nada vai à rede.

### Modelo de segurança

- **A config do app web não é segredo.** `apiKey`, `projectId` etc. identificam o projeto; o controle está nas **regras do Firestore** e na aprovação. Nunca coloque credencial de administrador (service account, `private_key`, `client_email`) — o build **recusa** o arquivo se detectar esses campos.
- **Negar por padrão.** `firestore.rules` não libera nada fora do próprio progresso do usuário.
- **Cada um só o seu.** Regras prendem leitura/escrita ao `request.auth.uid` e exigem e-mail verificado.
- **Aprovação manual.** Só quem tem um documento `acessos/{uid}` com `aprovado: true`, criado pelo admin no console, acessa a nuvem. O cadastro no Auth pode continuar aberto: sem aprovação, ninguém lê nem escreve nada. ⚠️ Isso é o gate efetivo — **não** desligue o provedor "E-mail/senha" para "fechar o cadastro": isso derruba também o login de todos. Para bloquear novos cadastros mantendo o login seria preciso outro mecanismo (apagar contas não aprovadas ou uma Cloud Function de bloqueio), fora do plano Spark.
- **Sem "convite" ilusório.** A tela deixa claro que o cadastro pode estar aberto e que o gate é a aprovação.

### Como ligar (mantenedor)

1. Crie um projeto Firebase (plano **Spark**, gratuito), registre um app **Web** e copie a config pública.
2. Em **Authentication → Sign-in method**, ative **E-mail/senha**. Exija verificação de e-mail e habilite **Email enumeration protection** nas configurações do Authentication. As mensagens do cliente são genéricas para credenciais inválidas, mas não substituem essa proteção do servidor. Configure também uma política de senha adequada ao público.
3. Em **Firestore Database**, crie o banco e cole o conteúdo de [`firestore.rules`](firestore.rules) em **Regras**.
4. Copie `firebase-config.example.json` para `firebase-config.json` na raiz e preencha com a config do seu app.
5. `node build-site.mjs` e publique. A config pública fica embutida no HTML gerado (rode o build antes de commitar; o CI cobra isso).
6. Para liberar cada pessoa: depois que ela se cadastrar e verificar o e-mail, crie em **Firestore → `acessos`** um documento com **ID = UID do usuário** e campo `aprovado` (booleano) = `true`. Para revogar, apague o documento.

⚠️ As regras usam `get()`/`exists()`; a aprovação vale para todas as áreas daquele UID. O progresso fica em `usuarios/{uid}/areas/{area}` — uma área nova (`SITES`) já entra sozinha.

### Como o sync se comporta

- O SDK do Firebase é carregado **só quando você abre a aba Nuvem** (`import()` do CDN oficial). Offline, `file://` ou CDN indisponível: o recurso degrada e o estudo local segue normal.
- **Sincronizar** faz leitura + mesclagem + gravação **dentro de uma transação** do Firestore e só aplica o resultado neste navegador **depois** de a gravação ter dado certo. Para cada marcação/resposta vence o carimbo de tempo mais recente; empate prefere o **local**. Como a transação serializa, dois aparelhos sincronizando ao mesmo tempo não se sobrescrevem: o segundo reexecuta a leitura e mescla sobre o resultado do primeiro.
- **Enviar** sobrescreve a nuvem com o progresso local (explícito). **Baixar** **substitui** o local pelo da nuvem — limpa os itens conhecidos antes de aplicar — e guarda um backup local que aparece como "↩️ Desfazer último Baixar".
- **Trocar de conta no mesmo navegador não mistura dados automaticamente.** Se já houver um marcador de conta diferente, o "Sincronizar" é bloqueado (mesmo com a nuvem ainda vazia); e, se não houver marcador mas existir progresso local, o primeiro sync pede confirmação para associá-lo à conta.
- O Auth é inicializado no boot, antes de liberar a tela de estudo, para escolher o namespace correto: sessão autenticada usa chave local por UID; sessão deslogada mantém o namespace legado. Os dados legados não são apagados nem associados automaticamente. Para acessá-los, saia da conta; não há migração automática nem fluxo de cópia implementado. Backups novos guardam UID; backups antigos sem UID falham fechado e são preservados, mas não podem ser restaurados pela interface.
- Se a inicialização Firebase falhar, o app mostra aviso de estado offline/desconhecido, preserva o legado e usa um namespace isolado de contingência. Não associa dados desse modo a nenhuma conta; ao voltar online, recarregue para identificar a sessão.
- Marcações limpas viram *tombstones* com carimbo, então uma limpeza feita em um aparelho também some no outro.
- Se o material mudou (`fp`/`chash`), referências fora do banco são ignoradas e a tela avisa. Como o sync local/nuvem ainda é indexado por tema/posição e usa hashes curtos, um índice válido que passou a apontar para conteúdo reescrito não pode ser identificado com certeza nesta versão.

**Limites conhecidos.** A granularidade do conflito é o item (marcação/resposta), decidido pelo carimbo de tempo: relógios muito fora de sincronia entre aparelhos podem inverter a ordem de dois itens. Se duas pessoas usarem o **mesmo navegador** e ambas tiverem progresso local não sincronizado, a confirmação do primeiro sync decide a quem ele pertence — não há como o site adivinhar. E "Enviar" é uma sobrescrita deliberada: usado em dois aparelhos quase ao mesmo tempo, vale a última gravação.

### Testes

```bash
node build-site.mjs && node testes/nuvem.mjs && node testes/glossario.mjs
node testes/quiz-append.mjs
```

`testes/quiz-append.mjs` cria um Git fixture isolado e bancos artificiais em `/tmp/opencode`; verifica ciclos 8→30→40, limites por tema vindos do `HEAD`, preflight sem escrita parcial, questões abertas/progresso local-nuvem, migração de simulados somente com SHA-256 e retenção de sessões legadas sem digest. Não altera os bancos nem os sites reais.

`testes/nuvem.mjs` roda o `index.html` gerado num contexto Node com DOM/localStorage mockados e cobre snapshot, mesclagem por timestamp, aplicação com validação de índices, bloqueio de troca de conta e as regras default-deny. Sem argumento, ele testa **todas as áreas geradas** (cada pasta de primeiro nível com `index.html`), uma por processo; com argumento, testa só os arquivos indicados. O teste assume o padrão do banco: ao menos 6 questões abertas e 3 de quiz no primeiro tema. Testes que dependem de rede/CDN e de duas contas reais ficam no roteiro manual abaixo.

`testes/glossario.mjs` confere os atalhos do glossário no artefato gerado: destino existente, casamento como palavra inteira, uma menção por termo por seção, ausência de âncora aninhada, zero atalho em quiz/alternativas/gabaritos/explicações/questões abertas e o mapa curado sem termo ambíguo ou sem uso. Um segundo bloco renderiza o tema num DOM mockado e verifica o Estudo com atalho, o Quiz e as Abertas sem atalho, e o destaque da seção de destino quando o clique cai no mesmo tema e aba (hash que não muda).

### Roteiro manual (2 contas)

1. Conta **pendente**: cadastre-se, verifique o e-mail, abra a aba Nuvem → deve mostrar "aguardando aprovação" e não sincronizar.
2. Conta **aprovada**: o admin cria `acessos/{uid}`; a tela muda para "aprovado" e libera os botões.
3. Estude um pouco no aparelho A, sincronize; no aparelho B (mesmo UID) sincronize e confirme que o progresso aparece, sem perder o do B.
4. Sem internet: confirme que o estudo offline segue e que a aba Nuvem só informa a falha.
5. Troque de conta no mesmo navegador: confirme que o progresso local anterior **não** é substituído automaticamente.

## Publicar

O site é estático e vive em `https://antonyhgb.github.io/estudos-UE/`. Com GitHub Pages:

```bash
gh repo create estudos-UE --public --source=. --remote=origin --push
gh api -X POST repos/:owner/estudos-UE/pages -f 'source[branch]=main' -f 'source[path]=/'
```

As páginas trazem `<meta name="robots" content="noindex, nofollow">` — uma **solicitação** para que os buscadores não indexem as páginas. Isso **não é controle de acesso nem garantia**: o conteúdo continua acessível a quem tem o link, e um buscador pode ignorar a diretiva. Não use o repositório para material que não possa circular.

Depois de qualquer alteração:

```bash
node build-site.mjs && git add -A && git commit -m "atualiza material" && git push
```

⚠️ O CI (`.github/workflows/ci.yml`) roda o build a cada push e falha se o HTML/JS/manifest commitado divergir da fonte. Rode o build antes de commitar.
