// balancear-quiz.mjs — redistribui a POSIÇÃO da alternativa correta nos quiz.json.
//
// Uso: node balancear-quiz.mjs [--novas] area [area...]
//
// Por que existe: escrevendo as questões é natural deixar a correta sempre na
// mesma posição, e aí dá para gabaritar o quiz marcando sempre a mesma letra.
// Este script troca a correta de lugar com a alternativa que ocupa uma posição
// alvo. O padrão base usa cada posição duas vezes a cada oito questões (25% por
// letra) e é ROTACIONADO por área e tema: sem isso, "Q1 = A" valeria para todos
// os temas e o gabarito voltaria a ser previsível entre temas.
//
// É troca de pares: nenhum texto de enunciado, alternativa ou explicação muda.
//
// ATENÇÃO: o script aborta se alguma explicação citar alternativa por letra
// ("a opção B..."), porque embaralhar deixaria o texto mentindo. Nesse caso,
// reescreva a explicação para citar o CONTEÚDO da alternativa.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Duas ocorrências de cada posição a cada 8 questões = 25% por letra.
const PADRAO = [0, 2, 3, 1, 2, 0, 1, 3];

// Rotaciona o padrão de forma determinística por área + tema. A rotação
// preserva as duas ocorrências de cada posição, mas faz cada tema começar numa
// posição diferente (e ED/ML não compartilharem a mesma sequência).
function padraoDa(area, tema) {
  const seed = [...`${area}:${tema}`].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 17);
  const offset = seed % PADRAO.length;
  return PADRAO.map((_, i) => PADRAO[(i + offset) % PADRAO.length]);
}

