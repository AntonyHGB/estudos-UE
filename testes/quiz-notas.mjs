// Uso: node build-site.mjs && node testes/quiz-notas.mjs
// Sem rede, contas reais ou escrita em bancos/progresso: DOM/localStorage mockados.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const publicado = (path) => execFileSync('git', ['show', `HEAD:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 5e6 });
const data = (html) => JSON.parse(html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const areas = ['urgencia-e-emergencia', 'cirurgia'];
const buildSource = read('build-site.mjs');
const markupRuntime = buildSource.slice(buildSource.indexOf('function escapeHtml('), buildSource.indexOf('\nfunction escapeAttr(')) +
  buildSource.slice(buildSource.indexOf('function inline('), buildSource.indexOf('\nfunction mdToHtml('));
const markupContext = vm.createContext({});
vm.runInContext(markupRuntime, markupContext);
const renderInline = (text) => vm.runInContext(`inline(${JSON.stringify(text)}, null)`, markupContext);
let ue, cirurgiaBancoBytes;
for (const area of areas) {
  const before = data(publicado(`${area}/index.html`));
  const html = read(`${area}/index.html`), after = data(html);
  const bankBytes = read(`${area}/quiz.json`), currentBank = JSON.parse(bankBytes);
  if (area === 'urgencia-e-emergencia') {
    assert.equal(bankBytes, publicado(`${area}/quiz.json`), 'UE: banco byte a byte preservado');
    assert.deepEqual(after.topics, before.topics, 'UE: campos originais preservados');
    for (const key of ['fp', 'chash', 'quizHash', 'quizCompat']) assert.deepEqual(after[key], before[key], `UE: ${key} preservado`);
    ue = { html, after, before };
  } else {
    cirurgiaBancoBytes = bankBytes;
    assert.equal(after.quizNotas, undefined, 'nenhuma nota em Cirurgia');
    for (const tema of Object.keys(currentBank)) {
      const topic = after.topics.find((t) => t.id === tema);
      assert.ok(topic, `Cirurgia: tema ${tema} presente no HTML`);
      assert.deepEqual(topic.quiz.map((q) => [q.n, q.q, q.a, q.c, q.e]),
        currentBank[tema].map((q) => [q.n, renderInline(q.q), q.a.map(renderInline), q.c, renderInline(q.e)]),
        `Cirurgia: dados gerados sincronizados para tema ${tema}`);
    }
  }
}
assert.deepEqual(Object.keys(ue.after.quizNotas), ['11:5']);
const raw = JSON.parse(read('urgencia-e-emergencia/quiz-notas.json'));
const bank = JSON.parse(read('urgencia-e-emergencia/quiz.json'));
assert.match(raw.notas[0].titulo, /segundo o Ofício Circular nº 2\/2014/);
assert.match(raw.notas[0].nota, /sem nova consulta/);

// Executa o validador real com leituras mockadas, incluindo falhas fechadas.
const source = read('build-site.mjs');
const validator = source.slice(source.indexOf('function carregarNotasQuiz('), source.indexOf('\nfunction auditarQuiz('));
function validar(value, exists = true, invalidJson = false) {
  const ctx = vm.createContext({ join, createHash, existsSync: () => exists, readFileSync: () => invalidJson ? '{' : JSON.stringify(value) });
  vm.runInContext(validator, ctx);
  return ctx.carregarNotasQuiz('/fixture', 'ue', bank);
}
assert.equal(Object.keys(validar(null, false)).length, 0, 'arquivo opcional ausente');
assert.equal(Object.keys(validar(raw)).length, 1);
for (const [key, value, message] of [
  ['tema', '99', /inexistente/], ['questao', 999, /inexistente/],
  ['questao', 0, /schema/], ['questao', 6.5, /schema/],
  ['sha256', '0'.repeat(64), /diverge/], ['sha256', 'inválido', /schema/],
  ['titulo', '', /schema/], ['nota', '', /schema/],
]) {
  const changed = structuredClone(raw); changed.notas[0][key] = value;
  assert.throws(() => validar(changed), message);
}
const duplicate = structuredClone(raw); duplicate.notas.push(duplicate.notas[0]);
assert.throws(() => validar(duplicate), /duplicada/);
assert.throws(() => validar({ notas: [], extra: true }), /esperado/);
assert.throws(() => validar(raw, true, true), /JSON inválido/);
// Alvo existente mas diferente: o digest impede reassociar a nota a Q7.
const wrongTarget = structuredClone(raw); wrongTarget.notas[0].questao = 7;
assert.throws(() => validar(wrongTarget), /diverge/);

const store = new Map();
const key = 'estudos:urgencia-e-emergencia';
const saved = { fp: ue.before.fp, chash: ue.before.chash, quizHash: ue.before.quizHash,
  itens: [['11', 5], ['11', 6]], resp: [bank['11'][5].c, null], pos: 0, fim: false };
const originalSim = JSON.stringify(saved);
store.set(key + ':sim', originalSim);
store.set(key + ':quiz:v3:11:5', String((bank['11'][5].c + 1) % 4));
store.set(key + ':11:0', 'ok');
const originalStore = [...store];
const els = new Map();
const el = (id) => {
  if (!els.has(id)) els.set(id, { id, textContent: '', innerHTML: '', value: '', style: {}, dataset: {},
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    addEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    appendChild(){}, removeChild(){}, setSelectionRange(){}, scrollIntoView(){}, focus(){}, select(){} });
  return els.get(id);
};
// Desliga Firebase somente no mock; não altera HTML publicado/configuração real.
el('site-data').textContent = JSON.stringify({ ...ue.after, firebase: null });
const ctx = vm.createContext({
  document: { getElementById: el, querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(){}, createElement: el, body: el('body') },
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  location: { protocol: 'http:', pathname: '/urgencia-e-emergencia/', search: '', hash: '#home' },
  history: { replaceState(){} }, navigator: {}, window: { addEventListener(){}, scrollTo(){} },
  confirm(){ throw new Error('nota não deve pedir confirmação de migração'); },
  setTimeout(){ return 0; }, clearTimeout(){}, console,
});
const app = ue.html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];
vm.runInContext(app, ctx);
const run = (s) => vm.runInContext(s, ctx);
const title = raw.notas[0].titulo;
assert.ok(run("quizCardHtml(DATA.topics.find(t=>t.id==='11'), DATA.topics.find(t=>t.id==='11').quiz[5], 5)").includes(title));
assert.equal(run("quizNotaHtml('11', 6)"), '', 'Q7 sem nota');
assert.equal(run("quizNotaHtml('10', 5)"), '', 'outro tema sem nota');
run('renderSimulado()');
assert.ok(el('main').innerHTML.includes(title), 'simulado em curso qualificado');
assert.equal(store.get(key + ':sim'), originalSim, 'sessão atual retida byte a byte, sem migração/bloqueio');
run('renderRevisar()');
assert.ok(el('main').innerHTML.includes(title), 'Revisar erros qualificado');
assert.deepEqual([...store], originalStore, 'renderizações não mudam respostas, marcas ou sessão');
run("var notaBusca = idxBusca().find(e=>e.tid==='11' && e.foco==='qz-5')");
assert.ok(run('notaBusca.titulo').includes(title), 'busca qualificada');
assert.ok(!run("idxBusca().find(e=>e.tid==='11' && e.foco==='qz-6').titulo").includes(title));
run("var fixtureFim=simGet(); fixtureFim.fim=true; simSet(fixtureFim); renderSimulado()");
assert.ok(el('main').innerHTML.includes(title), 'resultado do simulado qualificado');
// HTML arbitrário permanece texto escapado, inclusive em títulos de nota.
run("DATA.quizNotas['11:5']={titulo:'<img src=x onerror=alert(1)>',nota:'<script>alert(1)</script>'}");
const escaped = run("quizNotaHtml('11',5)");
assert.ok(!escaped.includes('<img') && !escaped.includes('<script>'));
assert.ok(escaped.includes('&lt;img') && escaped.includes('&lt;script&gt;'));
assert.equal(read('cirurgia/quiz.json'), cirurgiaBancoBytes, 'teste de notas não escreve no banco integrado');
console.log('quiz-notas: UE/banco e hashes preservados; Cirurgia/HTML sincronizados sem notas; validação fechada; Quiz/Simulado/resultado/Revisar/busca; sessão/respostas retidas; texto escapado — PASS');
