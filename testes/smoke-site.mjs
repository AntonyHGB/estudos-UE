// Smoke do renderer cliente: executa o JavaScript real do site gerado num DOM
// mínimo em Node, sem browser, rede, Firebase, dependências ou progresso real.
// Uso: node build-site.mjs && node testes/smoke-site.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const areas = ['urgencia-e-emergencia', 'cirurgia'];

function smokeArea(area) {
  const html = readFileSync(join(root, area, 'index.html'), 'utf8');
  const dataMatch = html.match(/<script id="site-data" type="application\/json">([\s\S]*?)<\/script>/);
  const appMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(dataMatch && appMatch, `${area}: scripts de dados/runtime ausentes`);

  const data = JSON.parse(dataMatch[1]);
  const title = data.title;
  const topic = data.topics.find((candidate) => candidate.quiz.length > 0);
  assert.ok(topic, `${area}: não há tema com quiz para o smoke`);
  const question = topic.quiz[0];
  const storage = new Map();
  const elements = new Map();
  const errors = [];

  function element(id = '') {
    return {
      id, innerHTML: '', textContent: '', value: '', className: '',
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      style: {}, dataset: {},
      addEventListener() {}, removeEventListener() {}, setAttribute() {},
      querySelectorAll() { return []; }, querySelector() { return null; },
      appendChild() {}, removeChild() {}, replaceWith() {}, insertAdjacentElement() {},
      click() {}, focus() {}, select() {}, setSelectionRange() {}, scrollIntoView() {},
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement(tag) { return element(tag); },
    body: element('body'),
    execCommand() { return true; },
  };
  const siteDataElement = document.getElementById('site-data');
  // A config pública presente no HTML não deve iniciar SDK/rede neste teste.
  data.firebase = null;
  data.firebaseSdk = null;
  siteDataElement.textContent = JSON.stringify(data);

  const context = vm.createContext({
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    location: { protocol: 'http:', origin: 'http://localhost', pathname: `/${area}/`, search: '', hash: '#home', href: `http://localhost/${area}/` },
    history: { replaceState() {} },
    navigator: {},
    window: { addEventListener() {}, scrollTo() {} },
    console: { log() {}, warn() {}, error(...args) { errors.push(args.join(' ')); } },
  });

  vm.runInContext(appMatch[1], context, { filename: `${area}/app.js` });
  const main = document.getElementById('main');
  assert.match(main.innerHTML, /class="home-grid"/, `${area}: renderer não mostrou os cards`);
  assert.ok(main.innerHTML.includes(title), `${area}: título da trilha ausente`);
  assert.ok(main.innerHTML.includes(topic.shortTitle), `${area}: card do tema ausente`);
  const card = main.innerHTML.match(new RegExp(`<a class="home-card" href="#topic/${topic.id}">([\\s\\S]*?)<\\/a>`));
  assert.ok(card, `${area}: markup do card não foi renderizado`);
  assert.doesNotMatch(card[1], /<p\b|class="(?:sub|description|subtitle)\b/i, `${area}: descrição inesperada no card`);

  vm.runInContext(`renderTopic(${JSON.stringify(topic.id)}, 'estudo')`, context);
  assert.match(main.innerHTML, /class="topic-head"/, `${area}: cabeçalho do tema ausente`);
  assert.ok(main.innerHTML.includes(topic.fullTitle), `${area}: título completo do tema ausente`);
  assert.doesNotMatch(main.innerHTML, /class="sub"/, `${area}: descrição/subtítulo reapareceu na página do tema`);

  vm.runInContext(`renderTopic(${JSON.stringify(topic.id)}, 'quiz')`, context);
  assert.ok(main.innerHTML.includes(question.q), `${area}: questão não foi renderizada`);
  vm.runInContext(`answerQuiz(${JSON.stringify(topic.id)}, 0, ${question.c})`, context);
  vm.runInContext(`renderTopic(${JSON.stringify(topic.id)}, 'quiz')`, context);
  assert.match(main.innerHTML, /✅ Correto!/, `${area}: seleção correta não gerou resultado`);
  assert.match(main.innerHTML, /class="qz-exp"/, `${area}: explicação da resposta não foi renderizada`);
  assert.ok(main.innerHTML.includes(question.e), `${area}: texto da explicação não aparece no resultado`);

  const secondQuestion = topic.quiz[1];
  assert.ok(secondQuestion, `${area}: é necessária uma segunda questão para o smoke de resposta incorreta`);
  const wrongAnswer = secondQuestion.c === 0 ? 1 : 0;
  vm.runInContext(`answerQuiz(${JSON.stringify(topic.id)}, 1, ${wrongAnswer})`, context);
  vm.runInContext(`renderTopic(${JSON.stringify(topic.id)}, 'quiz')`, context);
  assert.match(main.innerHTML, /❌ Você marcou/, `${area}: resposta incorreta não foi identificada`);
  assert.ok(main.innerHTML.includes(secondQuestion.e), `${area}: explicação da resposta incorreta não aparece`);
  vm.runInContext(`answerQuiz(${JSON.stringify(topic.id)}, 1, ${secondQuestion.c})`, context);
  vm.runInContext(`renderTopic(${JSON.stringify(topic.id)}, 'quiz')`, context);
  assert.match(main.innerHTML, /❌ Você marcou/, `${area}: resposta já registrada foi alterada por nova seleção`);
  assert.deepEqual(errors, [], `${area}: erros no console do runtime: ${errors.join('; ')}`);

  console.log(`smoke-site: ${area} — trilha/cards, tópico sem subtítulo, respostas corretas/incorretas e explicações — PASS`);
}

for (const area of areas) smokeArea(area);
