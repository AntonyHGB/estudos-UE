// Testa runtime extraído, fingerprints autorizados e boot do HTML atual; sem rede/contas reais.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(`${root}/build-site.mjs`, 'utf8');
function trecho(inicio, fim) {
  const a = source.indexOf(inicio), b = source.indexOf(fim, a + inicio.length);
  assert.ok(a >= 0 && b > a, `marcadores de teste ausentes: ${inicio}`);
  return source.slice(a + inicio.length, b);
}
const snippets = [
  trecho('/* BEGIN QUIZ REVISION RUNTIME */', '/* END QUIZ REVISION RUNTIME */'),
  trecho('/* BEGIN QUIZ REVISION CLOUD RUNTIME */', '/* END QUIZ REVISION CLOUD RUNTIME */'),
  trecho('/* BEGIN QUIZ REVISION APPLY RUNTIME */', '/* END QUIZ REVISION APPLY RUNTIME */'),
];
const REV = 'cirurgia-quiz-corrections-2026-10-02-v1';
const REVISIONS = { '12:7': REV, '15:1': REV };
const CORRECOES = {
  '12:7': {
    old: ['🔴', 'Em qual situação a diretriz indica ERCP na pancreatite aguda, segundo o material da diretriz?',
      ['Para todos os pacientes com pancreatite de qualquer causa', 'Para pesquisar coledocolitíase oculta sem outra etiologia',
        'Para tratamento da necrose pancreática infectada', 'Para avaliar a gravidade na primeira hora de internação'], 1,
      'A diretriz indica o uso de ERCP para pesquisa de coledocolitíase oculta quando nenhuma outra etiologia pode ser estabelecida, e trata da colecistectomia laparoscópica no manejo da pancreatite biliar. Na avaliação por imagem do material, a ressonância entra quando os exames laboratoriais estão alterados (pancreatite aguda grave WSES 2019, p. 5 e 7).'],
    oldHash: '8265e9f880ac4140c90d73eead3f6df54b871b2908956d5a401442ae07e696f4',
    newHash: 'a3bcbb96b1b84896eab6fa3c16bad6efb5125c7d3673072d5ba01e8bac414e1f',
  },
  '15:1': {
    old: ['🟢', 'Quais critérios o material reúne nos “5 A\'s” para indicar colonoscopia?',
      ['Idade > 45, alteração do hábito, anemia, peso, familiar', 'Idade > 50, dor anal, sangramento anal, prurido, prolapso',
        'Idade > 40, anemia, massa abdominal, perda e familiar', 'Idade > 45, alteração do hábito, anemia e peso, familiar'], 0,
      'Os 5 A\'s são idade maior que 45 anos, alteração do hábito intestinal, anemia, alteração de peso e antecedente familiar de câncer colorretal. Dor anal, prurido e prolapso são queixas do próprio quadro hemorroidário, e não critérios de investigação endoscópica (Cólon e reto na cirurgia, slide 1).'],
    oldHash: 'e1d3d1da3859c4f2596ad2c1380bdfc777f8b76c6bab8e328c3420f23e3b597e',
    newHash: 'f0a6952f1c156e3d59861f6b7b1bccf99421b0f27aab274bac73e49cc7218234',
  },
};
const hashFields = (fields) => createHash('sha256').update(JSON.stringify(fields)).digest('hex');
const BASELINE = 'd252a14ea5684260383bc3c27f2a80ca7528a7db';
const headBank = JSON.parse(execFileSync('git', ['show', `${BASELINE}:cirurgia/quiz.json`], { cwd: root, encoding: 'utf8' }));
for (const [ref, expected] of Object.entries(CORRECOES)) {
  assert.equal(hashFields(expected.old), expected.oldHash, `${ref}: hash completo antigo de HEAD ${BASELINE}`);
  const [topic, index] = ref.split(':');
  const old = headBank[topic][Number(index)];
  assert.deepEqual([old.n, old.q, old.a, old.c, old.e], expected.old, `${ref}: conteúdo antigo exato de HEAD ${BASELINE}`);
  assert.equal(hashFields([old.n, old.q, old.a, old.c, old.e]), expected.oldHash, `${ref}: SHA-256 completo em HEAD ${BASELINE}`);
}
const generatedHtml = readFileSync(`${root}/cirurgia/index.html`, 'utf8');
const generatedData = JSON.parse(generatedHtml.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const generatedApp = generatedHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];
assert.deepEqual(JSON.parse(JSON.stringify(generatedData.quizAnswerRevisions)), REVISIONS, 'HTML contém exatamente as duas revisões');
const currentBank = JSON.parse(readFileSync(`${root}/cirurgia/quiz.json`, 'utf8'));
for (const [ref, expected] of Object.entries(CORRECOES)) {
  const [topic, index] = ref.split(':');
  assert.equal(hashFields([currentBank[topic][index].n, currentBank[topic][index].q, currentBank[topic][index].a, currentBank[topic][index].c, currentBank[topic][index].e]),
    expected.newHash, `${ref}: hash completo novo integrado`);
}
const key = (ref) => `estudos:cirurgia:quiz:v3:${ref}`;
const backupKey = (ref) => `estudos:cirurgia:quiz:migration-backup:${REV}:${ref}`;
const stateKey = (ref) => `estudos:cirurgia:quiz:migration-state:${REV}:${ref}`;
let falhaGravacao = 0;
const casos = [];
const caso = (name) => casos.push(name);

