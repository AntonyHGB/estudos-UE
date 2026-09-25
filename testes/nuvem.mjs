// testes/nuvem.mjs — testa o núcleo do progresso na nuvem no index.html gerado.
//
// Uso:
//   node build-site.mjs
//   node testes/nuvem.mjs [caminho/index.html]
//
// Sem dependências: extrai o script do HTML, roda num contexto vm com DOM e
// localStorage mockados e exercita as funções puras de snapshot/mesclagem/aplicação.
// Não toca a rede: o SDK do Firebase só é importado se explicitamente chamado,
// e o teste garante que, sem config, a aba Nuvem não tenta nada.
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const file = process.argv[2] || fileURLToPath(new URL('../urgencia-e-emergencia/index.html', import.meta.url));
const html = readFileSync(file, 'utf8');

const mData = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/);
const mScript = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!mData || !mScript) { console.error('Não achei os blocos de script no HTML gerado.'); process.exit(2); }
const siteData = JSON.parse(mData[1]);
const appJs = mScript[1];

/* ---------- mocks mínimos (mesmo padrão do __ee-tests/harness.mjs) ---------- */
let lastConfirm = '';
let confirmResult = false;
globalThis.confirm = (msg) => { lastConfirm = String(msg); return confirmResult; };

const els = new Map();
function makeEl(id) {
  return {
    id, textContent: '', innerHTML: '', value: '',
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
  protocol: 'http:', origin: 'http://localhost', pathname: '/urgencia-e-emergencia/',
  search: '', hash: '#home', href: 'http://localhost/urgencia-e-emergencia/',
};
globalThis.history = { replaceState() {} };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
globalThis.window = { addEventListener() {}, scrollTo() {} };

const run = (code) => vm.runInThisContext(code, { filename: 'app-interno.js' });
const SKEY = 'estudos:' + siteData.siteKey;
const TID = siteData.topics[0].id;

run(appJs, { filename: 'app.js' });

let passed = 0, failed = 0;
function test(nome, fn) {
  store.clear();
  try { fn(); console.log(`  ok  ${nome}`); passed++; }
  catch (e) { console.log(`  FAIL ${nome}\n       ${e.message}`); failed++; }
}
const ev = (code) => run(code);
const evj = (code) => JSON.parse(run('JSON.stringify(' + code + ')'));

console.log(`testes/nuvem.mjs: ${file}`);

/* ---------- 1. estado da nuvem acompanha a config embutida ---------- */
const firebaseConfigPath = fileURLToPath(new URL('../firebase-config.json', import.meta.url));
const temConfigArquivo = existsSync(firebaseConfigPath);

test('sem config a nuvem fica desligada e não vai à rede', () => {
  if (siteData.firebase || temConfigArquivo) return; // estado configurado é coberto abaixo
  assert.equal(evj('DATA.firebase'), null, 'build padrão não deve trazer config');
  assert.equal(ev('fbConfigurado()'), false);
  ev('renderNuvem()');
  const h = document.getElementById('main').innerHTML;
  assert.match(h, /Nuvem não configurada/);
  assert.match(h, /segue salvo apenas no navegador/);
  // nenhum estado de carregamento: não houve tentativa de importar o SDK
  assert.equal(evj('FB.loaded'), false);
  assert.equal(ev('FB.error'), '');
});

/* Com firebase-config.json o build embute SOMENTE a config pública do app web
   (nada de credencial de administrador). Validação é offline: compara com o
   arquivo-fonte e confere os tipos/formatos — não importa o SDK nem toca a rede. */
test('config pública do Firebase é embutida como no arquivo, sem credencial de admin', () => {
  if (!siteData.firebase) return; // sem config, o teste acima cobre o outro estado
  assert.equal(ev('fbConfigurado()'), true, 'com config o recurso fica disponível');
  assert.equal(evj('FB.loaded'), false, 'nada é carregado antes de abrir a aba Nuvem');
  assert.equal(ev('FB.error'), '');

  const cfg = JSON.parse(readFileSync(firebaseConfigPath, 'utf8'));
  const fb = siteData.firebase;
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId']) {
    assert.equal(fb[k], cfg[k], `${k} embutido deve bater com o arquivo`);
  }
  assert.match(fb.apiKey, /^AIza[0-9A-Za-z_-]+$/, 'apiKey no formato de chave pública web');
  assert.match(fb.appId, /^1:\d+:web:[0-9a-f]+$/, 'appId no formato de app web');
  const proibidos = ['private_key', 'privateKey', 'client_email', 'clientEmail', 'refresh_token', 'refreshtoken', 'serviceAccount', 'service_account'];
  for (const k of proibidos) assert.ok(!(k in fb), `config embutida não pode conter ${k}`);
});

