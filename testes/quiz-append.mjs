// Regressão isolada para expansão append-only, ordenação do quiz, nuvem e simulados.
// Uso: node testes/quiz-append.mjs
// Todo o código/HTML gerado vive num diretório temporário; nenhuma área publicada é escrita.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TMP_BASE = process.env.OPENCODE_TMP || '/tmp/opencode';
mkdirSync(TMP_BASE, { recursive: true });
const FIXTURE = mkdtempSync(join(TMP_BASE, 'estudos-ue-append-'));
const AREAS = ['urgencia-e-emergencia', 'cirurgia'];
const passed = [];

function executar(script, args = []) {
  const r = spawnSync(process.execPath, [join(FIXTURE, script), ...args], {
    cwd: FIXTURE,
    encoding: 'utf8',
  });
  return { ...r, output: `${r.stdout || ''}${r.stderr || ''}` };
}

function exigirSucesso(script, args = []) {
  const r = executar(script, args);
  assert.equal(r.status, 0, `${script} ${args.join(' ')} falhou:\n${r.output}`);
  return r.output;
}

function criarBanco(area, temas = ['01', '02']) {
  const bank = {};
  for (const tema of temas) {
    bank[tema] = Array.from({ length: 8 }, (_, i) => ({
      n: ['🟢', '🟡', '🔴'][i % 3],
      q: `${area} tema ${tema} pergunta original ${i + 1}?`,
      a: ['A', 'B', 'C', 'D'].map((letra, j) => letra.repeat(30 + j)),
      c: i % 4,
      e: `Explicação da questão ${i + 1} do tema ${tema}.`,
    }));
  }
  return bank;
}

function criarTema(area, tema) {
  mkdirSync(join(FIXTURE, area), { recursive: true });
  writeFileSync(join(FIXTURE, area, 'README.md'), `# ${area}\n\nFixture de teste.\n`);
  writeFileSync(join(FIXTURE, area, `${tema}-tema.md`),
    `# Tema ${tema}\n\n## Estudo\nTexto fixture.\n\n## Perguntas\n### 🟢 Básico\n### 1.1 Questão aberta original\nResposta modelo original.\n`);
}

function leituraSite(area) {
  const html = readFileSync(join(FIXTURE, area, 'index.html'), 'utf8');
  const m = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, `site-data ausente em ${area}`);
  return { html, data: JSON.parse(m[1]), app: html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1] };
}

function rodarApp(site, preStore = {}, aceitarConfirmacao = false) {
  const store = new Map(Object.entries(preStore));
  const els = new Map();
  const makeEl = (id) => ({
    id, textContent: '', innerHTML: '', value: '', classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    style: {}, dataset: {}, addEventListener(){}, removeEventListener(){}, querySelectorAll(){ return []; },
    querySelector(){ return null; }, appendChild(){}, removeChild(){}, click(){}, select(){},
    setSelectionRange(){}, scrollIntoView(){},
  });
  const dataEl = makeEl('site-data');
  dataEl.textContent = JSON.stringify(site.data);
  els.set('site-data', dataEl);
  const document = {
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener(){},
    createElement(tag) { return makeEl(tag); }, body: makeEl('body'), execCommand(){ return true; },
  };
  const context = vm.createContext({
    document,
    localStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); },
    },
    location: { protocol: 'http:', origin: 'http://localhost', pathname: `/${site.data.siteKey}/`, search: '', hash: '#home', href: 'http://localhost/' },
    history: { replaceState(){} }, navigator: {}, window: { addEventListener(){}, scrollTo(){} },
    confirm() { return aceitarConfirmacao; }, setTimeout() { return 0; }, clearTimeout(){}, console,
    Date, Math, JSON, Array, Object, String, Number, RegExp, Error, Promise,
  });
  vm.runInContext(site.app, context, { filename: `${site.data.siteKey}/app.js` });
  return { run: (code) => vm.runInContext(code, context), store, el: (id) => document.getElementById(id) };
}

function registroSim(site, ref = ['01', 0], quizHash = undefined, fp = site.data.fp, chash = site.data.chash) {
  const topic = site.data.topics.find((t) => t.id === ref[0]);
  const saved = { fp, chash, itens: [ref], resp: [topic.quiz[ref[1]].c], pos: 0, fim: false };
  if (quizHash !== undefined) saved.quizHash = quizHash;
  return saved;
}