function novoRuntime(initial = new Map(), shared = false) {
  const store = shared ? initial : new Map(initial);
  let writes = 0;
  const context = vm.createContext({
    console, Date, JSON, Number, Object, Array, Math,
    SKEY: 'estudos:cirurgia', CLOUD_SCHEMA: 1,
    DATA: {
      siteKey: 'cirurgia', fp: 10, chash: 20, quizAnswerRevisions: { ...REVISIONS },
      topics: ['12', '15', '01'].map((id) => ({ id, cards: Array(8).fill(''), quiz: Array(8).fill(null).map(() => ({ c:0, a:['a','b','c','d'] })) })),
    },
    LS: {
      get(k) { return store.has(k) ? store.get(k) : null; },
      set(k, v) { writes++; if (falhaGravacao === writes) return; store.set(k, String(v)); },
      del(k) { store.delete(k); },
    },
    renderHome() {},
  });
  snippets.forEach((snippet) => vm.runInContext(snippet, context));
  return { context, store, writes: () => writes, run: (s) => vm.runInContext(s, context) };
}
function withFailAt(n, fn) { const prior = falhaGravacao; falhaGravacao = n; try { fn(); } finally { falhaGravacao = prior; } }
function seedOld(ref = '12:7') {
  return new Map([[key(ref), '1'], [key('15:1'), '2'], ['estudos:cirurgia:ts', JSON.stringify({ [`q:${ref}`]: 123, 'q:15:1': 124, 'q:12:6': 77 })],
    [key('12:6'), '2'], ['estudos:cirurgia:01:0', 'ok'], ['estudos:urgencia-e-emergencia:quiz:v3:12:7', '3']]);
}

// Sucesso padrão e preservação seletiva do backup/progresso fora dos dois alvos.
{
  const r = novoRuntime(seedOld());
  assert.equal(r.run('migrarRespostasQuizCorrigidas()'), true);
  assert.equal(r.store.get(key('12:7')), undefined);
  const backup = JSON.parse(r.store.get(backupKey('12:7')));
  assert.deepEqual(JSON.parse(JSON.stringify(backup)), { version:REV, item:'12:7', prior:{ answer:'1', timestamp:123 } });
  assert.equal(r.store.get(stateKey('12:7')), REV);
  assert.equal(r.store.get(key('15:1')), undefined);
  assert.equal(JSON.parse(r.store.get(backupKey('15:1'))).prior.answer, '2', 'backup independente para o segundo item');
  assert.equal(r.store.get(key('12:6')), '2');
  assert.equal(r.store.get('estudos:cirurgia:01:0'), 'ok');
  assert.equal(r.run("getQuizAns('12', 7)"), null, 'resposta antiga não valida');
  r.run("setQuizAns('12', 7, 2)");
  assert.equal(r.run("getQuizAns('12', 7)"), 2, 'resposta nova valida');
  assert.equal(r.run('migrarRespostasQuizCorrigidas()'), true);
  assert.equal(r.run("getQuizAns('12', 7)"), 2, 'reload não limpa resposta nova');
  caso('migração seletiva/backups/progresso não afetado');
}

// Falha em cada write relevante: backup/pending sem read-back bloqueiam a limpeza;
// falhas posteriores são recuperáveis pelo backup e pelo marcador pending.
for (const failureAt of [1, 2, 3, 4]) {
  const r = novoRuntime(seedOld());
  withFailAt(failureAt, () => assert.equal(r.run('migrarRespostasQuizCorrigidas()'), false));
  const raw = r.store.get(key('12:7'));
  if (failureAt <= 2) assert.equal(raw, '1', `write ${failureAt}: resposta original permanece`);
  const backupRaw = r.store.get(backupKey('12:7'));
  if (backupRaw) assert.equal(JSON.parse(backupRaw).prior.answer, '1', `write ${failureAt}: backup íntegro`);
  const reload = novoRuntime(r.store, true);
  assert.equal(reload.run('migrarRespostasQuizCorrigidas()'), true, `write ${failureAt}: reload recupera`);
  caso(`falha de gravação ${failureAt} e recuperação após reload`);
}