/* ---------- 2. carimbo de tempo por item ---------- */
test('setMark/setQuizAns registram carimbo de tempo do item', () => {
  ev(`setMark(${JSON.stringify(TID)}, 0, 'ok')`);
  ev(`setQuizAns(${JSON.stringify(TID)}, 1, 2)`);
  assert.ok(ev(`tsGet('m:${TID}:0')`) > 0, 'marcação deve ter timestamp');
  assert.ok(ev(`tsGet('q:${TID}:1')`) > 0, 'resposta deve ter timestamp');
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 0)`), 'ok');
  assert.equal(ev(`getQuizAns(${JSON.stringify(TID)}, 1)`), 2);
});

/* ---------- 3. snapshot local, inclusive tombstones de itens limpos ---------- */
test('localProgress guarda marcações, respostas e tombstones de limpeza', () => {
  ev(`setMark(${JSON.stringify(TID)}, 0, 'ok')`);
  ev(`setMark(${JSON.stringify(TID)}, 1, 'bad')`);
  ev(`setMark(${JSON.stringify(TID)}, 1, '')`); // limpa: vira tombstone com timestamp
  ev(`setQuizAns(${JSON.stringify(TID)}, 2, 1)`);
  const p = evj('localProgress()');
  assert.equal(p.marks[`${TID}:0`].v, 'ok');
  assert.equal(p.marks[`${TID}:1`].v, '', 'item limpo vira tombstone');
  assert.ok(p.marks[`${TID}:1`].at > 0);
  assert.equal(p.quiz[`${TID}:2`].v, 1);
  assert.equal(p.fp, siteData.fp);
  assert.equal(p.chash, siteData.chash);
});

/* ---------- 4. mesclagem: mais novo vence; empate prefere o local ---------- */
test('mergeProgress: para cada item vence a versão com timestamp maior', () => {
  const merged = evj(`mergeProgress(
    { marks: { '${TID}:0': { v:'ok', at: 100 }, '${TID}:1': { v:'bad', at: 50 } }, quiz: {}, rev: {}, updatedAt: 10 },
    { marks: { '${TID}:0': { v:'bad', at: 200 }, '${TID}:1': { v:'', at: 50 } }, quiz: {}, rev: {}, updatedAt: 20 }
  )`);
  assert.equal(merged.marks[`${TID}:0`].v, 'bad', 'cloud mais nova vence');
  assert.equal(merged.marks[`${TID}:1`].v, 'bad', 'empate prefere o local (não sobrescreve)');
  assert.equal(merged.updatedAt, 20);
});

/* ---------- 5. mesclagem: união, nada é perdido ---------- */
test('mergeProgress: união de itens exclusivos de cada lado', () => {
  const merged = evj(`mergeProgress(
    { marks: { '${TID}:0': { v:'ok', at: 1 } }, quiz: {}, rev: { '${TID}': 111 }, updatedAt: 5 },
    { marks: { '${TID}:3': { v:'meh', at: 2 } }, quiz: { '${TID}:1': { v:3, at: 2 } }, rev: { '02': 222 }, updatedAt: 6 }
  )`);
  assert.equal(merged.marks[`${TID}:0`].v, 'ok');
  assert.equal(merged.marks[`${TID}:3`].v, 'meh');
  assert.equal(merged.quiz[`${TID}:1`].v, 3);
  assert.equal(merged.rev[`${TID}`], 111);
  assert.equal(merged.rev['02'], 222);
});

test('mergeProgress: local vazio adota tudo da nuvem (primeiro sync no aparelho novo)', () => {
  const merged = evj(`mergeProgress(
    { marks:{}, quiz:{}, rev:{}, updatedAt:0 },
    { marks: { '${TID}:0': { v:'ok', at: 9 } }, quiz: { '${TID}:1': { v:2, at: 9 } }, rev: { '${TID}': 9 }, updatedAt: 9 }
  )`);
  assert.equal(merged.marks[`${TID}:0`].v, 'ok');
  assert.equal(merged.quiz[`${TID}:1`].v, 2);
  assert.equal(merged.rev[`${TID}`], 9);
});

/* ---------- 6. aplicar: valida índices e temas ---------- */
test('aplicarProgressoNuvem aplica itens válidos e ignora fora do intervalo/tema', () => {
  ev(`aplicarProgressoNuvem({
    marks: { '${TID}:0': { v:'ok', at: 7 }, '99:0': { v:'bad', at: 7 }, '${TID}:999': { v:'bad', at: 7 } },
    quiz:  { '${TID}:1': { v:2, at: 7 }, '${TID}:1x': { v:2, at: 7 } },
    rev:   { '${TID}': 7, '99': 7 }
  })`);
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 0)`), 'ok');
  assert.equal(ev(`getQuizAns(${JSON.stringify(TID)}, 1)`), 2);
  assert.equal(ev(`getMark('99', 0)`), '', 'tema inexistente é ignorado');
  assert.equal(ev(`LS.get(SKEY + ':rev:' + '99')`), null, 'rev de tema inexistente é ignorado');
});