function validarRejeicaoSim(site, saved, descricao) {
  const key = `estudos:${site.data.siteKey}:sim`;
  const original = JSON.stringify(saved);
  const app = rodarApp(site, { [key]: original });
  app.run('renderSimulado()');
  assert.equal(app.store.get(key), original, `sessão incompatível deve ser preservada: ${descricao}`);
  assert.match(app.el('main').innerHTML, /SHA-256/);
  assert.match(app.el('main').innerHTML, /Guardar cópia local/);
}

function criarQuestao(area, tema, id, nivel = '🟡') {
  return {
    n: nivel,
    q: `${area} tema ${tema} questão nova ${id}?`,
    a: ['A', 'B', 'C', 'D'].map((letra, j) => letra.repeat(30 + j)),
    c: id % 3,
    e: `Explicação da questão nova ${id}, sem referência posicional.`,
  };
}

function executarGit(args) {
  const r = spawnSync('git', args, { cwd: FIXTURE, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} falhou:\n${r.stderr || r.stdout}`);
}

function publicarFixture(mensagem) {
  executarGit(['add', '-A']);
  executarGit(['commit', '-m', mensagem, '--quiet']);
}

function fragmentos(area, questoes) {
  const dir = join(FIXTURE, '_quiz-fragmentos', area);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '01.json'), JSON.stringify(questoes, null, 2) + '\n');
}

function anexar(area, questoes) {
  fragmentos(area, questoes);
  exigirSucesso('montar-quiz.mjs', ['--append', area]);
}

try {
  for (const script of ['build-site.mjs', 'montar-quiz.mjs', 'balancear-quiz.mjs']) {
    writeFileSync(join(FIXTURE, script), readFileSync(join(ROOT, script)));
  }
  for (const area of AREAS) {
    for (const tema of ['01', '02']) criarTema(area, tema);
    writeFileSync(join(FIXTURE, area, 'quiz.json'), JSON.stringify(criarBanco(area), null, 2) + '\n');
  }
  executarGit(['init', '--quiet']);
  executarGit(['config', 'user.name', 'Fixture Test']);
  executarGit(['config', 'user.email', 'fixture@example.invalid']);
  exigirSucesso('build-site.mjs');
  const antes = Object.fromEntries(AREAS.map((area) => [area, leituraSite(area)]));
  const bancoInicial = Object.fromEntries(AREAS.map((area) => [area, JSON.parse(readFileSync(join(FIXTURE, area, 'quiz.json'), 'utf8'))]));
  publicarFixture('baseline de teste — oito questões');

  // Montage também falha fechado se o banco de trabalho já mudou um prefixo.
  {
    const area = AREAS[0], path = join(FIXTURE, area, 'quiz.json');
    const fragmento = Array.from({ length: 22 }, (_, i) => criarQuestao(area, '01', i + 500));
    fragmentos(area, fragmento);
    const alterado = structuredClone(bancoInicial[area]);
    alterado['01'][0].q += ' modificação prévia';
    writeFileSync(path, JSON.stringify(alterado, null, 2) + '\n');
    const bytesAntes = readFileSync(path, 'utf8');
    const falha = executar('montar-quiz.mjs', ['--append', area]);
    assert.notEqual(falha.status, 0);
    assert.equal(readFileSync(path, 'utf8'), bytesAntes, 'montagem inválida não pode escrever');
    writeFileSync(path, JSON.stringify(bancoInicial[area], null, 2) + '\n');
  }
  passed.push('montagem rejeita prefixo pré-alterado antes de escrever');

  // Primeira publicação: 8 -> 30. A fronteira vem de HEAD, não de um número fixo.
  for (const area of AREAS) {
    const primeirasNovas = Array.from({ length: 22 }, (_, i) => criarQuestao(area, '01', i + 1));
    anexar(area, primeirasNovas);
    const montado = readFileSync(join(FIXTURE, area, 'quiz.json'), 'utf8');
    exigirSucesso('montar-quiz.mjs', ['--append', area]);
    assert.equal(readFileSync(join(FIXTURE, area, 'quiz.json'), 'utf8'), montado,
      `${area}: repetição do mesmo fragmento antes do balanceamento é idempotente`);
    exigirSucesso('balancear-quiz.mjs', ['--novas', area]);
    const banco30 = JSON.parse(readFileSync(join(FIXTURE, area, 'quiz.json'), 'utf8'));
    assert.equal(banco30['01'].length, 30);
    assert.deepEqual(banco30['01'].slice(0, 8), bancoInicial[area]['01']);
    assert.deepEqual(banco30['02'], bancoInicial[area]['02']);
    const caudaBalanceada = banco30['01'].slice(8);
    assert.ok(caudaBalanceada.some((q, i) => q.c !== primeirasNovas[i].c), `${area}: novas corretas foram balanceadas`);
    caudaBalanceada.forEach((q, i) => {
      assert.deepEqual([...q.a].sort(), [...primeirasNovas[i].a].sort(), 'balanceamento só permuta alternativas novas');
      assert.equal(q.a[q.c], primeirasNovas[i].a[primeirasNovas[i].c], 'gabarito semântico da questão nova preservado');
    });
    // Questões novas foram balanceadas; a posição alvo já está estável ao repetir.
    exigirSucesso('balancear-quiz.mjs', ['--novas', area]);
    assert.deepEqual(JSON.parse(readFileSync(join(FIXTURE, area, 'quiz.json'), 'utf8')), banco30,
      `${area}: balanceamento de novas questões deve ser idempotente`);
  }
  passed.push('append e balance preservam prefixo 8→30 nas duas áreas; repetição é idempotente');

  exigirSucesso('build-site.mjs');
  const apos30 = Object.fromEntries(AREAS.map((area) => [area, leituraSite(area)]));
  const banco30 = Object.fromEntries(AREAS.map((area) => [area, JSON.parse(readFileSync(join(FIXTURE, area, 'quiz.json'), 'utf8'))]));
  publicarFixture('expansão 8→30');

  // Segunda publicação: 30 -> 40. As trinta já publicadas nunca são rebalanceadas.
  for (const area of AREAS) {
    const novas40 = Array.from({ length: 10 }, (_, i) => criarQuestao(area, '01', i + 100));
    anexar(area, novas40);
    exigirSucesso('balancear-quiz.mjs', ['--novas', area]);
    const banco40 = JSON.parse(readFileSync(join(FIXTURE, area, 'quiz.json'), 'utf8'));
    assert.equal(banco40['01'].length, 40);
    assert.deepEqual(banco40['01'].slice(0, 30), banco30[area]['01'], `${area}: questões 1–30 não podem ser reprocessadas`);
    assert.ok(banco40['01'].slice(30).some((q, i) => q.c !== novas40[i].c), `${area}: somente as dez novas corretas recebem rotação`);
    assert.deepEqual(banco40['02'], banco30[area]['02']);
  }
  passed.push('segunda expansão 30→40 preserva integralmente as 30 questões publicadas');

  exigirSucesso('build-site.mjs');
  const expandidos = Object.fromEntries(AREAS.map((area) => [area, leituraSite(area)]));
  for (const area of AREAS) {
    const current = expandidos[area].data;
    for (const old of [antes[area].data, apos30[area].data]) {
      assert.ok(current.quizCompat.some((c) => c.fp === old.fp && c.chash === old.chash && c.quizHash === old.quizHash),
        `${area}: SHA-256 da etapa anterior precisa continuar compatível`);
    }
    assert.equal(current.topics.find((t) => t.id === '01').cards[0].bodyHtml,
      antes[area].data.topics.find((t) => t.id === '01').cards[0].bodyHtml, 'questões abertas permanecem iguais');
  }
  const html40 = Object.fromEntries(AREAS.map((area) => [area, expandidos[area].html]));
  exigirSucesso('build-site.mjs');
  for (const area of AREAS) assert.equal(leituraSite(area).html, html40[area], `${area}: build repetido deve ser determinístico`);
  passed.push('histórico SHA-256 multi-etapas permanece determinístico entre builds');

  for (const area of AREAS) {
    const current = expandidos[area];
    for (const old of [antes[area].data, apos30[area].data]) {
      const saved = registroSim({ data: old }, ['01', 0], old.quizHash, old.fp, old.chash);
      const key = `estudos:${area}:sim`;
      const app = rodarApp(current, { [key]: JSON.stringify(saved) });
      app.run('renderSimulado()');
      const migrated = JSON.parse(app.store.get(key));
      assert.equal(migrated.quizHash, current.data.quizHash);
      assert.deepEqual(migrated.itens, saved.itens);
      assert.deepEqual(migrated.resp, saved.resp);
    }
    const unsigned = registroSim({ data: antes[area].data }, ['01', 0], undefined,
      antes[area].data.fp, antes[area].data.chash);
    const unsignedKey = `estudos:${area}:sim`;
    const legacyApp = rodarApp(current, { [unsignedKey]: JSON.stringify(unsigned) });
    legacyApp.run('renderSimulado()');
    assert.equal(legacyApp.store.get(unsignedKey), JSON.stringify(unsigned), 'sessão sem digest fica preservada');
    assert.match(legacyApp.el('main').innerHTML, /não guarda SHA-256/);
    legacyApp.run('simIniciar(10)');
    assert.equal(legacyApp.store.get(unsignedKey), JSON.stringify(unsigned), 'iniciar direto não pode sobrescrever a sessão');
    const confirmApp = rodarApp(current, { [unsignedKey]: JSON.stringify(unsigned) }, true);
    confirmApp.run('renderSimulado()');
    confirmApp.run('simArquivarEIniciar(10)');
    assert.equal(confirmApp.store.get(`${unsignedKey}:backup`), JSON.stringify(unsigned), 'backup local antes de substituir');
    assert.equal(JSON.parse(confirmApp.store.get(unsignedKey)).quizHash, current.data.quizHash);
  }
  passed.push('sessões assinadas migram por SHA-256; legadas sem digest permanecem e só cedem após backup local explícito');

  // Progresso local/nuvem continua indexado: preservado no append, sem prometer prova contra reescrita.
  for (const area of AREAS) {
    const old = antes[area].data;
    const quizKey = `estudos:${area}:quiz:v3:01:0`;
    const markKey = `estudos:${area}:01:0`;
    const cloudApp = rodarApp(expandidos[area], {
      [markKey]: 'ok', [quizKey]: String(bancoInicial[area]['01'][0].c),
      [`estudos:${area}:ts`]: JSON.stringify({ 'm:01:0': 5, 'q:01:0': 5 }),
    });
    const cloud = { fp: old.fp, chash: old.chash, marks: { '01:0': { v: 'meh', at: 4 } }, quiz: { '01:0': { v: bancoInicial[area]['01'][0].c, at: 4 } }, rev: {} };
    const merged = cloudApp.run(`mergeProgress(localProgress(), ${JSON.stringify(cloud)})`);
    cloudApp.run(`aplicarProgressoNuvem(${JSON.stringify(merged)})`);
    assert.equal(cloudApp.run(`getMark('01', 0)`), 'ok');
    assert.equal(cloudApp.run(`getQuizAns('01', 0)`), bancoInicial[area]['01'][0].c);
  }
  passed.push('questões abertas e referências local/nuvem permanecem estáveis nas duas expansões');

  // Preflight multiárea: uma área inválida não permite gravar a área válida preparada em memória.
  {
    const [boa, ruim] = AREAS;
    anexar(boa, [criarQuestao(boa, '01', 900)]);
    const ruimPath = join(FIXTURE, ruim, 'quiz.json');
    const ruimBank = JSON.parse(readFileSync(ruimPath, 'utf8'));
    ruimBank['01'][0].q += ' modificação sem publicar';
    writeFileSync(ruimPath, JSON.stringify(ruimBank, null, 2) + '\n');
    const antesBoa = readFileSync(join(FIXTURE, boa, 'quiz.json'), 'utf8');
    const antesRuim = readFileSync(ruimPath, 'utf8');
    const falha = executar('balancear-quiz.mjs', ['--novas', boa, ruim]);
    assert.notEqual(falha.status, 0);
    assert.equal(readFileSync(join(FIXTURE, boa, 'quiz.json'), 'utf8'), antesBoa);
    assert.equal(readFileSync(ruimPath, 'utf8'), antesRuim);
  }
  passed.push('preflight de múltiplas áreas falha sem escrita parcial');

  // Alteração de conteúdo original (incluindo alternativa) rompe a prova SHA.
  {
    const area = AREAS[0];
    const path = join(FIXTURE, area, 'quiz.json');
    const bank = JSON.parse(readFileSync(path, 'utf8'));
    bank['01'][0].q += ' reescrita';
    writeFileSync(path, JSON.stringify(bank, null, 2) + '\n');
    exigirSucesso('build-site.mjs');
    const changed = leituraSite(area);
    assert.ok(!changed.data.quizCompat.some((c) => c.quizHash === antes[area].data.quizHash));
    validarRejeicaoSim(changed, registroSim(antes[area], ['01', 0], antes[area].data.quizHash,
      antes[area].data.fp, antes[area].data.chash), 'enunciado original reescrito');
  }
  passed.push('conteúdo original reescrito bloqueia sessão forte e preserva a cópia original');

  // Permutação de alternativas (e do gabarito) também rompe o digest.
  {
    const area = AREAS[1];
    const path = join(FIXTURE, area, 'quiz.json');
    const bank = JSON.parse(readFileSync(path, 'utf8'));
    const q = bank['01'][0];
    [q.a[0], q.a[1]] = [q.a[1], q.a[0]];
    if (q.c === 0) q.c = 1; else if (q.c === 1) q.c = 0;
    writeFileSync(path, JSON.stringify(bank, null, 2) + '\n');
    exigirSucesso('build-site.mjs');
    const changed = leituraSite(area);
    assert.ok(!changed.data.quizCompat.some((c) => c.quizHash === antes[area].data.quizHash));
    validarRejeicaoSim(changed, registroSim(antes[area], ['01', 0], antes[area].data.quizHash,
      antes[area].data.fp, antes[area].data.chash), 'alternativas originais reordenadas');
  }
  passed.push('reordenação de alternativas bloqueia sessão forte e não apaga respostas');

  // Tema antigo removido: compatibilidade exige a lista anterior inteira em ordem.
  {
    const area = AREAS[0];
    const path = join(FIXTURE, area, 'quiz.json');
    const bank = JSON.parse(readFileSync(path, 'utf8'));
    delete bank['02'];
    writeFileSync(path, JSON.stringify(bank, null, 2) + '\n');
    rmSync(join(FIXTURE, area, '02-tema.md'));
    exigirSucesso('build-site.mjs');
    const changed = leituraSite(area);
    assert.equal(changed.data.quizCompat.length, 0);
    validarRejeicaoSim(changed, registroSim(antes[area], ['02', 0], antes[area].data.quizHash,
      antes[area].data.fp, antes[area].data.chash), 'tema original ausente');
  }
  passed.push('tema ausente bloqueia sessão antiga sem descartar os dados');

  // Hash desconhecido e colisão sintética nos 16 bits não autorizam migração.
  {
    const area = AREAS[1];
    const changed = leituraSite(area);
    const saved = registroSim(changed, ['01', 0], 'a'.repeat(64), changed.data.fp, changed.data.chash);
    validarRejeicaoSim(changed, saved, 'hash forte desconhecido com fp/chash atuais');

    const unsigned = registroSim(antes[area], ['01', 0], undefined, antes[area].data.fp, antes[area].data.chash);
    const collisionData = { ...changed.data, fp: antes[area].data.fp, chash: antes[area].data.chash, quizCompat: [] };
    const collisionHtml = changed.html.replace(/(<script id="site-data" type="application\/json">)[\s\S]*?(<\/script>)/,
      (_, a, b) => a + JSON.stringify(collisionData) + b);
    const collision = { ...changed, html: collisionHtml, data: collisionData };
    validarRejeicaoSim(collision, unsigned, 'colisão artificial nos hashes de 16 bits');
    validarRejeicaoSim(collision,
      registroSim(antes[area], ['01', 0], antes[area].data.quizHash, antes[area].data.fp, antes[area].data.chash),
      'hash forte antigo com colisão artificial nos hashes de 16 bits');

    // Limite documentado do progresso local/nuvem: ainda mescla a chave de índice válido.
    const cloudApp = rodarApp(changed, {});
    const raw = { fp: antes[area].data.fp, chash: antes[area].data.chash,
      quiz: { '01:0': { v: 0, at: 7 } }, marks: {}, rev: {} };
    const merged = cloudApp.run(`mergeProgress(${JSON.stringify({ quiz: {}, marks: {}, rev: {} })}, ${JSON.stringify(raw)})`);
    assert.ok(merged.quiz['01:0'], 'o merge legado permanece baseado em índice; não equivale a prova SHA-256');
  }
  passed.push('hash forte desconhecido/colisão 16-bit bloqueia simulado; limite legado cloud é explicitado');

  console.log(`quiz-append: ${passed.length} casos passaram`);
  passed.forEach((p) => console.log(`  ok  ${p}`));
} catch (e) {
  console.error(e.stack || e);
  process.exitCode = 1;
} finally {
  if (existsSync(FIXTURE)) rmSync(FIXTURE, { recursive: true, force: true });
}