// Backup presente mas truncado/incompleto: não é substituído nem autoriza exclusão.
for (const corrupt of ['{', JSON.stringify({ version:REV, item:'12:7', prior:{ answer:'1' } })]) {
  const seeded = seedOld(); seeded.set(backupKey('12:7'), corrupt);
  const r = novoRuntime(seeded);
  assert.equal(r.run('migrarRespostasQuizCorrigidas()'), false);
  assert.equal(r.store.get(key('12:7')), '1');
  assert.equal(r.store.get(backupKey('12:7')), corrupt);
  caso(corrupt === '{' ? 'backup JSON corrompido falha fechado' : 'backup incompleto falha fechado');
}

// Reload após pending e escrita concorrente de resposta nova: o registro JSON atômico prevalece.
{
  const r = novoRuntime(seedOld());
  withFailAt(2, () => assert.equal(r.run('migrarRespostasQuizCorrigidas()'), false));
  r.run("setQuizAns('12', 7, 3)");
  const reload = novoRuntime(r.store, true);
  assert.equal(reload.run('migrarRespostasQuizCorrigidas()'), true);
  assert.equal(reload.run("getQuizAns('12', 7)"), 3);
  caso('resposta fresca gravada durante pending sobrevive reload');
}

// A aplicação direta de cloud legacy não apaga resposta revisada local; o
// snapshot/timestamp sobrevive merge, reload e nova sincronização bidirecional.
{
  const r = novoRuntime(seedOld());
  assert.equal(r.run('migrarRespostasQuizCorrigidas()'), true);
  r.run("setQuizAns('12', 7, 2)");
  const before = JSON.parse(r.run('JSON.stringify(localProgress())')).quiz['12:7'];
  const cloudLegacy = { quiz:{ '12:7':{ v:1, at:999999 } }, marks:{}, rev:{} };
  r.run(`aplicarProgressoNuvem(${JSON.stringify(cloudLegacy)})`);
  const afterApply = JSON.parse(r.run('JSON.stringify(localProgress())')).quiz['12:7'];
  assert.equal(r.run("getQuizAns('12', 7)"), 2);
  assert.equal(afterApply.at, before.at, 'apply da cloud legacy não regride o timestamp');
  const snapshot = JSON.parse(r.run('JSON.stringify(localProgress())'));
  const merged = JSON.parse(r.run(`JSON.stringify(mergeProgress(${JSON.stringify(snapshot)}, ${JSON.stringify(cloudLegacy)}))`));
  assert.equal(merged.quiz['12:7'].v, 2);
  r.run(`aplicarProgressoNuvem(${JSON.stringify(merged)})`);
  const reload = novoRuntime(r.store, true);
  assert.equal(reload.run('migrarRespostasQuizCorrigidas()'), true);
  const reloaded = JSON.parse(reload.run('JSON.stringify(localProgress())'));
  const resync = JSON.parse(reload.run(`JSON.stringify(mergeProgress(${JSON.stringify(reloaded)}, ${JSON.stringify(cloudLegacy)}))`));
  assert.equal(resync.quiz['12:7'].v, 2, 'resposta local nova persiste após reload/sync');
  caso('resposta fresca > apply legado > snapshot > merge > reload > resync');
}

