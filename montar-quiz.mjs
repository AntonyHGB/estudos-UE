// montar-quiz.mjs — monta o quiz.json de uma área a partir dos fragmentos.
//
// Uso: node montar-quiz.mjs [--append] [area]
//
//   node montar-quiz.mjs                 -> urgencia-e-emergencia/quiz.json (comando original)
//   node montar-quiz.mjs cirurgia        -> cirurgia/quiz.json
//   node montar-quiz.mjs --append cirurgia -> acrescenta questões sem substituir as atuais
//
// Cada arquivo _quiz-fragmentos/<area>/NN.json contém um array com as 8 questões
// de um tema, no mesmo formato do quiz.json (n, q, a[4], c, e). A área original
// (urgencia-e-emergencia) também aceita o layout antigo, com os fragmentos
// direto em _quiz-fragmentos/NN.json: o comando sem argumento não mudou. O script:
//   1. valida o schema de cada questão (nível, enunciado, 4 alternativas, índice
//      da correta de 0 a 3, explicação) e avisa quando um tema vem com uma
//      contagem diferente de 8 questões;
//   2. recusa enunciados repetidos entre TODOS os fragmentos (o build também
//      recusaria);
//   3. escreve <area>/quiz.json com as chaves em ordem numérica.
//
// É idempotente: se o conteúdo gerado for igual ao arquivo atual, não escreve
// nada. Sem fragmentos, não faz nada e sai com sucesso — assim o build continua
// funcionando antes de o conteúdo real começar a chegar.
//
// Depois de montar, rode "node balancear-quiz.mjs <area>" e
// "node build-site.mjs".

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// A área padrão preserva o comando original; qualquer outra área precisa do
// próprio diretório de fragmentos (senão o 01.json de uma área cairia na outra).
const AREA_PADRAO = 'urgencia-e-emergencia';
const args = process.argv.slice(2);
const appendOnly = args.includes('--append');
const areaArgs = args.filter((arg) => arg !== '--append');
if (areaArgs.length > 1 || args.some((arg) => arg.startsWith('-') && arg !== '--append')) {
  console.error('Uso: node montar-quiz.mjs [--append] [area]');
  process.exit(1);
}
const AREA = (areaArgs[0] || AREA_PADRAO).replace(/[/\\]+$/, '');
if (AREA === '.' || AREA === '..' || /[/\\]/.test(AREA)) {
  console.error(`✖ Área "${AREA}": informe só o nome da pasta na raiz (ex.: cirurgia).`);
  process.exit(1);
}
const DESTINO = join(ROOT, AREA, 'quiz.json');
const DIR_AREA = join(ROOT, AREA);
const DIR_FRAGMENTOS_AREA = join(ROOT, '_quiz-fragmentos', AREA);

if (!existsSync(DIR_AREA)) {
  console.error(`✖ Área "${AREA}": pasta ${AREA}/ não existe na raiz do projeto.`);
  process.exit(1);
}
if (AREA !== AREA_PADRAO && !existsSync(DIR_FRAGMENTOS_AREA)) {
  console.error(
    `✖ Área "${AREA}": crie _quiz-fragmentos/${AREA}/ com um NN.json por tema.\n` +
      `   (Os fragmentos de ${AREA_PADRAO} não são reaproveitados entre áreas.)`
  );
  process.exit(1);
}
const FRAGMENTOS = existsSync(DIR_FRAGMENTOS_AREA) ? DIR_FRAGMENTOS_AREA : join(ROOT, '_quiz-fragmentos');
const POR_TEMA = 8;

const NIVEIS = ['🟢', '🟡', '🔴'];