test('aplicarProgressoNuvem com índice de alternativa inválido apaga em vez de gravar lixo', () => {
  ev(`setQuizAns(${JSON.stringify(TID)}, 2, 1)`);
  ev(`aplicarProgressoNuvem({ marks:{}, quiz:{ '${TID}:2': { v: 42, at: 8 } }, rev:{} })`);
  assert.equal(ev(`getQuizAns(${JSON.stringify(TID)}, 2)`), null, 'índice fora do range é descartado');
});

/* ---------- 7. normalização da nuvem ---------- */
test('normalizarNuvem descarta campos com tipo errado e mantém o resto', () => {
  const n = evj(`normalizarNuvem({
    fp: 1, chash: 2, updatedAt: 'x',
    marks: { a: { v:'ok', at: '3' }, b: { v: 5 } },
    quiz:  { c: { v: 2, at: 4 }, d: { v: 'no' } },
    rev:   { e: 5, f: 0 }
  })`);
  assert.equal(n.marks.a.v, 'ok');
  assert.equal(n.marks.a.at, 3);
  assert.equal(n.marks.b, undefined, 'v não-string é descartado');
  assert.equal(n.quiz.c.v, 2);
  assert.equal(n.quiz.d, undefined);
  assert.equal(n.rev.e, 5);
  assert.equal(n.rev.f, undefined, 'zero é descartado');
  assert.equal(n.updatedAt, 0);
});

/* ---------- 8. trava de troca de conta ---------- */
test('contaDiferente evita misturar progresso de contas no mesmo navegador', () => {
  run(`CLOUD_USER = { uid: 'A' }`);
  LS.set(SKEY + ':cloud:uid', 'A');
  assert.equal(ev('contaDiferente()'), false);
  run(`CLOUD_USER = { uid: 'B' }`);
  assert.equal(ev('contaDiferente()'), true, 'conta diferente deve travar o merge automático');
  run('CLOUD_USER = null');
});