// Duas instâncias/device mocks: legado cloud vira tombstone versionado; sync novo não ressuscita.
{
  const a = novoRuntime(seedOld()), b = novoRuntime(new Map());
  a.run('migrarRespostasQuizCorrigidas()'); b.run('migrarRespostasQuizCorrigidas()');
  const cloudOld = { quiz:{ '12:7':{ v:1, at:9999 }, '12:6':{ v:2, at:77 } }, marks:{}, rev:{} };
  const mergedA = JSON.parse(a.run(`JSON.stringify(mergeProgress(localProgress(), ${JSON.stringify(cloudOld)}))`));
  assert.equal(mergedA.quiz['12:7'].v, -1);
  assert.equal(mergedA.quiz['12:7'].r, REV);
  assert.equal(mergedA.quiz['12:6'].v, 2);
  const cloudRoundtrip = JSON.parse(a.run(`JSON.stringify(normalizarNuvem(${JSON.stringify(mergedA)}))`));
  assert.equal(cloudRoundtrip.quiz['12:7'].r, REV, 'revisão sobrevive à serialização da nuvem');
  b.run(`aplicarProgressoNuvem(${JSON.stringify(cloudOld)})`);
  assert.equal(b.run("getQuizAns('12', 7)"), null);
  const localB = JSON.parse(b.run('JSON.stringify(localProgress())'));
  assert.equal(localB.quiz['12:7'].v, -1, 'aplicação direta deixa evidência tombstone');
  b.run("setQuizAns('12', 7, 0)");
  const cloudNew = { quiz:{ '12:7':{ v:3, at:Date.now()+1000, r:REV } }, marks:{}, rev:{} };
  const mergedB = JSON.parse(b.run(`JSON.stringify(mergeProgress(localProgress(), ${JSON.stringify(cloudNew)}))`));
  assert.equal(mergedB.quiz['12:7'].v, 3, 'resposta nova da nuvem vence tombstone mais antigo');
  b.run("setQuizAns('12', 7, 0)");
  const olderCloud = { quiz:{ '12:7':{ v:3, at:1, r:REV } }, marks:{}, rev:{} };
  const mergedFreshLocal = JSON.parse(b.run(`JSON.stringify(mergeProgress(localProgress(), ${JSON.stringify(olderCloud)}))`));
  assert.equal(mergedFreshLocal.quiz['12:7'].v, 0, 'resposta nova local vence resposta revisada mais antiga');
  caso('tombstone em um device e nova resposta no outro');
}

// Boot do HTML gerado, sem Firebase e sem invocar manualmente a migração.
function bootHtml(store, failBackup = false) {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, { id, textContent:'', innerHTML:'', value:'', type:'', style:{}, dataset:{},
      classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} },
      setAttribute(){}, addEventListener(){}, removeEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
      appendChild(){}, removeChild(){}, click(){}, select(){}, setSelectionRange(){}, scrollIntoView(){}, focus(){} });
    return elements.get(id);
  };
  const dataEl = el('site-data'); dataEl.textContent = JSON.stringify({ ...generatedData, firebase:null });
  const context = vm.createContext({
    console, Date, Math, JSON, Array, Object, String, Number, RegExp, Error, Promise, setTimeout(){ return 0; }, clearTimeout(){},
    confirm(){ return false; },
    document:{ getElementById:el, querySelector(){ return null; }, querySelectorAll(){ return []; }, addEventListener(){}, createElement:el, body:el('body') },
    localStorage:{ getItem(k){ return store.has(k)?store.get(k):null; }, setItem(k,v){ if(failBackup&&k===backupKey('12:7'))throw Error('quota');store.set(k,String(v)); }, removeItem(k){ store.delete(k); } },
    location:{ protocol:'http:', pathname:'/cirurgia/', search:'', hash:'#home', href:'http://fixture/cirurgia/' },
    history:{ replaceState(){} }, navigator:{}, window:{ addEventListener(){}, scrollTo(){} },
  });
  vm.runInContext(generatedApp, context, { filename:'cirurgia/index.html app boot' });
  return { context, el };
}
{
  const seeded = seedOld();
  const boot = bootHtml(seeded);
  assert.equal(seeded.get(key('12:7')), undefined, 'boot local executa migração automaticamente');
  assert.equal(JSON.parse(seeded.get(backupKey('12:7'))).prior.answer, '1');
  assert.equal(seeded.get(stateKey('12:7')), REV);
  assert.equal(JSON.parse(seeded.get(backupKey('15:1'))).prior.answer, '2');
  assert.equal(seeded.get(key('12:6')), '2');
  assert.equal(seeded.get('estudos:urgencia-e-emergencia:quiz:v3:12:7'), '3');
  vm.runInContext("setQuizAns('12',7,0)", boot.context);
  const reloaded = bootHtml(new Map(seeded));
  assert.equal(vm.runInContext("getQuizAns('12',7)", reloaded.context), 0, 'resposta JSON revisada sobrevive reload do HTML');
  caso('boot HTML offline migra sem chamada manual; backups/reset seletivo/reload nova');
}
{
  const seeded = seedOld();
  const boot = bootHtml(seeded, true);
  assert.equal(seeded.get(key('12:7')), '1', 'quota no backup mantém valor legado armazenado');
  assert.equal(seeded.get(backupKey('12:7')), undefined);
  assert.equal(vm.runInContext("getQuizAns('12',7)", boot.context), null, 'legado inválido não pontua enquanto backup falha');
  assert.ok(boot.el('main').innerHTML.length > 0, 'falha de um backup não bloqueia o restante do estudo');
  caso('quota no boot: valor retido/falha fechada/UI permanece disponível');
}

console.log(`testes/quiz-migracao.mjs: ${casos.length} casos passaram`);
casos.forEach((name) => console.log(`  ok  ${name}`));