// Mesma normalização do build-site.mjs: acusa duplicata que o build acusaria.
const normalizar = (s) => s.toLowerCase().replace(/\*|`|\s+/g, ' ').trim();

const erros = [];
const avisos = [];
const banco = {};
const vistas = new Map();
let bancoAtual = {};
let bancoPublicado = {};

function validarQuestao(q, ref) {
  if (!q || !NIVEIS.includes(q.n)) erros.push(`${ref}: nível inválido (use 🟢, 🟡 ou 🔴)`);
  if (!q || typeof q.q !== 'string' || !q.q.trim()) erros.push(`${ref}: enunciado vazio`);
  if (!q || !Array.isArray(q.a) || q.a.length !== 4 || q.a.some((a) => typeof a !== 'string' || !a.trim()))
    erros.push(`${ref}: precisa ter quatro alternativas não vazias`);
  if (!q || !Number.isInteger(q.c) || q.c < 0 || q.c > 3) erros.push(`${ref}: índice da correta inválido`);
  if (!q || typeof q.e !== 'string' || !q.e.trim()) erros.push(`${ref}: explicação vazia`);
}

function conteudoQuestao(q) {
  if (!q || typeof q.n !== 'string' || typeof q.q !== 'string' || !Array.isArray(q.a) ||
      q.a.length !== 4 || q.a.some((a) => typeof a !== 'string') ||
      !Number.isInteger(q.c) || typeof q.e !== 'string') return null;
  return JSON.stringify([q.n, q.q, q.a, q.c, q.e]);
}

if (appendOnly && existsSync(DESTINO)) {
  try {
    bancoAtual = JSON.parse(readFileSync(DESTINO, 'utf8'));
    if (!bancoAtual || typeof bancoAtual !== 'object' || Array.isArray(bancoAtual)) {
      erros.push(`${AREA}/quiz.json: a raiz atual precisa ser um objeto de temas`);
      bancoAtual = {};
    }
  } catch (e) {
    erros.push(`${AREA}/quiz.json atual: JSON inválido — ${e.message}`);
    bancoAtual = {};
  }
  for (const [tema, questoes] of Object.entries(bancoAtual)) {
    if (!/^\d{2}$/.test(tema) || !Array.isArray(questoes)) {
      erros.push(`${AREA}/quiz.json: tema/lista inválida (${tema})`);
      continue;
    }
    questoes.forEach((q, i) => {
      const ref = `${AREA}/quiz.json tema ${tema} questão ${i + 1}`;
      validarQuestao(q, ref);
      if (q && typeof q.q === 'string' && q.q.trim()) {
        const chave = normalizar(q.q);
        if (vistas.has(chave)) erros.push(`${ref}: enunciado duplicado de ${vistas.get(chave)}`);
        else vistas.set(chave, ref);
      }
    });
  }
}

if (appendOnly) {
  try {
    bancoPublicado = JSON.parse(execFileSync('git', ['show', `HEAD:${AREA}/quiz.json`], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }));
    if (!bancoPublicado || typeof bancoPublicado !== 'object' || Array.isArray(bancoPublicado)) {
      erros.push(`HEAD:${AREA}/quiz.json: banco publicado inválido`);
      bancoPublicado = {};
    }
  } catch {
    erros.push(`append-only: não foi possível ler HEAD:${AREA}/quiz.json; nada será escrito`);
    bancoPublicado = {};
  }
  const temasPublicados = Object.keys(bancoPublicado).sort();
  const temasAtuais = Object.keys(bancoAtual).sort();
  if (temasAtuais.length < temasPublicados.length || temasPublicados.some((tema, i) => temasAtuais[i] !== tema) ||
      temasPublicados.some((tema) => !Array.isArray(bancoPublicado[tema]) || !Array.isArray(bancoAtual[tema]) ||
        bancoAtual[tema].length < bancoPublicado[tema].length ||
        bancoPublicado[tema].some((q, i) => !conteudoQuestao(q) || !conteudoQuestao(bancoAtual[tema][i]) ||
          conteudoQuestao(q) !== conteudoQuestao(bancoAtual[tema][i])))) {
    erros.push('append-only: quiz.json atual diverge do prefixo publicado em HEAD (n/q/a/c/e ou ordem)');
  }
}

const arquivos = existsSync(FRAGMENTOS)
  ? readdirSync(FRAGMENTOS).filter((f) => /^\d{2}\.json$/.test(f)).sort()
  : [];

if (!arquivos.length) {
  if (erros.length) {
    console.error('✖ Append-only abortado:\n');
    erros.forEach((e) => console.error(`   ${e}`));
    process.exit(1);
  }
  console.log(`Nenhum fragmento em _quiz-fragmentos/${AREA}/ — ${AREA}/quiz.json mantido como está.`);
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

  const publicadas = bancoPublicado[tema] || [];
  const atuais = bancoAtual[tema] || [];
  const sufixoAtual = atuais.slice(publicadas.length);
  const jaMontado = appendOnly && sufixoAtual.length === questoes.length &&
    questoes.every((q, i) => conteudoQuestao(q) === conteudoQuestao(sufixoAtual[i]));

  questoes.forEach((q, i) => {
    const ref = `${arquivo} questão ${i + 1}`;
    validarQuestao(q, ref);
    if (!jaMontado && q && typeof q.q === 'string' && q.q.trim()) {
      const chave = normalizar(q.q);
      if (vistas.has(chave)) erros.push(`${ref}: enunciado duplicado de ${vistas.get(chave)}`);
      else vistas.set(chave, ref);
    }
  });

  banco[tema] = appendOnly ? (jaMontado ? atuais : [...atuais, ...questoes]) : questoes;
}

if (appendOnly) {
  const temasAtuais = Object.keys(bancoAtual).sort();
  const temasCandidatos = Object.keys({ ...bancoAtual, ...banco }).sort();
  if (temasAtuais.some((tema, i) => temasCandidatos[i] !== tema)) {
    erros.push('append-only: os temas existentes precisam permanecer no início da ordem numérica do banco');
  }
  for (const [tema, questoes] of Object.entries(bancoAtual)) {
    const candidatas = banco[tema] || questoes;
    if (!Array.isArray(candidatas) || candidatas.length < questoes.length ||
        questoes.some((q, i) => !candidatas[i] || conteudoQuestao(q) !== conteudoQuestao(candidatas[i]))) {
      erros.push(`append-only: prefixo do tema ${tema} foi alterado (n/q/a/c/e ou ordem)`);
    }
  }
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
const bancoFinal = appendOnly ? { ...bancoAtual, ...banco } : banco;
for (const tema of Object.keys(bancoFinal).sort()) ordenado[tema] = bancoFinal[tema];

// Mesmo estilo de formatação do balancear-quiz.mjs: uma alternativa por linha
// para o diff do git ficar legível.
const json = JSON.stringify(ordenado, null, 2).replace(/\n {6}/g, ' ').replace(/\n {4}\]/g, ']') + '\n';
const atual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';

const total = Object.values(ordenado).reduce((a, qs) => a + qs.length, 0);
if (json === atual) {
  console.log(`✔ ${AREA}/quiz.json já está em dia — ${Object.keys(ordenado).length} tema(s), ${total} questões.`);
} else {
  writeFileSync(DESTINO, json, 'utf8');
  console.log(`✔ ${AREA}/quiz.json escrito — ${Object.keys(ordenado).length} tema(s), ${total} questões${appendOnly ? ' (append-only)' : ''}.`);
  console.log(`  Rode "node balancear-quiz.mjs ${AREA}" e "node build-site.mjs".`);
}