/* ---------- 9. interface antiga removida; links não importam silenciosamente ---------- */
test('fluxo de transferência antigo não está mais disponível', () => {
  assert.doesNotMatch(appJs, /function (?:encodeProgress|decodeProgress|doImport|downloadBackup)\s*\(/);
  assert.doesNotMatch(appJs, /Levar progresso|expLink|impCode/);
  assert.match(appJs, /Links antigos \?p=/);
  assert.match(appJs, /Nada foi importado ou alterado/);
});

/* ---------- 10. regras do Firestore: default-deny e vínculo ao UID ---------- */
test('firestore.rules nega por padrão e prende o acesso ao UID aprovado', () => {
  const rules = readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8');
  assert.match(rules, /match \/\{document=\*\*\}/, 'precisa da regra curinga');
  assert.match(rules, /allow read, write: if false;/, 'curinga precisa negar');
  assert.match(rules, /request\.auth\.uid == uid/, 'acesso preso ao próprio UID');
  assert.match(rules, /email_verified == true/, 'exige e-mail verificado');
  assert.match(rules, /documents\/acessos\/\$\(uid\)/, 'exige documento de aprovação');
  assert.match(rules, /aprovado == true/, 'só aprovação explícita libera');
  assert.doesNotMatch(rules, /allow (read|write|read, write): if true/, 'não pode haver liberação total');
});

/* ==========================================================================
   Caminhos de execução (async), com o Firestore mockado — sem rede.
   Exercitam nuvemSincronizar / nuvemBaixar, não só as funções puras.
   ========================================================================== */
function mockCloud(initial) {
  const state = { cloud: initial ?? null, txCalls: 0, writes: 0, failTx: false };
  globalThis.FB.loaded = true;
  globalThis.FB.firestore = {};
  globalThis.FB.fs = {
    doc: () => ({ id: 'areas/' + siteData.siteKey }),
    getDoc: async () => ({ exists: () => state.cloud != null, data: () => state.cloud }),
    setDoc: async (_ref, p) => { state.writes++; state.cloud = p; },
    runTransaction: async (_db, cb) => {
      state.txCalls++;
      if (state.failTx) throw Object.assign(new Error('tx'), { code: 'unavailable' });
      const tx = {
        get: async () => ({ exists: () => state.cloud != null, data: () => state.cloud }),
        set: (_ref, p) => { state.cloud = p; },
      };
      return await cb(tx);
    },
  };
  globalThis.FB.auth = {
    currentUser: { uid: 'B', email: 'b@exemplo.test', emailVerified: true, reload: async () => {}, getIdToken: async () => {} },
  };
  run('CLOUD_USER = FB.auth.currentUser; CLOUD_APROVACAO = "aprovado"; CLOUD_MSG = null; FB.error = "";');
  return state;
}

async function atest(nome, fn) {
  store.clear();
  try { await fn(); console.log(`  ok  ${nome}`); passed++; }
  catch (e) { console.log(`  FAIL ${nome}\n       ${e.message}`); failed++; }
}

await atest('nuvemSincronizar bloqueia progresso de outra conta MESMO com a nuvem vazia', async () => {
  ev(`setMark(${JSON.stringify(TID)}, 0, 'ok')`);
  LS.set(SKEY + ':cloud:uid', 'A'); // marcador de outra conta
  const st = mockCloud(null); // conta B sem documento na nuvem
  confirmResult = true; // confirmação não pode contornar a trava
  await run('nuvemSincronizar()');
  assert.equal(st.cloud, null, 'progresso de A não pode subir para a conta B');
  assert.match(evj('CLOUD_MSG').m, /outra conta/);
  assert.equal(LS.get(SKEY + ':cloud:uid'), 'A', 'marcador não muda ao ser bloqueado');
});

await atest('sem marcador, primeiro sync com progresso local pede confirmação', async () => {
  ev(`setMark(${JSON.stringify(TID)}, 0, 'ok')`);
  const st = mockCloud(null);
  confirmResult = false;
  await run('nuvemSincronizar()');
  assert.equal(st.cloud, null, 'sem confirmação não sobe nada');
  assert.equal(LS.get(SKEY + ':cloud:uid'), null, 'marcador não é gravado sem confirmação');
  confirmResult = true;
  await run('nuvemSincronizar()');
  assert.ok(st.cloud, 'com confirmação, sobe');
  assert.equal(LS.get(SKEY + ':cloud:uid'), 'B');
});

await atest('nuvemSincronizar só aplica o local após a transação dar certo', async () => {
  ev(`setMark(${JSON.stringify(TID)}, 0, 'ok')`);
  LS.set(SKEY + ':cloud:uid', 'B');
  const st = mockCloud(null);
  const antes = run('JSON.stringify(localProgress())');
  st.failTx = true;
  await run('nuvemSincronizar()');
  assert.equal(st.cloud, null, 'nuvem intacta em falha');
  assert.equal(run('JSON.stringify(localProgress())'), antes, 'local intacto em falha');
  assert.match(evj('CLOUD_MSG').m, /nada foi alterado/);
  st.failTx = false;
  await run('nuvemSincronizar()');
  assert.equal(st.txCalls, 2, 'usa transação');
  assert.ok(st.cloud, 'grava em sucesso');
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 0)`), 'ok');
});

await atest('nuvemSincronizar (mesclar) preserva item só local e o sobe', async () => {
  ev(`setMark(${JSON.stringify(TID)}, 0, 'ok')`);
  ev(`setMark(${JSON.stringify(TID)}, 5, 'bad')`);
  LS.set(SKEY + ':cloud:uid', 'B');
  const st = mockCloud({ marks: { [`${TID}:0`]: { v: 'ok', at: 100 } }, quiz: {}, rev: {}, updatedAt: 100 });
  confirmResult = true;
  await run('nuvemSincronizar()');
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 5)`), 'bad', 'merge não apaga item só local');
  assert.ok(st.cloud.marks[`${TID}:5`], 'item só local sobe para a nuvem');
});

