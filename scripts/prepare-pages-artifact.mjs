// Copia somente os arquivos estáticos necessários para servir o hub e as duas
// áreas. Conteúdo, quizzes e runtime já estão embutidos nos index.html gerados.
import { copyFileSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const PAGES_FILES = Object.freeze([
  'index.html',
  ...['urgencia-e-emergencia', 'cirurgia'].flatMap((area) => [
    `${area}/index.html`,
    `${area}/sw.js`,
    `${area}/manifest.webmanifest`,
    `${area}/icon-192.png`,
    `${area}/icon-512.png`,
    `${area}/apple-touch-icon-180.png`,
  ]),
]);

export function preparePagesArtifact(destination) {
  if (!destination) throw new Error('Informe a pasta de destino do Pages artifact.');
  const target = resolve(destination);
  mkdirSync(target, { recursive: true });
  if (readdirSync(target).length) throw new Error(`A pasta de destino não está vazia: ${target}`);

  for (const relative of PAGES_FILES) {
    const source = join(root, relative);
    if (!lstatSync(source).isFile()) throw new Error(`Arquivo estático obrigatório ausente ou inválido: ${relative}`);
    const output = join(target, relative);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(source, output);
  }
  return PAGES_FILES;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const files = preparePagesArtifact(process.argv[2]);
    console.log(`Pages artifact: ${files.length} arquivos estáticos allowlisted preparados.`);
  } catch (error) {
    console.error(`Falha ao preparar Pages artifact: ${error.message}`);
    process.exitCode = 1;
  }
}
