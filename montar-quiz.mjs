// montar-quiz.mjs — monta urgencia-e-emergencia/quiz.json a partir dos fragmentos.
//
// Uso: node montar-quiz.mjs
//
// Cada arquivo _quiz-fragmentos/NN.json contém um array com as 8 questões de um
// tema, no mesmo formato do quiz.json (n, q, a[4], c, e). O script:
//   1. valida o schema de cada questão (nível, enunciado, 4 alternativas, índice
//      da correta de 0 a 3, explicação) e avisa quando um tema vem com uma
//      contagem diferente de 8 questões;
//   2. recusa enunciados repetidos entre TODOS os fragmentos (o build também
//      recusaria);
//   3. escreve urgencia-e-emergencia/quiz.json com as chaves em ordem numérica.
//
// É idempotente: se o conteúdo gerado for igual ao arquivo atual, não escreve
// nada. Sem fragmentos, não faz nada e sai com sucesso — assim o build continua
// funcionando antes de o conteúdo real começar a chegar.
//
// Depois de montar, rode "node balancear-quiz.mjs urgencia-e-emergencia" e
// "node build-site.mjs".

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FRAGMENTOS = join(ROOT, '_quiz-fragmentos');
const DESTINO = join(ROOT, 'urgencia-e-emergencia', 'quiz.json');
const POR_TEMA = 8;

const NIVEIS = ['🟢', '🟡', '🔴'];

// Mesma normalização do build-site.mjs: acusa duplicata que o build acusaria.
const normalizar = (s) => s.toLowerCase().replace(/\*|`|\s+/g, ' ').trim();

const erros = [];
const avisos = [];
const banco = {};
const vistas = new Map();

const arquivos = existsSync(FRAGMENTOS)
  ? readdirSync(FRAGMENTOS).filter((f) => /^\d{2}\.json$/.test(f)).sort()
  : [];

if (!arquivos.length) {
  console.log('Nenhum fragmento em _quiz-fragmentos/ — quiz.json mantido como está.');
  process.exit(0);
}

for (const arquivo of arquivos) {
  const tema = arquivo.slice(0, 2);
  let questoes;
  try {
    questoes = JSON.parse(readFileSync(join(FRAGMENTOS, arquivo), 'utf8'));
  } catch (e) {
    erros.push(`${arquivo}: JSON inválido — ${e.message}`);
    continue;
  }
  if (!Array.isArray(questoes)) {
    erros.push(`${arquivo}: o conteúdo precisa ser um array de questões`);
    continue;
  }
  if (!questoes.length) {
    erros.push(`${arquivo}: o array de questões está vazio`);
    continue;
  }
  if (questoes.length !== POR_TEMA) {
    avisos.push(`${arquivo}: ${questoes.length} questões (o padrão do projeto é ${POR_TEMA} por tema)`);
  }

  questoes.forEach((q, i) => {
    const ref = `${arquivo} questão ${i + 1}`;
    if (!q || !NIVEIS.includes(q.n)) erros.push(`${ref}: nível inválido (use 🟢, 🟡 ou 🔴)`);
    if (!q || typeof q.q !== 'string' || !q.q.trim()) erros.push(`${ref}: enunciado vazio`);
    if (!q || !Array.isArray(q.a) || q.a.length !== 4 || q.a.some((a) => typeof a !== 'string' || !a.trim()))
      erros.push(`${ref}: precisa ter quatro alternativas não vazias`);
    if (!q || !Number.isInteger(q.c) || q.c < 0 || q.c > 3) erros.push(`${ref}: índice da correta inválido`);
    if (!q || typeof q.e !== 'string' || !q.e.trim()) erros.push(`${ref}: explicação vazia`);
    if (q && typeof q.q === 'string' && q.q.trim()) {
      const chave = normalizar(q.q);
      if (vistas.has(chave)) erros.push(`${ref}: enunciado duplicado de ${vistas.get(chave)}`);
      else vistas.set(chave, ref);
    }
  });

  banco[tema] = questoes;
}

if (erros.length) {
  console.error('✖ Fragmentos inválidos:\n');
  erros.forEach((e) => console.error(`   ${e}`));
  console.error('\n   Nada foi escrito. Corrija os fragmentos e rode de novo.');
  process.exit(1);
}

if (avisos.length) {
  console.warn('⚠ Avisos (os fragmentos foram montados mesmo assim):\n');
  avisos.forEach((a) => console.warn(`   ${a}`));
}

const ordenado = {};
for (const tema of Object.keys(banco).sort()) ordenado[tema] = banco[tema];

// Mesmo estilo de formatação do balancear-quiz.mjs: uma alternativa por linha
// para o diff do git ficar legível.
const json = JSON.stringify(ordenado, null, 2).replace(/\n {6}/g, ' ').replace(/\n {4}\]/g, ']') + '\n';
const atual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';

const total = Object.values(ordenado).reduce((a, qs) => a + qs.length, 0);
if (json === atual) {
  console.log(`✔ quiz.json já está em dia — ${Object.keys(ordenado).length} tema(s), ${total} questões.`);
} else {
  writeFileSync(DESTINO, json, 'utf8');
  console.log(`✔ quiz.json escrito — ${Object.keys(ordenado).length} tema(s), ${total} questões.`);
  console.log('  Rode "node balancear-quiz.mjs urgencia-e-emergencia" e "node build-site.mjs".');
}