await atest('nuvemBaixar substitui o local (remove ausentes no cloud) e permite desfazer', async () => {
  ev(`setMark(${JSON.stringify(TID)}, 0, 'ok')`);
  ev(`setQuizAns(${JSON.stringify(TID)}, 1, 2)`);
  ev(`setMark(${JSON.stringify(TID)}, 5, 'bad')`);
  mockCloud({ marks: { [`${TID}:0`]: { v: 'meh', at: 100 } }, quiz: {}, rev: {}, updatedAt: 100 });
  confirmResult = true;
  await run('nuvemBaixar()');
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 0)`), 'meh', 'valor da nuvem substitui');
  assert.equal(ev(`getQuizAns(${JSON.stringify(TID)}, 1)`), null, 'item ausente no cloud é removido');
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 5)`), '', 'item ausente no cloud é removido');
  assert.equal(ev('temBackupLocal()'), true, 'guardou backup antes de substituir');
  confirmResult = true;
  await run('nuvemRestaurarBackup()');
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 0)`), 'ok', 'backup restaura o valor anterior');
  assert.equal(ev(`getQuizAns(${JSON.stringify(TID)}, 1)`), 2);
  assert.equal(ev(`getMark(${JSON.stringify(TID)}, 5)`), 'bad');
  assert.equal(ev('temBackupLocal()'), false, 'backup consumido ao restaurar');
});

/* ==========================================================================
   Cadastro e reenvio de verificação: a UI precisa distinguir "conta criada"
   de "e-mail enviado" e nunca mascarar a falha de envio. Sem rede: o SDK é
   mockado e nada é importado.
   ========================================================================== */
function resetReenvio() {
  run('if (CLOUD_REENVIO_TIMER) clearTimeout(CLOUD_REENVIO_TIMER); CLOUD_REENVIO_TIMER = null; CLOUD_REENVIO_ATE = 0; CLOUD_MSG = null; FB.error = "";');
}
function mockAuth({ criarOk = true, enviarErro = null } = {}) {
  const state = { criar: 0, enviar: 0, user: null };
  globalThis.FB.loaded = true;
  globalThis.FB.auth = { currentUser: null };
  globalThis.FB.authM = {
    createUserWithEmailAndPassword: async () => {
      state.criar++;
      if (!criarOk) throw Object.assign(new Error('x'), { code: 'auth/weak-password' });
      state.user = { email: 'a@exemplo.test', emailVerified: false, reload: async () => {} };
      return { user: state.user };
    },
    sendEmailVerification: async (u) => {
      state.enviar++;
      state.user = u;
      if (enviarErro) throw Object.assign(new Error('x'), { code: enviarErro });
    },
  };
  return state;
}

await atest('nuvemRegistrar: conta criada mas envio falhou → avisa, com código, e não afirma envio', async () => {
  resetReenvio();
  ev(`document.getElementById('nvEmail').value = 'a@exemplo.test'; document.getElementById('nvSenha').value = 'segredo1';`);
  mockAuth({ enviarErro: 'auth/unauthorized-continue-uri' });
  await run('nuvemRegistrar()');
  const msg = evj('CLOUD_MSG');
  assert.equal(msg.t, 'warn', 'não é sucesso nem erro puro: é aviso');
  assert.match(msg.m, /Conta criada/);
  assert.match(msg.m, /não saiu/);
  assert.match(msg.m, /auth\/unauthorized-continue-uri/, 'expõe o código para diagnóstico');
  assert.match(msg.m, /Reenviar/, 'aponta o caminho de recuperação');
  assert.doesNotMatch(msg.m, /Enviei um e-mail/, 'não pode afirmar que o e-mail foi enviado');
});

await atest('nuvemRegistrar: sucesso do envio mantém a mensagem de confirmação', async () => {
  resetReenvio();
  ev(`document.getElementById('nvEmail').value = 'a@exemplo.test'; document.getElementById('nvSenha').value = 'segredo1';`);
  const st = mockAuth();
  await run('nuvemRegistrar()');
  const msg = evj('CLOUD_MSG');
  assert.equal(msg.t, 'ok');
  assert.equal(st.enviar, 1, 'tentou enviar exatamente uma vez');
  assert.match(msg.m, /Enviei um e-mail de verificação/);
});

await atest('nuvemRegistrar: falha ao criar conta continua sendo erro de autenticação', async () => {
  resetReenvio();
  ev(`document.getElementById('nvEmail').value = 'a@exemplo.test'; document.getElementById('nvSenha').value = 'segredo1';`);
  mockAuth({ criarOk: false });
  await run('nuvemRegistrar()');
  const msg = evj('CLOUD_MSG');
  assert.equal(msg.t, 'err');
  assert.match(msg.m, /Senha fraca/);
});

await atest('nuvemReenviar: aplica cooldown local e não repete o envio em sequência', async () => {
  resetReenvio();
  const st = mockAuth();
  st.user = { email: 'a@exemplo.test', emailVerified: false, reload: async () => {} };
  run('FB.auth.currentUser = { email: "a@exemplo.test", emailVerified: false };');
  await run('nuvemReenviar()');
  assert.equal(evj('CLOUD_MSG').t, 'ok');
  assert.equal(st.enviar, 1);
  assert.ok(ev('reenvioRestante()') > 0, 'cooldown fica ativo após sucesso');
  await run('nuvemReenviar()');
  const msg = evj('CLOUD_MSG');
  assert.equal(msg.t, 'warn');
  assert.match(msg.m, /Aguarde/);
  assert.equal(st.enviar, 1, 'não reenvia durante o cooldown');
});

await atest('nuvemReenviar: erro de envio vira aviso com o código, sem cooldown', async () => {
  resetReenvio();
  mockAuth({ enviarErro: 'auth/network-request-failed' });
  run('FB.auth.currentUser = { email: "a@exemplo.test", emailVerified: false };');
  await run('nuvemReenviar()');
  const msg = evj('CLOUD_MSG');
  assert.equal(msg.t, 'warn');
  assert.match(msg.m, /Falha de rede/);
  assert.equal(ev('reenvioRestante()'), 0, 'falha de rede não trava o botão');
});

await atest('renderNuvem: botão de reenviar desabilita durante o cooldown', async () => {
  resetReenvio();
  run('FB.loaded = true; FB.authM = { onAuthStateChanged: function(){} }; FB.auth = {}; CLOUD_BOOT = true; CLOUD_USER = { email: "a@exemplo.test", emailVerified: false }; CLOUD_APROVACAO = "nao-verificado"; location.hash = "#nuvem";');
  ev('CLOUD_REENVIO_ATE = Date.now() + 30000');
  ev('renderNuvem()');
  const h = document.getElementById('main').innerHTML;
  assert.match(h, /disabled[^>]*>Reenviar e-mail de verificação \(aguarde/, 'botão fica desabilitado com a contagem');
  run('location.hash = "#home"');
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
