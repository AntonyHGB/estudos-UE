// Verifica allowlist, existência e referências locais do Pages artifact.
// Só copia artefatos temporários; não usa rede, Firebase, credenciais ou conteúdo do usuário.
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES_FILES, preparePagesArtifact } from '../scripts/prepare-pages-artifact.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tempBase = '/tmp/opencode';
mkdirSync(tempBase, { recursive: true });
const temp = mkdtempSync(join(tempBase, 'estudos-ue-pages-artifact-'));
const artifact = join(temp, 'site');

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    assert.ok(entry.isFile() || entry.isDirectory(), `tipo de arquivo não permitido: ${path}`);
    return entry.isDirectory() ? listFiles(path) : [relative(artifact, path).split('\\').join('/')];
  });
}

try {
  const prepared = preparePagesArtifact(artifact);
  assert.deepEqual(prepared, PAGES_FILES);
  const artifactFiles = listFiles(artifact);
  assert.deepEqual(artifactFiles.sort(), [...PAGES_FILES].sort(), 'artifact deve conter exatamente a allowlist');

  for (const file of PAGES_FILES) {
    assert.ok(lstatSync(join(artifact, file)).isFile(), `arquivo necessário ausente: ${file}`);
    assert.deepEqual(readFileSync(join(artifact, file)), readFileSync(join(root, file)), `bytes divergentes: ${file}`);
  }

  for (const forbidden of ['.git/', '.github/', '.playwright-mcp/', '__ee-tests/', 'testes/', 'scripts/', 'documentos-fontes/', '_fontes-extraidas/', '_quiz-fragmentos/', '_modelo-referencia/', 'firebase-config.json', 'quiz.json']) {
    assert.ok(!artifactFiles.some((path) => path === forbidden || path.startsWith(forbidden)), `arquivo fora do escopo: ${forbidden}`);
  }
  assert.ok(!artifactFiles.some((path) => path.endsWith('.md')), 'artifact não deve incluir Markdown/documentação');

  const occupied = join(temp, 'occupied');
  mkdirSync(occupied);
  writeFileSync(join(occupied, 'keep.txt'), 'preserve');
  assert.throws(() => preparePagesArtifact(occupied), /não está vazia/, 'não deve sobrescrever destino preexistente');
  assert.equal(readFileSync(join(occupied, 'keep.txt'), 'utf8'), 'preserve');

  const hub = readFileSync(join(artifact, 'index.html'), 'utf8');
  for (const area of ['urgencia-e-emergencia', 'cirurgia']) {
    assert.ok(hub.includes(`href="./${area}/"`), `hub não aponta para ${area}`);
    const html = readFileSync(join(artifact, area, 'index.html'), 'utf8');
    const manifestLink = html.match(/<link\s+rel="manifest"\s+href="([^"]+)"/);
    assert.ok(manifestLink, `${area}: link para manifest ausente`);
    assert.ok(PAGES_FILES.includes(`${area}/${manifestLink[1]}`), `${area}: manifest não está no artifact`);

    const assetTags = [...html.matchAll(/<(?:link|script|img|source|audio|video)\b[^>]*>/g)].map(([tag]) => tag);
    for (const tag of assetTags) {
      for (const attribute of ['href', 'src', 'poster']) {
        const reference = tag.match(new RegExp(`\\b${attribute}="([^"]+)"`))?.[1];
        if (reference && !/^(?:[a-z]+:|#|\/\/)/i.test(reference)) {
          assert.ok(PAGES_FILES.includes(`${area}/${reference}`), `${area}: recurso local referenciado não está allowlisted: ${reference}`);
        }
      }
    }

    const manifest = JSON.parse(readFileSync(join(artifact, area, 'manifest.webmanifest'), 'utf8'));
    for (const icon of manifest.icons) {
      assert.ok(PAGES_FILES.includes(`${area}/${icon.src.replace(/^\.\//, '')}`), `${area}: ícone do manifest não foi incluído`);
    }
    const sw = readFileSync(join(artifact, area, 'sw.js'), 'utf8');
    const precache = sw.match(/const ASSETS = (\[[^\]]+\]);/);
    assert.ok(precache, `${area}: lista de precache do service worker ausente`);
    const assets = [...precache[1].matchAll(/['"]([^'"]+)['"]/g)].map(([, path]) => path);
    for (const path of assets) {
      const relativePath = path === './' ? 'index.html' : path.replace(/^\.\//, '');
      assert.ok(PAGES_FILES.includes(`${area}/${relativePath}`), `${area}: asset do service worker ausente: ${path}`);
    }
  }

  assert.equal(PAGES_FILES.length, 13);
  console.log(`pages-artifact: ${PAGES_FILES.length} arquivos allowlisted; runtime assets válidos; sem fontes, scripts, testes, Markdown, bancos avulsos ou .git — PASS`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