// Pega "opção B", "alternativa C", "letra A", "a opção D)" e afins.
const CITA_LETRA =
  /\b(?:op(?:ç|c)(?:ã|a)o|op(?:ç|c)(?:õ|o)es|alternativas?|letras?|itens?|item)\s+["“(]?[A-E]\b/gi;

const args = process.argv.slice(2);
const novasApenas = args.includes('--novas');
const areas = args.filter((arg) => arg !== '--novas');
if (!areas.length || args.some((arg) => arg.startsWith('-') && arg !== '--novas')) {
  console.error('Uso: node balancear-quiz.mjs [--novas] <area> [area...]');
  process.exit(1);
}

let houveErro = false;
const resumo = [];
const writes = [];

function conteudoQuestao(q) {
  if (!q || typeof q.n !== 'string' || typeof q.q !== 'string' || !Array.isArray(q.a) ||
      q.a.length !== 4 || q.a.some((a) => typeof a !== 'string') ||
      !Number.isInteger(q.c) || q.c < 0 || q.c > 3 || typeof q.e !== 'string') return null;
  return JSON.stringify([q.n, q.q, q.a, q.c, q.e]);
}

for (const area of areas) {
  if (!area || area === '.' || area === '..' || /[/\\:]/.test(area)) {
    console.error(`✖ Área inválida: ${area}`);
    houveErro = true;
    continue;
  }
  const caminho = join(ROOT, area, 'quiz.json');
  if (!existsSync(caminho)) {
    console.error(`✖ ${area}: quiz.json não encontrado`);
    houveErro = true;
    continue;
  }

  const banco = JSON.parse(readFileSync(caminho, 'utf8'));

  let anteriores = {};
  if (novasApenas) {
    // HEAD é o banco publicado antes da montagem. Sem essa proveniência não há
    // como distinguir com segurança questões já balanceadas de questões novas.
    try {
      anteriores = JSON.parse(execFileSync('git', ['show', `HEAD:${area}/quiz.json`], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }));
    } catch (e) {
      console.error(`✖ ${area}: não foi possível ler HEAD:${area}/quiz.json; nada será escrito.`);
      houveErro = true;
      continue;
    }
    if (!anteriores || typeof anteriores !== 'object' || Array.isArray(anteriores) ||
        !banco || typeof banco !== 'object' || Array.isArray(banco)) {
      console.error(`✖ ${area}: banco atual ou publicado inválido; nada será escrito.`);
      houveErro = true;
      continue;
    }
    const temasAnteriores = Object.keys(anteriores).sort();
    const temasAtuais = Object.keys(banco).sort();
    const prefixoInvalido = temasAtuais.length < temasAnteriores.length ||
      temasAnteriores.some((tema, i) => temasAtuais[i] !== tema) ||
      temasAnteriores.some((tema) => !Array.isArray(anteriores[tema]) || !Array.isArray(banco[tema]) ||
        banco[tema].length < anteriores[tema].length ||
        anteriores[tema].some((q, i) => !conteudoQuestao(q) || !conteudoQuestao(banco[tema][i]) ||
          conteudoQuestao(q) !== conteudoQuestao(banco[tema][i])));
    if (prefixoInvalido) {
      console.error(`✖ ${area}: prefixo/ordem do banco diverge de HEAD; nenhuma área será escrita.`);
      houveErro = true;
      continue;
    }
  }

  const bancoMalformado = Object.values(banco).some((questoes) =>
    !Array.isArray(questoes) || questoes.some((q) => !conteudoQuestao(q))
  );
  if (bancoMalformado) {
    console.error(`✖ ${area}: banco contém tema/questão inválida; nada será escrito.`);
    houveErro = true;
    continue;
  }

  // 1. Trava de segurança nas questões que serão alteradas.
  const citacoes = [];
  for (const [tema, questoes] of Object.entries(banco)) {
    questoes.forEach((q, i) => {
      const inicio = novasApenas ? (anteriores[tema] || []).length : 0;
      if (i < inicio) return;
      const achados = q.e.match(CITA_LETRA);
      if (achados) citacoes.push(`${area} tema ${tema} questão ${i + 1}: "${achados.join('", "')}"`);
    });
  }
  if (citacoes.length) {
    console.error(`\n✖ ABORTADO — ${citacoes.length} explicação(ões) citam alternativa por letra:\n`);
    citacoes.forEach((c) => console.error(`   ${c}`));
    console.error(
      '\n   Embaralhar as posições faria esse texto apontar para a alternativa errada.'
    );
    console.error('   Reescreva citando o conteúdo da alternativa, não a letra dela.\n');
    houveErro = true;
    continue;
  }

  // 2. Troca em pares: a correta vai para a posição alvo, e quem estava lá assume a antiga.
  let trocas = 0;
  for (const [tema, questoes] of Object.entries(banco)) {
    const padrao = padraoDa(area, tema);
    questoes.forEach((q, i) => {
      if (novasApenas && i < (anteriores[tema] || []).length) return;
      const alvo = padrao[i % padrao.length];
      if (alvo >= q.a.length) return; // questão com menos alternativas que o padrão exige
      if (q.c === alvo) return;
      const tmp = q.a[alvo];
      q.a[alvo] = q.a[q.c];
      q.a[q.c] = tmp;
      q.c = alvo;
      trocas++;
    });
  }

  if (novasApenas) {
    const mudouPrefixo = Object.entries(anteriores).some(([tema, questoes]) =>
      questoes.some((q, i) => conteudoQuestao(q) !== conteudoQuestao(banco[tema][i])));
    if (mudouPrefixo) {
      console.error(`✖ ${area}: prefixo publicado mudou; nada foi escrito.`);
      houveErro = true;
      continue;
    }
  }

  // Mantém uma alternativa por linha, para o diff do git ficar legível.
  const json = JSON.stringify(banco, null, 2).replace(/\n {6}/g, ' ').replace(/\n {4}\]/g, ']');
  const atualTexto = readFileSync(caminho, 'utf8');

  // 3. Confere a distribuição resultante.
  const letras = [0, 0, 0, 0, 0];
  let total = 0;
  for (const questoes of Object.values(banco)) {
    questoes.forEach((q) => {
      letras[q.c]++;
      total++;
    });
  }
  const dist = letras
    .slice(0, 4)
    .map((n, k) => `${'ABCD'[k]}=${((100 * n) / total).toFixed(0)}%`)
    .join('  ');
  resumo.push(`✔ ${area}: ${trocas} trocas em ${total} questões — ${dist}`);
  if (json + '\n' !== atualTexto) writes.push([caminho, json + '\n']);
}

if (houveErro) process.exit(1);
// Nenhuma escrita acontece até todas as áreas passarem pelo preflight.
for (const [caminho, conteudo] of writes) writeFileSync(caminho, conteudo, 'utf8');
resumo.forEach((r) => console.log(r));
console.log(`\nPosições balanceadas${novasApenas ? ' somente após os prefixos publicados de cada tema' : ''}. Rode "node build-site.mjs" para regerar o site.`);
