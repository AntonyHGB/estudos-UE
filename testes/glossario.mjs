// testes/glossario.mjs — valida o autolink curado do texto de estudo.
//
// Uso:
//   node build-site.mjs
//   node testes/glossario.mjs [caminho/area]
//
// Sem argumento, valida todas as áreas geradas (cada pasta de primeiro nível com
// index.html) e roda a parte de DOM de cada uma num processo próprio — pelo
// mesmo motivo do testes/nuvem.mjs: dois apps no mesmo processo colidiriam nos
// mocks. Com argumento, valida só a área indicada.
//
// O que é conferido:
//   1. cada atalho (.gl-link) aponta para um tema existente e, quando tem
//      seção, para uma seção de estudo real do tema de destino;
//   2. o termo casa como palavra inteira e o texto visível é exatamente o termo
//      curado — nada de casar dentro de outra palavra (hérnia de disco x hérnia
//      inguinal) nem de link em cima de link (âncora aninhada);
//   3. no máximo um atalho por termo por seção (primeira menção) e nunca na
//      própria seção de destino;
//   4. quiz, alternativas, gabaritos, explicações, questões abertas e o README
//      não recebem nenhum atalho;
//   5. o glossario.json é um mapa válido: schema, destinos que existem e nenhum
//      termo ambíguo (prefixo de outro) ou sem uso no material;
//   6. na renderização real, o atalho aparece no Estudo e não aparece no Quiz
//      nem nas Abertas; e o clique no mesmo tema/aba (hash que não muda) ainda
//      destaca a seção de destino, com o destaque visual.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const RE_LIM_ESQ = /[A-Za-z0-9_\u00c0-\u024f-]$/u;

function areasGeradas() {
  return readdirSync(RAIZ, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name)
    .filter((nome) => existsSync(join(RAIZ, nome, 'index.html')))
    .sort();
}

/* ================================ parte 1 — artefatos gerados ================================ */

function validarArea(nome) {
  const dir = join(RAIZ, nome);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const mData = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(mData, `${nome}: bloco site-data ausente`);
  const data = JSON.parse(mData[1]);
  const porId = new Map(data.topics.map((t) => [t.id, t]));
  const secoesPorTema = new Map(data.topics.map((t) => [t.id, new Set(t.toc.map((s) => s.id))]));

  const glossario = JSON.parse(readFileSync(join(dir, 'glossario.json'), 'utf8'));
  assert.ok(Array.isArray(glossario.termos) && glossario.termos.length, `${nome}: glossario.json sem termos`);
  const termos = new Map(glossario.termos.map((t) => [t.termo.toLowerCase(), t]));

  // schema do mapa curado
  for (const t of glossario.termos) {
    assert.equal(typeof t.termo, 'string', `${nome}: termo sem string`);
    assert.ok(t.termo.trim().length >= 3, `${nome}: termo "${t.termo}" curto demais`);
    assert.ok(!/[*_`\[\]<>|()"'&;]/.test(t.termo), `${nome}: termo "${t.termo}" tem marcação`);
    assert.match(t.tema, /^\d{2}$/, `${nome}: tema inválido em "${t.termo}"`);
    assert.ok(porId.has(t.tema), `${nome}: tema ${t.tema} de "${t.termo}" não existe`);
    assert.ok(secoesPorTema.get(t.tema).has(t.secao), `${nome}: seção ${t.secao} de "${t.termo}" não existe no tema ${t.tema}`);
    assert.ok(!/^fontes\b/i.test(t.secao), `${nome}: destino de "${t.termo}" é bibliografia`);
  }
  // ambiguidade: termo que é prefixo de palavra de outro
  for (const a of glossario.termos) {
    for (const b of glossario.termos) {
      if (a === b) continue;
      const ca = a.termo.toLowerCase(), cb = b.termo.toLowerCase();
      if (cb.startsWith(ca) && /[\s-]/.test(cb[ca.length] || '')) {
        assert.fail(`${nome}: "${a.termo}" é prefixo de "${b.termo}" — ambíguo`);
      }
    }
  }

  const RE_ANCHOR = /<a class="gl-link"([^>]*)>([\s\S]*?)<\/a>/g;
  const contagem = new Map(glossario.termos.map((t) => [t.termo.toLowerCase(), 0]));
  let total = 0;

  for (const t of data.topics) {
    const partes = t.studyHtml.split(/(?=<section class="study-sec" id=")/);
    for (const parte of partes) {
      const secaoAtual = (parte.match(/<section class="study-sec" id="([^"]+)"/) || [])[1];
      const vistos = new Set();
      for (const m of parte.matchAll(RE_ANCHOR)) {
        const attrs = m[1];
        const texto = m[2];
        const destino = (attrs.match(/data-topic="(\d\d)"/) || [])[1];
        const ancora = (attrs.match(/data-ancora="([^"]*)"/) || [])[1];
        const chave = (attrs.match(/data-termo="([^"]*)"/) || [])[1];
        const titulo = (attrs.match(/title="([^"]*)"/) || [])[1];
        const aria = (attrs.match(/aria-label="([^"]*)"/) || [])[1];
        const onde = `${nome} tema ${t.id}/${secaoAtual} "${texto}"`;

        assert.ok(destino && porId.has(destino), `${onde}: destino "${destino}" inexistente`);
        assert.match(attrs, /href="#topic\/\d\d\/estudo"/, `${onde}: href não aponta para o Estudo`);
        assert.equal(attrs.match(/data-tab="(\w+)"/)[1], 'estudo', `${onde}: aba de destino inesperada`);
        assert.ok(ancora === '' || secoesPorTema.get(destino).has(ancora), `${onde}: seção de destino "${ancora}" inexistente`);
        assert.ok(titulo && aria, `${onde}: faltou title/aria-label`);
        assert.ok(aria.toLowerCase().includes(texto.toLowerCase()), `${onde}: aria-label não contém o texto visível`);
        assert.ok(!texto.includes('<'), `${onde}: âncora aninhada/HTML dentro do atalho`);
        assert.equal(texto.toLowerCase(), termos.get(chave).termo.toLowerCase(), `${onde}: texto difere do termo curado`);
        assert.equal(chave, texto.toLowerCase(), `${onde}: data-termo difere do texto`);

        // nunca no próprio destino
        assert.ok(!(destino === t.id && (ancora === '' || ancora === secaoAtual)), `${onde}: atalho redundante na própria seção`);
        // primeira menção: um atalho por termo por seção
        assert.ok(!vistos.has(chave), `${onde}: termo repetido na mesma seção`);
        vistos.add(chave);

        // palavra inteira: o termo não pode estar colado a letra/número/hífen
        const ini = m.index;
        const anterior = parte.slice(0, ini).replace(/<[^>]*>$/, '');
        const seguinte = parte.slice(ini + m[0].length).replace(/^<[^>]*>/, '');
        assert.ok(!RE_LIM_ESQ.test(anterior.replace(/&[a-z]+;$/, '')), `${onde}: colado à palavra anterior`);
        assert.ok(!/^[A-Za-z0-9_\u00c0-\u024f-]/u.test(seguinte), `${onde}: colado à palavra seguinte`);

        contagem.set(chave, contagem.get(chave) + 1);
        total++;
      }
    }
  }

  // nenhum termo curado pode ficar sem atalho (mapa sem entrada morta)
  for (const [chave, n] of contagem) {
    assert.ok(n > 0, `${nome}: termo "${chave}" não gera nenhum atalho`);
  }

  // quiz, alternativas, gabaritos, explicações, abertas e README: zero atalhos
  const semAtalho = (rotulo, valor) => {
    assert.ok(!String(valor).includes('gl-link'), `${nome}: atalho indevido em ${rotulo}`);
  };
  semAtalho('readmeHtml', data.readmeHtml);
  for (const t of data.topics) {
    semAtalho(`tema ${t.id} questionsIntro`, t.questionsIntroHtml);
    t.cards.forEach((c, i) => {
      semAtalho(`tema ${t.id} questão aberta ${i} título`, c.titleHtml);
      semAtalho(`tema ${t.id} questão aberta ${i} corpo`, c.bodyHtml);
    });
    t.quiz.forEach((q, i) => {
      semAtalho(`tema ${t.id} quiz ${i} enunciado`, q.q);
      q.a.forEach((a, j) => semAtalho(`tema ${t.id} quiz ${i} alternativa ${j}`, a));
      semAtalho(`tema ${t.id} quiz ${i} explicação`, q.e);
    });
  }

  return { area: nome, termos: glossario.termos.length, atalhos: total };
}

/* ================================ parte 2 — renderização real (DOM mockado) ================================ */

function validarRender(nome) {
  const file = join(RAIZ, nome, 'index.html');
  const html = readFileSync(file, 'utf8');
  const mData = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/);
  const mScript = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(mData && mScript, `${nome}: scripts do app não encontrados`);
  const siteData = JSON.parse(mData[1]);

  const els = new Map();
  function makeEl(id) {
    return {
      id, textContent: '', innerHTML: '', value: '', type: '', attributes: {}, focused: false,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      focus() { this.focused = true; },
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      style: {}, dataset: {},
      addEventListener() {}, removeEventListener() {},
      querySelectorAll() { return []; }, querySelector() { return null; },
      appendChild() {}, removeChild() {}, click() {},
      select() {}, setSelectionRange() {}, scrollIntoView() {},
    };
  }
  const dataEl = makeEl('site-data');
  dataEl.textContent = mData[1];
  els.set('site-data', dataEl);
  globalThis.document = {
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement(tag) { return makeEl(tag); },
    body: makeEl('body'),
    execCommand() { return true; },
  };
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  };
  globalThis.location = {
    protocol: 'http:', origin: 'http://localhost', pathname: '/' + nome + '/',
    search: '', hash: '#home', href: 'http://localhost/' + nome + '/',
  };
  globalThis.history = { replaceState() {} };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  globalThis.window = { addEventListener() {}, scrollTo() {} };

  const run = (code) => vm.runInThisContext(code, { filename: 'app-interno.js' });
  run(mScript[1], { filename: 'app.js' });

  const alvo = siteData.topics.find((t) => t.studyHtml.includes('gl-link'));
  assert.ok(alvo, `${nome}: nenhum tema com atalho`);
  const main = () => document.getElementById('main').innerHTML;

  run(`renderTopic('${alvo.id}','estudo')`);
  assert.ok(main().includes('gl-link'), `${nome}: atalho não aparece no Estudo`);
  run(`renderTopic('${alvo.id}','quiz')`);
  assert.ok(!main().includes('gl-link'), `${nome}: atalho apareceu no Quiz`);
  run(`renderTopic('${alvo.id}','questoes')`);
  assert.ok(!main().includes('gl-link'), `${nome}: atalho apareceu nas Abertas`);

  // clique: tema/aba diferentes trocam o hash (Voltar do histórico volta à leitura)
  run(`location.hash = '#home'`);
  run(`irParaAncora('${alvo.id}', 'estudo', '${alvo.toc[0].id}')`);
  assert.equal(location.hash, `#topic/${alvo.id}/estudo`, `${nome}: hash não mudou no destino de outro tema`);
  assert.equal(JSON.parse(run('JSON.stringify(focoPendente)')).ancora, alvo.toc[0].id);

  // clique: mesmo tema/aba não muda o hash (hashchange não dispara) e destaca direto
  run(`location.hash = '#topic/${alvo.id}/estudo'`);
  run('focoPendente = null');
  run(`irParaAncora('${alvo.id}', 'estudo', '${alvo.toc[0].id}')`);
  assert.equal(location.hash, `#topic/${alvo.id}/estudo`, `${nome}: hash não deveria mudar`);
  assert.equal(run('focoPendente'), null, `${nome}: destaque deveria ter sido aplicado na hora`);
  return new Promise((resolve) => {
    setTimeout(() => {
      const el = document.getElementById(alvo.toc[0].id);
      assert.ok(el.style.outline && el.style.outline.includes('solid'), `${nome}: destino não foi destacado`);
      resolve({ area: nome, tema: alvo.id });
    }, 200);
  });
}

/* ================================ execução ================================ */

const alvoCli = process.argv[2];
if (alvoCli) {
  const nome = alvoCli.replace(/[/\\]+$/, '').split(/[/\\]/).pop();
  const r = validarArea(nome);
  console.log(`  ok  ${nome}: ${r.termos} termos curados, ${r.atalhos} atalhos válidos`);
  const r2 = await validarRender(nome);
  console.log(`  ok  render ${nome}: Estudo com atalho, Quiz/Abertas sem atalho, destaque no mesmo hash (tema ${r2.tema})`);
} else {
  const areas = areasGeradas();
  if (!areas.length) {
    console.error('Nenhuma área gerada. Rode "node build-site.mjs" antes.');
    process.exit(2);
  }
  let falhou = false;
  const resumos = [];
  for (const nome of areas) {
    try {
      resumos.push(validarArea(nome));
    } catch (e) {
      falhou = true;
      console.log(`  FAIL ${nome}\n       ${e.message}`);
    }
  }
  for (const r of resumos) {
    console.log(`  ok  ${r.area}: ${r.termos} termos curados, ${r.atalhos} atalhos válidos`);
  }
  const args = process.argv[2] ? [process.argv[2]] : [];
  for (const nome of areas) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args, nome], { stdio: 'inherit' });
    if (r.status !== 0) falhou = true;
  }
  console.log(falhou ? 'testes/glossario.mjs: falhou' : 'testes/glossario.mjs: ok');
  process.exit(falhou ? 1 : 0);
}
