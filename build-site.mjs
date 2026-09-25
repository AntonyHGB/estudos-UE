// build-site.mjs — gera um site auto-contido para cada pasta de estudos.
// Uso: node build-site.mjs
//
// Saída por pasta:
//   index.html             página completa, auto-contida (funciona até por file://)
//   manifest.webmanifest   torna o site instalável na tela de início do celular
//   sw.js                  service worker: leitura offline após a primeira visita
//   icon-192.png / icon-512.png / apple-touch-icon-180.png
// Saída na raiz:
//   index.html             hub com links para as áreas cadastradas em SITES
//
// O index.html continua sendo o entregável autossuficiente: copiar só ele para o
// celular ainda funciona. Manifest, service worker e ícones são camada aditiva que
// só entra em ação sob http(s).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const SITES = [
  {
    folder: 'urgencia-e-emergencia',
    title: 'Urgência e Emergência',
    short: 'Urg. Emerg.',
    icon: 'med',
    emoji: '🚑',
    accent: '#dc2626',
    accentDark: '#fca5a5',
  },
];

const BG_LIGHT = '#f8fafc';
const BG_DARK = '#0b1120';

/* ================================ configuração pública do Firebase ================================
   O progresso na nuvem é opcional. Ele só existe quando há um
   `firebase-config.json` na raiz com a configuração PÚBLICA do app web
   (apiKey, projectId, etc.). Isso NÃO é segredo: a segurança vem das regras
   do Firestore (ver firestore.rules) e da aprovação manual do admin, nunca de
   esconder esses campos. Chaves de administrador (service account, private_key,
   client_email...) são recusadas explicitamente para não vazarem no HTML. */
const FIREBASE_SDK_VERSION = '12.19.0';
const FIREBASE_PUBLIC_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
const FIREBASE_SECRET_HINTS = ['private_key', 'privatekey', 'client_email', 'clientemail', 'serviceaccount', 'service_account', 'refresh_token', 'refreshtoken'];

function carregarFirebaseConfig() {
  const p = join(ROOT, 'firebase-config.json');
  if (!existsSync(p)) return null;
  let raw;
  try {
    raw = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`firebase-config.json não é JSON válido — ${e.message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('firebase-config.json precisa ser um objeto com a config pública do app web.');
  }
  const suspeitas = Object.keys(raw).filter((k) =>
    FIREBASE_SECRET_HINTS.some((h) => k.toLowerCase().includes(h))
  );
  if (suspeitas.length) {
    throw new Error(
      `firebase-config.json parece conter credencial de administrador (${suspeitas.join(', ')}). ` +
        'Use SOMENTE a config pública do app web; nunca service account/private key/refresh token.'
    );
  }
  const cfg = {};
  for (const k of FIREBASE_PUBLIC_FIELDS) {
    if (typeof raw[k] === 'string' && raw[k].trim()) cfg[k] = raw[k].trim();
  }
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    throw new Error('firebase-config.json precisa de apiKey, projectId e appId.');
  }
  return cfg;
}

const firebaseConfig = carregarFirebaseConfig();

/* ================================ PNG (sem dependências) ================================ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

function encodePng(size, rgb) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filtro "none"
    rgb.copy(raw, y * stride + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Desenho por supersampling: rasteriza em 4x e reduz por média, o que dá
// antialiasing sem precisar de nenhuma biblioteca gráfica.
const SS = 4;

function makeCanvas(n, rgb) {
  const buf = Buffer.alloc(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    buf[i * 3] = rgb[0];
    buf[i * 3 + 1] = rgb[1];
    buf[i * 3 + 2] = rgb[2];
  }
  return buf;
}

function setPx(buf, n, x, y, c) {
  if (x < 0 || x >= n || y < 0 || y >= n) return;
  const o = (y * n + x) * 3;
  buf[o] = c[0];
  buf[o + 1] = c[1];
  buf[o + 2] = c[2];
}

function fillRect(buf, n, x, y, w, h, c) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(n, Math.round(x + w));
  const y1 = Math.min(n, Math.round(y + h));
  for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) setPx(buf, n, px, py, c);
}

function fillEllipse(buf, n, cx, cy, rx, ry, c) {
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(n - 1, Math.ceil(cy + ry));
  for (let py = y0; py <= y1; py++) {
    const dy = (py + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.max(0, Math.floor(cx - half));
    const x1 = Math.min(n - 1, Math.ceil(cx + half));
    for (let px = x0; px <= x1; px++) {
      const dx = (px + 0.5 - cx) / rx;
      if (dx * dx + dy * dy <= 1) setPx(buf, n, px, py, c);
    }
  }
}

function strokeLine(buf, n, x1, y1, x2, y2, w, c) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillEllipse(buf, n, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, w / 2, c);
  }
}

function downsample(hi, n, size) {
  const out = Buffer.alloc(size * size * 3);
  const f = n / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < f; sy++) {
        for (let sx = 0; sx < f; sx++) {
          const o = ((y * f + sy) * n + (x * f + sx)) * 3;
          r += hi[o]; g += hi[o + 1]; b += hi[o + 2];
        }
      }
      const cnt = f * f;
      const o = (y * size + x) * 3;
      out[o] = Math.round(r / cnt);
      out[o + 1] = Math.round(g / cnt);
      out[o + 2] = Math.round(b / cnt);
    }
  }
  return out;
}

// Cilindro de banco de dados — engenharia de dados.
function drawDatabase(buf, n, c) {
  const cx = n / 2;
  const rx = n * 0.21;
  const ry = n * 0.072;
  const top = n * 0.30;
  const bottom = n * 0.70;
  fillEllipse(buf, n, cx, bottom, rx, ry, c);
  fillRect(buf, n, cx - rx, top, rx * 2, bottom - top, c);
  fillEllipse(buf, n, cx, top, rx, ry, c);
  return { cx, rx, ry, top, bottom };
}

// Rede neural 3–2 — machine learning.
function drawNetwork(buf, n, c) {
  const r = n * 0.052;
  const lw = n * 0.026;
  const lx = n * 0.34;
  const rxp = n * 0.66;
  const left = [n * 0.30, n * 0.5, n * 0.70];
  const right = [n * 0.385, n * 0.615];
  for (const ly of left) for (const ry of right) strokeLine(buf, n, lx, ly, rxp, ry, lw, c);
  for (const ly of left) fillEllipse(buf, n, lx, ly, r, r, c);
  for (const ry of right) fillEllipse(buf, n, rxp, ry, r, r, c);
}

// Cruz médica — urgência e emergência.
function drawCross(buf, n, c) {
  const arm = n * 0.46; // comprimento dos braços
  const esp = n * 0.20; // espessura
  const cx = n / 2;
  const cy = n / 2;
  fillRect(buf, n, cx - esp / 2, cy - arm / 2, esp, arm, c);
  fillRect(buf, n, cx - arm / 2, cy - esp / 2, arm, esp, c);
}

// Ícone: fundo sólido na cor do tema + marca branca, com margem folgada para
// sobreviver ao recorte "maskable" do Android.
function makeIcon(size, bgHex, kind) {
  const n = size * SS;
  const bg = hexToRgb(bgHex);
  const white = [255, 255, 255];
  const hi = makeCanvas(n, bg);
  if (kind === 'db') {
    const d = drawDatabase(hi, n, white);
    // Cada junta é o arco inferior de uma elipse: pinta a elipse na cor do fundo
    // e cobre de volta com a mesma elipse deslocada para cima, sobrando só a curva.
    // De baixo para cima: senão a elipse de cobertura da junta inferior
    // apagaria parte do arco da junta de cima.
    const t = n * 0.022;
    for (const f of [0.68, 0.36]) {
      const jy = d.top + (d.bottom - d.top) * f;
      fillEllipse(hi, n, d.cx, jy, d.rx, d.ry, bg);
      fillEllipse(hi, n, d.cx, jy - t, d.rx, d.ry, white);
    }
  } else if (kind === 'med') {
    drawCross(hi, n, white);
  } else {
    drawNetwork(hi, n, white);
  }
  return encodePng(size, downsample(hi, n, size));
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* ================================ markdown → HTML ================================ */

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(md, linkMap) {
  let s = escapeHtml(md);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const mdMatch = href.match(/^([0-9]{2}-[^)#]*\.md)/);
    if (mdMatch && linkMap && linkMap[mdMatch[1]]) {
      return `<a href="#" class="topic-link" data-topic="${linkMap[mdMatch[1]]}">${text}</a>`;
    }
    if (href.endsWith('.md')) return `<span class="ref">${text}</span>`;
    return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(>—·])\*([^*\n]+)\*(?=[\s.,;:)!?»\u2014]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[+i])}</code>`);
  return s;
}

function mdToHtml(md, linkMap) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const isTableSep = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const text = h[2].trim();
      const id = 'h-' + text.toLowerCase().replace(/[^a-z0-9à-ú]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      out.push(`<h${lvl} id="${id}">${inline(text, linkMap)}</h${lvl}>`);
      i++;
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      let t = '<div class="table-wrap"><table><thead><tr>';
      t += header.map((c) => `<th>${inline(c, linkMap)}</th>`).join('');
      t += '</tr></thead><tbody>';
      for (const r of rows) t += '<tr>' + r.map((c) => `<td>${inline(c, linkMap)}</td>`).join('') + '</tr>';
      t += '</tbody></table></div>';
      out.push(t);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${mdToHtml(buf.join('\n'), linkMap)}</blockquote>`);
      continue;
    }

    const listStart = line.match(/^(\s*)([-*]|\d+\.)\s+/);
    if (listStart) {
      const ordered = /^\d+\./.test(listStart[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m) {
          items.push({ indent: m[1].length, text: m[3] });
          i++;
          while (
            i < lines.length &&
            /^\s+\S/.test(lines[i]) &&
            !lines[i].match(/^(\s*)([-*]|\d+\.)\s+/) &&
            !/^\s*$/.test(lines[i])
          ) {
            items[items.length - 1].text += ' ' + lines[i].trim();
            i++;
          }
        } else if (/^\s*$/.test(lines[i]) && i + 1 < lines.length && lines[i + 1].match(/^(\s*)([-*]|\d+\.)\s+/)) {
          i++;
        } else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      let html = `<${tag}>`;
      let k = 0;
      while (k < items.length) {
        const it = items[k];
        const cb = it.text.match(/^\[( |x)\]\s+(.*)$/);
        const body = cb ? `<span class="cb">${cb[1] === 'x' ? '☑' : '☐'}</span> ${inline(cb[2], linkMap)}` : inline(it.text, linkMap);
        const subs = [];
        let j = k + 1;
        while (j < items.length && items[j].indent > it.indent + 1) { subs.push(items[j]); j++; }
        if (subs.length) {
          html += `<li>${body}<ul>` + subs.map((s) => `<li>${inline(s.text, linkMap)}</li>`).join('') + '</ul></li>';
          k = j;
        } else {
          html += `<li>${body}</li>`;
          k++;
        }
      }
      html += `</${tag}>`;
      out.push(html);
      continue;
    }

    const buf = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*(---+)\s*$/.test(lines[i]) &&
      !lines[i].match(/^(\s*)([-*]|\d+\.)\s+/) &&
      !(lines[i].trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(buf.join(' '), linkMap)}</p>`);
  }
  return out.join('\n');
}

/* ================================ parsing dos tópicos ================================ */

function splitH2Sections(md) {
  const lines = md.split('\n');
  const sections = [];
  let current = null;
  const pre = [];
  let inCode = false;
  for (const line of lines) {
    if (/^```/.test(line)) inCode = !inCode;
    const m = !inCode && line.match(/^##\s+(.*)$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1].trim(), body: [] };
    } else if (current) current.body.push(line);
    else pre.push(line);
  }
  if (current) sections.push(current);
  return { pre: pre.join('\n'), sections: sections.map((s) => ({ title: s.title, body: s.body.join('\n') })) };
}

const LEVEL_RE = /(🟢|🟡|🔴)/;
const LEVEL_NAME = { '🟢': 'basico', '🟡': 'intermediario', '🔴': 'avancado' };

function isQuestionSection(title) {
  return /perguntas|cenários resolvidos|estudos de caso/i.test(title);
}

function parseQuestionSection(body) {
  const lines = body.split('\n');
  const cards = [];
  const intro = [];
  let current = null;
  let inCode = false;

  const flush = () => { if (current) { cards.push(current); current = null; } };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (/^```/.test(line)) inCode = !inCode;

    if (!inCode) {
      if (/^###\s+(🟢|🟡|🔴)\s+(Básico|Intermediário|Avançado)\s*$/.test(line)) continue;

      const h3 = line.match(/^###\s+(.*)$/);
      if (h3) {
        flush();
        const t = h3[1].replace(/^\d+\.\d+\s+/, '').trim();
        const lv = (t.match(LEVEL_RE) || [])[1] || null;
        current = { title: t, level: lv, body: [] };
        continue;
      }

      const bq = line.match(/^\*\*((🟢|🟡|🔴)[^*]+)\*\*\s*$/);
      if (bq) {
        flush();
        current = { title: bq[1].trim(), level: bq[2], body: [] };
        continue;
      }

      const quoted = line.match(/^\*\*("[^"]+"|“[^”]+”)\*\*\s*(.*)$/);
      if (quoted) {
        flush();
        current = { title: quoted[1].replace(/^["“]|["”]$/g, ''), level: null, body: quoted[2] ? [quoted[2]] : [] };
        continue;
      }

      if (/^\s*---+\s*$/.test(line)) { continue; }
    }

    if (current) current.body.push(line);
    else intro.push(line);
  }
  flush();
  return {
    intro: intro.join('\n').trim(),
    cards: cards.map((c) => ({ title: c.title, level: c.level, body: c.body.join('\n').trim() })),
  };
}

function parseTopic(md, linkMap) {
  const lines = md.split('\n');
  const titleLine = lines.find((l) => /^#\s+/.test(l)) || '# Sem título';
  const fullTitle = titleLine.replace(/^#\s+/, '').trim();
  const quote = [];
  for (const l of lines.slice(lines.indexOf(titleLine) + 1)) {
    if (/^>\s?/.test(l)) quote.push(l.replace(/^>\s?/, ''));
    else if (quote.length) break;
    else if (!/^\s*$/.test(l)) break;
  }
  const bodyMd = lines.slice(lines.indexOf(titleLine) + 1).join('\n');
  const { sections } = splitH2Sections(bodyMd);

  const studySections = [];
  let questions = { intro: '', cards: [] };

  for (const sec of sections) {
    if (isQuestionSection(sec.title)) {
      const parsed = parseQuestionSection(sec.body);
      questions.intro += (questions.intro ? '\n\n' : '') + parsed.intro;
      questions.cards.push(...parsed.cards);
    } else {
      studySections.push(sec);
    }
  }

  const secId = (t) => 'sec-' + t.toLowerCase().replace(/[^a-z0-9à-ú]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  const studyHtml = studySections
    .map((s) => `<section class="study-sec" id="${secId(s.title)}"><h2>${inline(s.title, linkMap)}</h2>${mdToHtml(s.body, linkMap)}</section>`)
    .join('\n');

  return {
    fullTitle,
    subtitle: quote[0] || '',
    studyHtml,
    toc: studySections.map((s) => ({ id: secId(s.title), title: s.title })),
    questionsIntroHtml: questions.intro ? mdToHtml(questions.intro, linkMap) : '',
    cards: questions.cards.map((c) => ({
      titleHtml: inline(c.title, linkMap),
      level: c.level,
      levelName: c.level ? LEVEL_NAME[c.level] : 'sem-nivel',
      bodyHtml: mdToHtml(c.body, linkMap),
    })),
  };
}

/* ================================ CSS compartilhado ================================ */

function buildCss(site) {
  return `
:root{
  color-scheme:light dark;
  --accent:${site.accent};
  --accent-soft:${site.accent}18;
  --bg:${BG_LIGHT}; --panel:#ffffff; --panel-raised:#ffffff; --panel-muted:#f1f5f9;
  --text:#0f172a; --muted:#64748b; --border:#dbe4ef; --code-bg:#eef2f7;
  --shadow:0 12px 34px rgba(15,23,42,.07); --shadow-sm:0 2px 8px rgba(15,23,42,.06);
  --green:#16a34a; --yellow:#ca8a04; --red:#dc2626;
  --bar:56px;
}
@media (prefers-color-scheme: dark){
  :root{
    --accent:${site.accentDark};
    --accent-soft:${site.accentDark}22;
    --bg:${BG_DARK}; --panel:#111a2e; --panel-raised:#151f36; --panel-muted:#0e1729;
    --text:#e6edf7; --muted:#9aa9bd; --border:#24314a; --code-bg:#1a2440;
    --shadow:0 14px 36px rgba(0,0,0,.24); --shadow-sm:0 2px 8px rgba(0,0,0,.2);
    --green:#4ade80; --yellow:#facc15; --red:#f87171;
  }
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,'Segoe UI',system-ui,-apple-system,sans-serif;background:
  radial-gradient(circle at 76% -10%,var(--accent-soft),transparent 34rem),var(--bg);color:var(--text);
  line-height:1.65;font-size:15.5px;overflow-x:hidden;-webkit-tap-highlight-color:transparent}
a{color:var(--accent)}
button,a{outline-offset:3px}
button:focus-visible,a:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 55%,transparent)}
code{background:var(--code-bg);padding:.12em .38em;border-radius:5px;font-size:.88em;
  font-family:'Cascadia Code','JetBrains Mono',Consolas,monospace;overflow-wrap:anywhere}
p,li,td,th,.qtext,.qt{overflow-wrap:break-word}
pre{background:var(--code-bg);padding:14px 16px;border-radius:10px;overflow-x:auto;border:1px solid var(--border)}
pre code{background:none;padding:0;font-size:.85em;line-height:1.5;overflow-wrap:normal}
blockquote{margin:0 0 1em;padding:.6em 1em;border-left:3px solid var(--accent);background:var(--accent-soft);
  border-radius:0 8px 8px 0;color:var(--muted)}
blockquote p{margin:.25em 0}
hr{border:none;border-top:1px solid var(--border);margin:1.6em 0}
h1,h2,h3,h4{line-height:1.3;scroll-margin-top:80px}
.table-wrap{overflow-x:auto;margin:1em 0;border:1px solid var(--border);border-radius:10px;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:.92em}
th,td{padding:8px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{background:var(--accent-soft);white-space:nowrap}
tr:last-child td{border-bottom:none}
.ref{color:var(--accent);font-weight:600}
.cb{color:var(--accent)}

.layout{display:flex;min-height:100vh}
aside{width:280px;flex-shrink:0;background:color-mix(in srgb,var(--panel) 94%,transparent);border-right:1px solid var(--border);
  position:sticky;top:0;height:100vh;height:100dvh;overflow-y:auto;padding:18px 14px;
  padding-bottom:max(18px,env(safe-area-inset-bottom));backdrop-filter:blur(18px)}
main{flex:1;min-width:0;padding:34px clamp(18px,4vw,58px) 88px;max-width:1120px;margin:0 auto}
.brand{display:flex;align-items:center;gap:10px;padding:6px 8px 16px;border-bottom:1px solid var(--border);margin-bottom:12px}
.brand .em{font-size:1.7em}
.brand h1{font-size:1.02em;margin:0;line-height:1.25}
.brand small{color:var(--muted);display:block;font-weight:400}
.nav-item{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;
  color:var(--text);text-decoration:none;font-size:.92em;margin:2px 0;min-height:40px}
.nav-item.active{background:var(--accent);color:#fff;font-weight:700;box-shadow:var(--shadow-sm)}
@media (prefers-color-scheme: dark){.nav-item.active{color:${BG_DARK}}}
.nav-item .num{font-weight:700;font-size:.82em;opacity:.65;width:20px;flex-shrink:0}
.nav-item .prog{margin-left:auto;font-size:.72em;opacity:.75;white-space:nowrap;text-align:right}
.nav-label{font-size:.72em;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);padding:14px 10px 4px}

.topbar{display:none}
.scrim{display:none;position:fixed;inset:0;z-index:29;background:rgba(0,0,0,.5);
  opacity:0;transition:opacity .18s;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.scrim.on{display:block;opacity:1}

.topic-head h1{font-size:1.55em;margin:.1em 0 .15em}
.topic-head .sub{color:var(--muted);margin:0 0 18px}
.tabs{display:flex;gap:8px;margin:18px 0 26px;border-bottom:1px solid var(--border);flex-wrap:wrap;
  position:sticky;top:0;z-index:12;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(14px)}
.tab{padding:11px 18px;cursor:pointer;border:none;background:none;font:inherit;font-weight:600;color:var(--muted);
  border-bottom:3px solid transparent;margin-bottom:-2px;min-height:44px}
.tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab .count{font-size:.8em;opacity:.7}

.toc{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:14px 18px;margin-bottom:22px;box-shadow:var(--shadow-sm)}
.toc b{font-size:.8em;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.toc a{display:block;padding:6px 0;text-decoration:none;font-size:.93em}
.study-sec{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:10px 28px 20px;
  margin-bottom:22px;box-shadow:var(--shadow)}
.study-sec>h2{border-bottom:2px solid var(--accent-soft);padding-bottom:.35em}

.q-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:20px}
.q-tools .spacer{flex:1}
.chip{border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:999px;
  padding:7px 15px;cursor:pointer;font:inherit;font-size:.85em;min-height:38px}
.chip.active{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
@media (prefers-color-scheme: dark){.chip.active{color:${BG_DARK}}}
.card{background:var(--panel);border:1px solid var(--border);border-left:4px solid var(--border);border-radius:12px;
  margin-bottom:16px;box-shadow:var(--shadow);overflow:hidden}
.card.l-basico{border-left-color:var(--green)}
.card.l-intermediario{border-left-color:var(--yellow)}
.card.l-avancado{border-left-color:var(--red)}
.card-q{width:100%;padding:15px 20px;cursor:pointer;display:flex;gap:12px;align-items:flex-start;
  border:0;background:transparent;color:inherit;font:inherit;text-align:left}
.card-q .qt{font-weight:600;flex:1}
.card-q .toggle{color:var(--muted);font-size:.82em;white-space:nowrap;padding-top:2px}
.card-a{display:none;padding:4px 22px 14px;border-top:1px dashed var(--border)}
.card.open .card-a{display:block}
.card-mark{display:flex;gap:8px;align-items:center;padding:10px 20px 14px;border-top:1px solid var(--border);
  flex-wrap:wrap;background:color-mix(in srgb, var(--panel) 70%, var(--bg))}
.card-mark span.lbl{font-size:.78em;color:var(--muted);margin-right:4px}
.mark-btn{border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:8px;
  padding:7px 12px;cursor:pointer;font-size:.85em;min-height:38px}
.mark-btn.sel-ok{background:var(--green);border-color:var(--green);color:#fff}
.mark-btn.sel-meh{background:var(--yellow);border-color:var(--yellow);color:#fff}
.mark-btn.sel-bad{background:var(--red);border-color:var(--red);color:#fff}
.q-intro{margin-bottom:18px;color:var(--muted)}
.empty{color:var(--muted);text-align:center;padding:40px 0;font-style:italic}

.quiz-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--border);
  border-radius:12px;padding:12px 18px;margin-bottom:22px;box-shadow:var(--shadow)}
.quiz-head .score{font-weight:700;font-size:1.05em}
.quiz-head .score .ok{color:var(--green)}
.quiz-head .detail{color:var(--muted);font-size:.85em;flex:1;min-width:180px}
.qz{background:var(--panel);border:1px solid var(--border);border-left:4px solid var(--border);border-radius:12px;
  margin-bottom:18px;box-shadow:var(--shadow);padding:16px 20px 14px}
.qz.l-basico{border-left-color:var(--green)}
.qz.l-intermediario{border-left-color:var(--yellow)}
.qz.l-avancado{border-left-color:var(--red)}
.qz .qnum{font-size:.75em;font-weight:700;color:var(--muted);letter-spacing:.05em}
.qz .qtext{font-weight:600;margin:4px 0 12px}
.alt{display:flex;width:100%;gap:11px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;margin:8px 0;
  cursor:pointer;align-items:flex-start;transition:border-color .1s,background .1s,transform .1s;min-height:44px;
  background:transparent;color:inherit;font:inherit;text-align:left}
.alt .letter{font-weight:700;color:var(--accent);flex-shrink:0}
.alt:active{border-color:var(--accent)}
.alt.locked{cursor:default}
.alt.correct{border-color:var(--green);background:color-mix(in srgb, var(--green) 14%, var(--panel))}
.alt.correct .letter{color:var(--green)}
.alt.wrong{border-color:var(--red);background:color-mix(in srgb, var(--red) 12%, var(--panel))}
.alt.wrong .letter{color:var(--red)}
.alt.dim{opacity:.55}
.qz-exp{margin-top:12px;padding:12px 16px;border-radius:10px;font-size:.94em;background:var(--accent-soft);border:1px solid var(--border)}
.qz-exp .verdict{font-weight:700;display:block;margin-bottom:4px}
.qz-exp .verdict.ok{color:var(--green)}
.qz-exp .verdict.nok{color:var(--red)}

.home-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;margin:20px 0 28px}
.home-card{display:block;background:var(--panel);border:1px solid var(--border);border-radius:15px;padding:17px 18px;cursor:pointer;
  box-shadow:var(--shadow-sm);transition:transform .12s,border-color .12s,box-shadow .12s;color:inherit;text-decoration:none}
.home-card .n{font-size:.78em;font-weight:700;color:var(--accent)}
.home-card .t{font-weight:600;margin:2px 0 6px}
.home-card .s{font-size:.83em;color:var(--muted)}
.home-card .qn{font-size:.76em;color:var(--muted);margin-top:8px}
.topic-progress{height:5px;background:var(--code-bg);border-radius:99px;overflow:hidden;margin-top:12px}
.topic-progress i{display:block;height:100%;background:var(--accent);border-radius:99px}
.readme{background:var(--panel);border:1px solid var(--border);border-radius:15px;padding:0 24px;box-shadow:var(--shadow-sm)}
.readme summary{cursor:pointer;padding:17px 0;font-weight:700;color:var(--text)}
.readme-body{padding:0 2px 20px;border-top:1px solid var(--border)}

/* painel de retomada: mostra a proxima decisao antes da grade de conteudo */
.resume{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(230px,.8fr);gap:14px;margin:22px 0 14px}
.resume-main{position:relative;overflow:hidden;background:linear-gradient(135deg,var(--panel-raised),var(--panel));
  border:1px solid color-mix(in srgb,var(--accent) 38%,var(--border));border-radius:18px;padding:22px 24px;box-shadow:var(--shadow)}
.resume-main:after{content:'';position:absolute;width:180px;height:180px;border-radius:50%;right:-80px;top:-105px;
  background:var(--accent-soft);pointer-events:none}
.eyebrow{font-size:.72em;text-transform:uppercase;letter-spacing:.11em;color:var(--accent);font-weight:800}
.resume-main h2{font-size:1.25em;margin:.25em 0 .3em;max-width:34rem}
.resume-main p{color:var(--muted);margin:0 0 14px;max-width:38rem}
.resume-actions{display:flex;gap:8px;flex-wrap:wrap}
.resume-actions .btn{margin:0;text-decoration:none;display:inline-flex;align-items:center}
.resume-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:14px;box-shadow:var(--shadow-sm)}
.stat b{display:block;font-size:1.22em;line-height:1.2;font-variant-numeric:tabular-nums}
.stat span{display:block;color:var(--muted);font-size:.75em;margin-top:4px}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-top:26px}
.section-head h2{font-size:1.05em;margin:0}.section-head span{color:var(--muted);font-size:.82em}
.topic-nav{display:flex;justify-content:space-between;gap:10px;margin-top:28px;padding-top:18px;border-top:1px solid var(--border)}
.topic-nav a{display:flex;flex-direction:column;max-width:48%;padding:10px 0;text-decoration:none}
.topic-nav a:last-child{text-align:right;margin-left:auto}.topic-nav small{color:var(--muted)}

.sync-box{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px 22px;
  margin-bottom:18px;box-shadow:var(--shadow)}
.sync-box h3{margin:.2em 0 .5em}
.sync-box p{color:var(--muted);font-size:.92em}
.sync-box textarea{width:100%;min-height:80px;font-family:'Cascadia Code',Consolas,monospace;font-size:.82em;
  padding:10px;border-radius:9px;border:1px solid var(--border);background:var(--code-bg);color:var(--text);resize:vertical}
.btn{border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:9px;padding:10px 18px;
  cursor:pointer;font:inherit;font-weight:600;min-height:44px;margin:6px 6px 0 0}
@media (prefers-color-scheme: dark){.btn{color:${BG_DARK}}}
.btn.ghost{background:var(--panel);color:var(--text);border-color:var(--border)}
.btn:disabled{opacity:.55;cursor:not-allowed}
.note{font-size:.85em;padding:10px 14px;border-radius:9px;margin-top:10px}
.note.ok{background:color-mix(in srgb, var(--green) 15%, var(--panel));border:1px solid var(--green)}
.note.err{background:color-mix(in srgb, var(--red) 12%, var(--panel));border:1px solid var(--red)}
.note.warn{background:color-mix(in srgb, var(--yellow) 14%, var(--panel));border:1px solid var(--yellow)}
.conta{display:flex;flex-direction:column;gap:10px;margin:10px 0}
.conta input{padding:12px 14px;border-radius:10px;border:1px solid var(--border);
  background:var(--panel);color:var(--text);font:inherit;font-size:1em;min-height:46px}
.tag{display:inline-block;font-size:.78em;font-weight:700;border-radius:999px;padding:3px 10px;
  margin:2px 6px 2px 0;border:1px solid var(--border);color:var(--muted)}
.tag.ok{border-color:var(--green);color:var(--green)}
.tag.warn{border-color:var(--yellow);color:var(--yellow)}
.tag.pend{border-color:var(--accent);color:var(--accent)}

/* desempenho por nível */
.perf{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px 20px;
  margin-bottom:18px;box-shadow:var(--shadow)}
.perf h3{margin:.1em 0 .7em;font-size:1em}
.perf-row{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:.9em}
.perf-row .lv{width:78px;flex-shrink:0}
.perf-row .bar{flex:1;height:9px;background:var(--code-bg);border-radius:99px;overflow:hidden;min-width:60px}
.perf-row .bar i{display:block;height:100%;border-radius:99px;background:var(--accent)}
.perf-row .bar i.hi{background:var(--green)}
.perf-row .bar i.mid{background:var(--yellow)}
.perf-row .bar i.lo{background:var(--red)}
.perf-row .val{width:74px;text-align:right;flex-shrink:0;color:var(--muted);font-variant-numeric:tabular-nums}
.perf .hint{color:var(--muted);font-size:.84em;margin:10px 0 0}
.mini-perf{font-size:.78em;color:var(--muted);margin-top:6px}

/* atalhos da home */
.acoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0 22px}
.acao{display:flex;flex-direction:column;gap:2px;background:var(--panel);border:1px solid var(--border);
  border-radius:12px;padding:13px 15px;cursor:pointer;box-shadow:var(--shadow);text-align:left;
  font:inherit;color:inherit;min-height:64px}
.acao b{font-size:.95em}
.acao span{font-size:.79em;color:var(--muted)}
.acao.destaque{border-color:var(--accent)}

/* busca */
.busca-campo{display:flex;gap:8px;margin-bottom:16px}
.busca-campo input{flex:1;padding:12px 14px;border-radius:10px;border:1px solid var(--border);
  background:var(--panel);color:var(--text);font:inherit;font-size:1em;min-height:46px}
.busca-campo input:focus{outline:2px solid var(--accent);outline-offset:-1px}
.hit{background:var(--panel);border:1px solid var(--border);border-radius:11px;padding:12px 16px;
  margin-bottom:10px;cursor:pointer;box-shadow:var(--shadow)}
.hit .onde{font-size:.74em;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);font-weight:700}
.hit .tit{font-weight:600;margin:3px 0}
.hit .trecho{font-size:.87em;color:var(--muted);line-height:1.5}
mark{background:var(--accent-soft);color:var(--text);font-weight:700;padding:0 2px;border-radius:3px}

/* simulado */
.seg{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.seg button{flex:1;min-width:96px;min-height:52px;border:1px solid var(--border);background:var(--panel);
  color:var(--text);border-radius:11px;cursor:pointer;font:inherit;font-weight:600}
.seg button.on{background:var(--accent);border-color:var(--accent);color:#fff}
@media (prefers-color-scheme: dark){.seg button.on{color:${BG_DARK}}}
.sim-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--panel);
  border:1px solid var(--border);border-radius:12px;padding:11px 16px;margin-bottom:16px;box-shadow:var(--shadow)}
.sim-top .cont{font-weight:700;font-variant-numeric:tabular-nums}
.sim-top .barra{flex:1;height:7px;background:var(--code-bg);border-radius:99px;overflow:hidden;min-width:80px}
.sim-top .barra i{display:block;height:100%;background:var(--accent);border-radius:99px}
.sim-nav{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
.sim-nav .btn{flex:1;min-width:120px}
.alt.escolhida{border-color:var(--accent);background:var(--accent-soft);font-weight:600}
.resultado{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px;
  margin-bottom:18px;box-shadow:var(--shadow);text-align:center}
.resultado .nota{font-size:2.5em;font-weight:800;line-height:1.1}
.resultado .sub{color:var(--muted)}

@media (hover:hover) and (pointer:fine){
  .nav-item:hover{background:var(--accent-soft)}
  .acao:hover{border-color:var(--accent)}
  .hit:hover{border-color:var(--accent)}
  .card-q:hover{background:var(--accent-soft)}
  .alt:hover{border-color:var(--accent);background:var(--accent-soft)}
  .alt.locked:hover{border-color:var(--border);background:none}
  .home-card:hover{transform:translateY(-2px);border-color:var(--accent);box-shadow:var(--shadow)}
  .alt:not(.locked):hover{transform:translateX(2px)}
}

@media (max-width: 860px){
  html{scroll-behavior:auto}
  h1,h2,h3,h4{scroll-margin-top:calc(var(--bar) + 8px)}
  .topbar{display:flex;position:sticky;top:0;z-index:20;align-items:center;gap:12px;height:var(--bar);
    padding:0 14px;background:color-mix(in srgb, var(--bg) 92%, transparent);
    -webkit-backdrop-filter:saturate(180%) blur(12px);backdrop-filter:saturate(180%) blur(12px);
    border-bottom:1px solid var(--border)}
  .topbar button{border:none;background:none;color:var(--text);font-size:1.5em;cursor:pointer;
    width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .topbar .tb-title{font-weight:700;font-size:.98em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .layout{display:block}
  aside{position:fixed;top:0;left:0;z-index:30;width:min(300px,86vw);transform:translateX(-100%);
    transition:transform .2s ease;border-right:1px solid var(--border)}
  aside.open{transform:none;box-shadow:0 0 40px rgba(0,0,0,.35)}
  main{padding:18px 16px 64px;max-width:none}
  body.locked{overflow:hidden}
  .study-sec{padding:6px 16px 14px;border-radius:12px}
  .qz{padding:14px 15px 12px}
  .card-q{padding:14px 15px}
  .card-a{padding:4px 15px 12px}
  .card-mark{padding:10px 15px 12px}
  .quiz-head{padding:12px 15px}
  .toc{padding:12px 16px}
  .readme{padding:6px 16px 14px}
  .sync-box{padding:16px}
  .chip,.mark-btn{min-height:44px;padding:10px 16px;font-size:.88em}
  .nav-item{min-height:44px;padding:11px 12px}
  .tabs{gap:2px;top:var(--bar);margin-top:12px}
  .tab{padding:11px 12px;font-size:.94em}
  .topic-head h1{font-size:1.3em}
  .home-grid{grid-template-columns:1fr}
  .resume{grid-template-columns:1fr}.resume-stats{grid-template-columns:repeat(4,1fr)}
  .stat{padding:10px}.stat b{font-size:1em}.stat span{font-size:.68em}
}
@media (max-width:560px){
  .resume-main{padding:19px 18px}.resume-stats{grid-template-columns:1fr 1fr}
  .section-head{align-items:flex-start;flex-direction:column}.topic-nav{font-size:.9em}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{transition:none!important}}
`;
}

/* ================================ auditoria do quiz ================================ */

// Um quiz só serve para autoavaliação se não der para gabaritar sem saber o
// assunto. A correta ser sempre a alternativa mais longa e cair sempre na mesma
// letra são os vazamentos clássicos — medidos aqui. Dentro da questão, o alvo do
// projeto é ~10% de diferença de comprimento entre a maior e a menor alternativa.
const DISPERSAO_AVISO = 0.15; // aviso acima disso, por questão
const DISPERSAO_ERRO = 0.30; // erro (build falha) acima disso
const MAIS_LONGA_AVISO = 0.35; // % de questões com a correta sendo a mais longa
const MAIS_LONGA_ERRO = 0.45; // acaso com 4 alternativas = 25%; não se exige "nunca"
const POR_LETRA_AVISO = 0.35; // concentração da letra da correta; acaso = 25%

function validarQuiz(folder, quizBank, idsMd){
  if (!quizBank || typeof quizBank !== 'object' || Array.isArray(quizBank))
    throw new Error(`${folder}: quiz inválido\n  - a raiz do quiz.json precisa ser um objeto { "NN": [questões] }`);
  const erros = [];
  const vistas = new Map();
  const repetidos = idsMd.filter((id, k) => idsMd.indexOf(id) !== k);
  if (repetidos.length) erros.push(`mais de um arquivo NN-*.md com o mesmo tema: ${[...new Set(repetidos)].join(', ')}`);
  const ids = Object.keys(quizBank);
  const semQuiz = idsMd.filter((id) => !ids.includes(id));
  const semTema = ids.filter((id) => !idsMd.includes(id));
  if (semQuiz.length) erros.push(`tema(s) com arquivo NN-*.md sem entrada no quiz.json: ${semQuiz.join(', ')}`);
  if (semTema.length) erros.push(`entrada(s) no quiz.json sem arquivo NN-*.md: ${semTema.join(', ')}`);
  for (const [tid, questoes] of Object.entries(quizBank)){
    if (!/^\d{2}$/.test(tid) || !Array.isArray(questoes)){
      erros.push(`${tid}: tema ou lista inválida`);
      continue;
    }
    if (!questoes.length){
      erros.push(`tema ${tid}: lista de questões vazia`);
      continue;
    }
    questoes.forEach((q,i) => {
      const ref = `tema ${tid} questão ${i + 1}`;
      if (!q || !['🟢','🟡','🔴'].includes(q.n)) erros.push(`${ref}: nível inválido`);
      if (!q || typeof q.q !== 'string' || !q.q.trim()) erros.push(`${ref}: enunciado vazio`);
      if (!q || !Array.isArray(q.a) || q.a.length !== 4 || q.a.some((a) => typeof a !== 'string' || !a.trim())) erros.push(`${ref}: precisa ter quatro alternativas não vazias`);
      if (!q || !Number.isInteger(q.c) || q.c < 0 || q.c > 3) erros.push(`${ref}: índice da correta inválido`);
      if (!q || typeof q.e !== 'string' || !q.e.trim()) erros.push(`${ref}: explicação vazia`);
      if (q && typeof q.q === 'string'){
        const chave = q.q.toLowerCase().replace(/\*|`|\s+/g,' ').trim();
        if (vistas.has(chave)) erros.push(`${ref}: enunciado duplicado de ${vistas.get(chave)}`);
        else vistas.set(chave, ref);
      }
    });
  }
  if (erros.length) throw new Error(`${folder}: quiz inválido\n  - ${erros.join('\n  - ')}`);
}

function auditarQuiz(folder, quizBank) {
  const semMarcacao = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '');
  const avisos = [];
  const erros = [];
  const letras = [0, 0, 0, 0, 0];
  let total = 0;
  let maisLonga = 0;

  for (const [tid, questoes] of Object.entries(quizBank)) {
    questoes.forEach((q, i) => {
      total++;
      letras[q.c]++;
      const tam = q.a.map((a) => semMarcacao(a).length);
      const maior = Math.max(...tam);
      const menor = Math.min(...tam);
      const correta = tam[q.c];
      const outras = tam.filter((_, k) => k !== q.c);
      const mediaOutras = outras.reduce((a, b) => a + b, 0) / outras.length;

      if (correta === maior) maisLonga++;

      const ref = `tema ${tid} questão ${i + 1}`;
      if (correta === maior && correta > mediaOutras * 1.3) {
        avisos.push(
          `${ref}: correta é a maior e passa ${(((correta / mediaOutras) - 1) * 100).toFixed(0)}% da média das outras`
        );
      }
      const dispersao = (maior - menor) / maior;
      if (dispersao > DISPERSAO_ERRO) {
        erros.push(
          `${ref}: diferença de comprimento entre alternativas de ${(dispersao * 100).toFixed(0)}% ` +
            `(${menor} a ${maior} caracteres; limite ${(DISPERSAO_ERRO * 100).toFixed(0)}%)`
        );
      } else if (dispersao > DISPERSAO_AVISO) {
        avisos.push(
          `${ref}: alternativas de ${menor} a ${maior} caracteres ` +
            `(diferença de ${(dispersao * 100).toFixed(0)}%; aviso acima de ${(DISPERSAO_AVISO * 100).toFixed(0)}%)`
        );
      }
    });
  }

  if (!total) return [];

  const pctLonga = maisLonga / total;
  const pctLetras = letras.map((n) => n / total);
  const piorLetra = Math.max(...pctLetras);
  const piorIndice = pctLetras.indexOf(piorLetra);

  if (pctLonga > MAIS_LONGA_ERRO) {
    erros.push(
      `correta é a mais longa em ${(pctLonga * 100).toFixed(0)}% das questões ` +
        `(limite ${(MAIS_LONGA_ERRO * 100).toFixed(0)}%)`
    );
  } else if (pctLonga > MAIS_LONGA_AVISO) {
    avisos.push(
      `correta é a mais longa em ${(pctLonga * 100).toFixed(0)}% das questões ` +
        `(aviso acima de ${(MAIS_LONGA_AVISO * 100).toFixed(0)}%)`
    );
  }
  if (piorLetra > POR_LETRA_AVISO) {
    avisos.push(
      `distribuição da correta concentrada em ${'ABCDE'[piorIndice]} ${(piorLetra * 100).toFixed(0)}% ` +
        `(aviso acima de ${(POR_LETRA_AVISO * 100).toFixed(0)}%) — rode "node balancear-quiz.mjs"`
    );
  }

  const dist = pctLetras
    .slice(0, 4)
    .map((p, k) => `${'ABCD'[k]} ${(p * 100).toFixed(0)}%`)
    .join(' · ');
  const statusLonga = pctLonga > MAIS_LONGA_ERRO ? '✖' : pctLonga > MAIS_LONGA_AVISO ? '⚠' : '✔';
  const okLetra = piorLetra <= POR_LETRA_AVISO;

  console.log(`  auditoria do quiz (${total} questões)`);
  console.log(
    `    ${statusLonga} correta é a mais longa: ${(pctLonga * 100).toFixed(0)}% ` +
      `(aviso > ${(MAIS_LONGA_AVISO * 100).toFixed(0)}%, erro > ${(MAIS_LONGA_ERRO * 100).toFixed(0)}%)`
  );
  console.log(
    `    ${okLetra ? '✔' : '⚠'} distribuição da correta: ${dist} ` +
      `(aviso > ${(POR_LETRA_AVISO * 100).toFixed(0)}% por letra)`
  );

  if (avisos.length) {
    console.log(`    ⚠ ${avisos.length} aviso(s) de balanceamento:`);
    avisos.slice(0, 10).forEach((a) => console.log(`       ${a}`));
    if (avisos.length > 10) console.log(`       ... e mais ${avisos.length - 10}`);
  }
  if (erros.length) {
    console.error(`    ✖ ${folder}: ${erros.length} erro(s) de balanceamento — reescreva as alternativas:`);
    erros.slice(0, 10).forEach((e) => console.error(`       ${e}`));
  }
  return erros;
}

/* ================================ site principal ================================ */

// Erros de balanceamento das alternativas acumulados entre áreas; se houver
// algum, o build termina com exit ≠ 0 (a auditoria não pode ser ignorada).
const errosAuditoria = [];

function buildSite(site) {
  const dir = join(ROOT, site.folder);
  const files = readdirSync(dir).filter((f) => /^\d{2}-.*\.md$/.test(f)).sort();

  const linkMap = {};
  for (const f of files) linkMap[f] = f.slice(0, 2);

  let quizBank = {};
  const quizPath = join(dir, 'quiz.json');
  if (existsSync(quizPath)) {
    try {
      quizBank = JSON.parse(readFileSync(quizPath, 'utf8'));
    } catch (e) {
      throw new Error(`${site.folder}: quiz.json não é JSON válido — ${e.message}`);
    }
  }
  const idsMd = files.map((f) => f.slice(0, 2));
  validarQuiz(site.folder, quizBank, idsMd);

  const topics = files.map((f) => {
    const md = readFileSync(join(dir, f), 'utf8');
    const t = parseTopic(md, linkMap);
    const id = f.slice(0, 2);
    const quiz = (quizBank[id] || []).map((q) => ({
      n: q.n || '🟡',
      levelName: LEVEL_NAME[q.n] || 'intermediario',
      q: inline(q.q, linkMap),
      a: q.a.map((alt) => inline(alt, linkMap)),
      c: q.c,
      e: inline(q.e, linkMap),
    }));
    return { id, file: f, quiz, ...t };
  });

  const readmeMd = readFileSync(join(dir, 'README.md'), 'utf8');
  const readmeHtml = mdToHtml(readmeMd.replace(/^#\s+.*$/m, ''), linkMap);

  const totalQuestions = topics.reduce((a, t) => a + t.cards.length, 0);
  const totalQuiz = topics.reduce((a, t) => a + t.quiz.length, 0);

  // Impressão digital do material: layout (temas e contagens) e conteúdo das
  // questões. Contagem igual com questão reescrita ainda muda a impressão, então
  // um código de progresso antigo deixa de bater e o import avisa em vez de
  // colar respostas antigas em questões novas.
  const layoutKey = topics.map((t) => `${t.id}:${t.cards.length}:${t.quiz.length}`).join('|');
  const contentKey = topics
    .map((t) => `${t.id}:` + t.quiz.map((q) => [q.n, q.q, q.a.join('~'), q.c, q.e].join('~')).join('§'))
    .join('|');
  const fingerprint = fnv1a(layoutKey) & 0xffff;
  const contentHash = fnv1a(contentKey) & 0xffff;

  const data = {
    siteKey: site.folder,
    title: site.title,
    short: site.short,
    emoji: site.emoji,
    fp: fingerprint,
    chash: contentHash,
    firebase: firebaseConfig,
    firebaseSdk: FIREBASE_SDK_VERSION,
    topics: topics.map((t) => ({
      id: t.id,
      fullTitle: t.fullTitle,
      shortTitle: t.fullTitle.replace(/^\d+\s*[—-]\s*/, ''),
      subtitle: t.subtitle,
      toc: t.toc,
      studyHtml: t.studyHtml,
      questionsIntroHtml: t.questionsIntroHtml,
      cards: t.cards,
      quiz: t.quiz,
    })),
  };

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${BG_LIGHT}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${BG_DARK}" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-title" content="${site.short}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<title>${site.emoji} ${site.title} — Estudos</title>
<style>${buildCss(site)}</style>
</head>
<body>
<header class="topbar">
  <button id="menuBtn" aria-label="Abrir menu de temas">☰</button>
  <span class="tb-title" id="tbTitle">${site.title}</span>
</header>
<div class="scrim" id="scrim"></div>
<div class="layout">
  <aside id="sidebar"></aside>
  <main id="main"></main>
</div>
<script id="site-data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
const DATA = JSON.parse(document.getElementById('site-data').textContent);
DATA.readmeHtml = READMEHTML;
const SKEY = 'estudos:' + DATA.siteKey;
const LETTERS = ['A','B','C','D','E'];

/* localStorage seguro: em modo privado do iOS o acesso pode lancar excecao,
   e sem esta guarda o site inteiro morreria com tela em branco. */
const LS = (function(){
  try {
    var t = '__probe__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return { ok: true, get: function(k){ return localStorage.getItem(k); },
             set: function(k,v){ try { localStorage.setItem(k, v); } catch(e){} },
             del: function(k){ try { localStorage.removeItem(k); } catch(e){} } };
  } catch (e) {
    var mem = {};
    return { ok: false, get: function(k){ return k in mem ? mem[k] : null; },
             set: function(k,v){ mem[k] = String(v); },
             del: function(k){ delete mem[k]; } };
  }
})();

if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch(e){} }

/* Carimbo de tempo por item. Permite mesclar o progresso de dois aparelhos sem
   que um sobrescreva o outro às cegas: na hora de sincronizar, a versão mais
   nova de cada marcação/resposta vence. Fica num único mapa para não poluir o
   localStorage com uma chave por item. */
function tsMap(){
  var raw = LS.get(SKEY + ':ts');
  if (!raw) return {};
  try { var o = JSON.parse(raw); return (o && typeof o === 'object') ? o : {}; } catch(e){ return {}; }
}
function tsSet(key, at){ var m = tsMap(); m[key] = at; LS.set(SKEY + ':ts', JSON.stringify(m)); }
function tsGet(key){ return +tsMap()[key] || 0; }

var ordemRevisao = LS.get(SKEY + ':ordem') === '1';
function toggleOrdem(){
  ordemRevisao = !ordemRevisao;
  LS.set(SKEY + ':ordem', ordemRevisao ? '1' : '0');
  renderHome();
}
function getMark(t, i){ return LS.get(SKEY + ':' + t + ':' + i) || ''; }
function setMarkRaw(t, i, v){ var k = SKEY + ':' + t + ':' + i; if (v) LS.set(k, v); else LS.del(k); }
function setMark(t, i, v){ setMarkRaw(t, i, v); tsSet('m:' + t + ':' + i, Date.now()); }
function getQuizAns(t, i){ var v = LS.get(SKEY + ':quiz:v3:' + t + ':' + i); return v === null ? null : +v; }
function setQuizAnsRaw(t, i, v){ LS.set(SKEY + ':quiz:v3:' + t + ':' + i, String(v)); }
function setQuizAns(t, i, v){ setQuizAnsRaw(t, i, v); tsSet('q:' + t + ':' + i, Date.now()); }
function clearQuiz(t){
  var top = DATA.topics.find(function(x){ return x.id === t; });
  if (top) top.quiz.forEach(function(_, i){ LS.del(SKEY + ':quiz:v3:' + t + ':' + i); tsSet('q:' + t + ':' + i, Date.now()); });
}
function topicProgress(t){
  var done = 0;
  t.cards.forEach(function(c, i){ if (getMark(t.id, i)) done++; });
  return { done: done, total: t.cards.length };
}
function quizProgress(t){
  var answered = 0, correct = 0;
  t.quiz.forEach(function(q, i){
    var a = getQuizAns(t.id, i);
    if (a !== null){ answered++; if (a === q.c) correct++; }
  });
  return { answered: answered, correct: correct, total: t.quiz.length };
}

/* ---------- desempenho por nivel ----------
   A media geral esconde o que importa: dar 90% no basico e 30% no avancado
   soma um numero confortavel que nao diz se voce esta pronto. */
var NIVEIS = ['🟢','🟡','🔴'];
var NOME_NIVEL = { '🟢':'Básico', '🟡':'Intermediário', '🔴':'Avançado' };

function statsNivel(topicoId){
  var acc = { '🟢':{ok:0,n:0,tot:0}, '🟡':{ok:0,n:0,tot:0}, '🔴':{ok:0,n:0,tot:0} };
  DATA.topics.forEach(function(t){
    if (topicoId && t.id !== topicoId) return;
    t.quiz.forEach(function(q, i){
      var nv = acc[q.n]; if (!nv) return;
      nv.tot++;
      var a = getQuizAns(t.id, i);
      if (a !== null){ nv.n++; if (a === q.c) nv.ok++; }
    });
  });
  return acc;
}
function barraPerf(st){
  var h = '';
  NIVEIS.forEach(function(nv){
    var s = st[nv];
    var pct = s.n ? Math.round(100 * s.ok / s.n) : 0;
    var cls = !s.n ? '' : pct >= 75 ? 'hi' : pct >= 50 ? 'mid' : 'lo';
    h += '<div class="perf-row"><span class="lv">' + nv + ' ' + NOME_NIVEL[nv] + '</span>' +
         '<span class="bar"><i class="' + cls + '" style="width:' + (s.n ? pct : 0) + '%"></i></span>' +
         '<span class="val">' + (s.n ? pct + '% (' + s.ok + '/' + s.n + ')' : '—') + '</span></div>';
  });
  return h;
}
function miniPerf(topicoId){
  var st = statsNivel(topicoId), partes = [];
  NIVEIS.forEach(function(nv){
    var s = st[nv];
    if (s.tot) partes.push(nv + ' ' + (s.n ? s.ok + '/' + s.n : '—'));
  });
  return partes.join(' · ');
}

/* ---------- o que precisa de revisao ---------- */
function quizErrados(){
  var out = [];
  DATA.topics.forEach(function(t){
    t.quiz.forEach(function(q, i){
      var a = getQuizAns(t.id, i);
      if (a !== null && a !== q.c) out.push({ t: t.id, i: i });
    });
  });
  return out;
}
function abertasRevisar(){
  var out = [];
  DATA.topics.forEach(function(t){
    t.cards.forEach(function(c, i){
      var m = getMark(t.id, i);
      if (m === 'meh' || m === 'bad') out.push({ t: t.id, i: i, m: m });
    });
  });
  return out;
}

/* ---------- repeticao espacada leve ----------
   Sem virar Anki: guarda quando o tema foi tocado pela ultima vez e usa o
   desempenho para decidir quem esta devendo revisao primeiro. */
function marcarRevisao(tid){ LS.set(SKEY + ':rev:' + tid, String(Date.now())); }
function infoRevisao(t){
  var ts = LS.get(SKEY + ':rev:' + t.id);
  var qp = quizProgress(t);
  var acc = qp.answered ? qp.correct / qp.answered : null;
  if (!ts) return { dias: null, acc: acc, devendo: qp.answered > 0, prio: qp.answered ? 5 : 0 };
  var dias = Math.floor((Date.now() - (+ts)) / 86400000);
  // Desempenho ruim encurta o intervalo: 70% ou menos pede revisao em 3 dias.
  var limite = acc === null ? 7 : acc <= 0.7 ? 3 : acc <= 0.9 ? 7 : 14;
  return { dias: dias, acc: acc, devendo: dias >= limite, prio: dias / limite };
}
function temasDevendo(){
  return DATA.topics.filter(function(t){ return t.quiz.length && infoRevisao(t).devendo; });
}
function textoRevisao(t){
  var r = infoRevisao(t);
  if (r.dias === null) return '';
  if (r.dias === 0) return 'revisado hoje';
  if (r.dias === 1) return 'revisado ontem';
  return 'há ' + r.dias + ' dias';
}

function resumoGeral(){
  var r = { total:0, feitos:0, quizTotal:0, quizRespondido:0, quizAcertos:0, temas:0 };
  DATA.topics.forEach(function(t){
    var tocado = false;
    r.quizTotal += t.quiz.length;
    t.quiz.forEach(function(q,i){
      var a = getQuizAns(t.id,i);
      if (a !== null){ r.quizRespondido++; tocado = true; if (a === q.c) r.quizAcertos++; }
    });
    t.cards.forEach(function(_,i){ r.total++; if (getMark(t.id,i)){ r.feitos++; tocado = true; } });
    if (tocado) r.temas++;
  });
  r.total += r.quizTotal;
  r.feitos += r.quizRespondido;
  return r;
}

function proximaAcao(){
  var pendentes = quizErrados().length + abertasRevisar().length;
  if (pendentes) return { href:'#revisar', titulo:'Revisar o que ainda não fixou', texto:pendentes + ' questão(ões) pedindo uma nova tentativa.', botao:'Abrir revisão' };
  var devendo = temasDevendo();
  if (devendo.length) return { href:'#topic/' + devendo[0].id + '/quiz', titulo:'Revisar ' + devendo[0].shortTitle, texto:'Este tema chegou à data de revisão espaçada.', botao:'Revisar agora' };
  var emAndamento = DATA.topics.find(function(t){
    var qp = quizProgress(t);
    var marcadas = t.cards.reduce(function(n,_,i){ return n + (getMark(t.id,i) ? 1 : 0); },0);
    var feitos = qp.answered + marcadas, total = t.quiz.length + t.cards.length;
    return feitos > 0 && feitos < total;
  });
  if (emAndamento){
    var qp = quizProgress(emAndamento);
    var aba = qp.answered < emAndamento.quiz.length ? '/quiz' : '/questoes';
    return { href:'#topic/' + emAndamento.id + aba, titulo:'Continuar ' + emAndamento.shortTitle, texto:'Você já começou este tema. Feche o ciclo antes de abrir outro.', botao:'Retomar tema ' + emAndamento.id };
  }
  var novo = DATA.topics.find(function(t){
    return !t.quiz.some(function(_,i){ return getQuizAns(t.id,i) !== null; }) &&
      !t.cards.some(function(_,i){ return !!getMark(t.id,i); });
  });
  if (novo) return { href:'#topic/' + novo.id, titulo:'Começar por ' + novo.shortTitle, texto:'Leia o resumo e tente explicar os conceitos antes de abrir as respostas.', botao:'Começar tema ' + novo.id };
  return { href:'#simulado', titulo:'Testar retenção sem contexto', texto:'Você percorreu o material. Agora misture os temas para medir domínio real.', botao:'Abrir simulado' };
}

/* ---------- navegacao lateral ---------- */
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('on');
  document.body.classList.remove('locked');
}
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('scrim').classList.add('on');
  document.body.classList.add('locked');
}
document.getElementById('menuBtn').addEventListener('click', function(){
  var open = document.getElementById('sidebar').classList.contains('open');
  if (open) closeSidebar(); else openSidebar();
});
document.getElementById('scrim').addEventListener('click', closeSidebar);
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeSidebar(); });

function renderSidebar(activeId){
  var el = document.getElementById('sidebar');
  var h = '<div class="brand"><span class="em">' + DATA.emoji + '</span><h1>' + DATA.title +
          '<small>material de estudo</small></h1></div>';
  h += '<a class="nav-item' + (activeId === 'home' ? ' active' : '') + '" href="#home"><span class="num">🏠</span> Início &amp; guia</a>';
  h += '<a class="nav-item' + (activeId === 'busca' ? ' active' : '') + '" href="#busca"><span class="num">🔎</span> Buscar</a>';
  h += '<div class="nav-label">Praticar</div>';
  h += '<a class="nav-item' + (activeId === 'simulado' ? ' active' : '') + '" href="#simulado"><span class="num">📝</span> Simulado</a>';
  var nRev = quizErrados().length + abertasRevisar().length;
  h += '<a class="nav-item' + (activeId === 'revisar' ? ' active' : '') + '" href="#revisar"><span class="num">🔁</span> Revisar erros' +
       '<span class="prog">' + (nRev ? nRev : '') + '</span></a>';
  h += '<a class="nav-item' + (activeId === 'nuvem' ? ' active' : '') + '" href="#nuvem"><span class="num">☁️</span> Progresso na nuvem</a>';
  h += '<div class="nav-label">Temas</div>';
  DATA.topics.forEach(function(t){
    var qp = quizProgress(t);
    var rev = infoRevisao(t);
    var badge = qp.total ? (qp.answered ? '🎯 ' + qp.correct + '/' + qp.answered : '🎯 ' + qp.total) : '';
    if (rev.devendo && qp.answered) badge = '⏰ ' + badge;
    h += '<a class="nav-item' + (activeId === t.id ? ' active' : '') + '" href="#topic/' + t.id + '">' +
         '<span class="num">' + t.id + '</span><span>' + t.shortTitle + '</span>' +
         '<span class="prog">' + badge + '</span></a>';
  });
  el.innerHTML = h;
  el.querySelectorAll('.nav-item').forEach(function(a){ a.addEventListener('click', closeSidebar); });
}

/* ---------- home ---------- */
function renderHome(){
  renderSidebar('home');
  document.getElementById('tbTitle').textContent = DATA.title;
  var totalQ = DATA.topics.reduce(function(a,t){ return a + t.cards.length; }, 0);
  var totalZ = DATA.topics.reduce(function(a,t){ return a + t.quiz.length; }, 0);
  var h = '<div class="topic-head"><h1>' + DATA.emoji + ' ' + DATA.title + '</h1>' +
          '<p class="sub">Aprenda, pratique e revise no ritmo certo — ' + DATA.topics.length + ' temas, ' + totalQ + ' questões abertas e ' + totalZ + ' de múltipla escolha.</p></div>';
  if (!LS.ok) h += '<div class="note err">⚠️ Este navegador está bloqueando o armazenamento local (modo privado?). O material funciona, mas o progresso não será salvo.</div>';

  var nRev = quizErrados().length + abertasRevisar().length;
  var devendo = temasDevendo();
  var resumo = resumoGeral();
  var prox = proximaAcao();
  var pctGeral = resumo.feitos ? Math.max(1, Math.round(100 * resumo.feitos / resumo.total)) : 0;
  var acuracia = resumo.quizRespondido ? Math.round(100 * resumo.quizAcertos / resumo.quizRespondido) + '%' : '—';
  h += '<section class="resume" aria-label="Resumo do estudo">' +
       '<div class="resume-main"><span class="eyebrow">Sua próxima ação</span><h2>' + prox.titulo + '</h2><p>' + prox.texto + '</p>' +
       '<div class="resume-actions"><a class="btn" href="' + prox.href + '">' + prox.botao + ' →</a>' +
       '<button class="btn ghost" onclick="location.hash=\\'#simulado\\';setTimeout(function(){simIniciar(10)},0)">Sessão rápida · 10 questões</button></div></div>' +
       '<div class="resume-stats">' +
       '<div class="stat"><b>' + pctGeral + '%</b><span>progresso geral</span></div>' +
       '<div class="stat"><b>' + resumo.temas + '/' + DATA.topics.length + '</b><span>temas iniciados</span></div>' +
       '<div class="stat"><b>' + acuracia + '</b><span>acerto no quiz</span></div>' +
       '<div class="stat"><b>' + nRev + '</b><span>para revisar</span></div>' +
       '</div></section>';
  h += '<div class="acoes">' +
       '<button class="acao destaque" onclick="location.hash=\\'#simulado\\'"><b>📝 Simulado completo</b>' +
       '<span>Temas misturados, sem gabarito até o fim</span></button>' +
       '<button class="acao" onclick="location.hash=\\'#revisar\\'"><b>🔁 Revisar erros</b>' +
       '<span>' + (nRev ? nRev + ' questões esperando' : 'Nada pendente') + '</span></button>' +
       '<button class="acao" onclick="location.hash=\\'#busca\\'"><b>🔎 Buscar</b>' +
       '<span>Encontre qualquer conceito ou questão</span></button>' +
       '</div>';

  var st = statsNivel(null);
  var respondidas = NIVEIS.reduce(function(a,nv){ return a + st[nv].n; }, 0);
  if (respondidas){
    h += '<div class="perf"><h3>Seu desempenho por nível</h3>' + barraPerf(st) +
         '<p class="hint">A média geral esconde o que decide: ir bem no básico e mal no avançado soma um número confortável que não diz se você está pronto.</p></div>';
  }

  if (ordemRevisao && devendo.length){
    h += '<div class="note ok" style="margin-bottom:14px">⏰ ' + devendo.length +
         ' tema(s) pedindo revisão aparecem primeiro.</div>';
  }

  var lista = DATA.topics.slice();
  if (ordemRevisao) lista.sort(function(a,b){ return infoRevisao(b).prio - infoRevisao(a).prio; });
  h += '<div class="q-tools" style="margin-bottom:10px">' +
       '<button class="chip' + (ordemRevisao ? ' active' : '') + '" onclick="toggleOrdem()">' +
       (ordemRevisao ? '⏰ Ordenado por revisão' : '⏰ Priorizar revisão') + '</button>' +
       (devendo.length ? '<span style="color:var(--muted);font-size:.85em;align-self:center">' + devendo.length + ' tema(s) devendo</span>' : '') +
       '</div>';

  h += '<div class="section-head"><h2>Trilha de temas</h2><span>Abra um tema para estudar, fazer quiz ou praticar respostas abertas.</span></div>';
  h += '<div class="home-grid">';
  lista.forEach(function(t){
    var qp = quizProgress(t);
    var rev = infoRevisao(t);
    var quando = textoRevisao(t);
    var marcadas = t.cards.reduce(function(n,_,i){ return n + (getMark(t.id,i) ? 1 : 0); },0);
    var pctTema = Math.round(100 * (qp.answered + marcadas) / Math.max(1,t.quiz.length + t.cards.length));
    h += '<a class="home-card" href="#topic/' + t.id + '">' +
         '<div class="n">TEMA ' + t.id + (rev.devendo && qp.answered ? ' · ⏰ revisar' : '') + '</div>' +
         '<div class="t">' + t.shortTitle + '</div>' +
         '<div class="s">' + t.subtitle + '</div>' +
         '<div class="qn">❓ ' + t.cards.length + ' abertas · 🎯 ' + t.quiz.length + ' quiz' +
         (qp.answered ? ' — ' + qp.correct + '/' + qp.answered + ' acertos' : '') +
         (quando ? ' · ' + quando : '') + '</div>' +
         (qp.answered ? '<div class="mini-perf">' + miniPerf(t.id) + '</div>' : '') +
         '<div class="topic-progress" aria-label="' + pctTema + '% concluído"><i style="width:' + pctTema + '%"></i></div>' +
         '</a>';
  });
  h += '</div>';
  h += '<details class="readme"><summary>Guia completo de estudo</summary><div class="readme-body">' + DATA.readmeHtml + '</div></details>';
  document.getElementById('main').innerHTML = h;
  bindTopicLinks();
  window.scrollTo(0,0);
}

/* ---------- progresso na nuvem (Firebase, opcional) ----------
   O estudo continua 100% local e offline. A nuvem é opt-in: só existe quando o
   mantenedor adiciona firebase-config.json e o usuário entra com conta aprovada
   pelo admin. Sem config, sem internet ou offline, nada aqui derruba o material:
   o painel só explica o estado. O SDK é carregado sob demanda; se o CDN falhar,
   degradamos para o modo local. */
var CLOUD_SCHEMA = 1;
var FB = { loaded:false, error:'', auth:null, firestore:null, authM:null, fs:null };
var CLOUD_USER = null;
var CLOUD_APROVACAO = 'unknown';
var CLOUD_MSG = null;
var CLOUD_ULTIMO_RESUMO = null;
var CLOUD_BOOT = false;
/* Cooldown do reenvio de verificação: evita confundir o usuário com envios
   repetidos (e ajuda quando o próprio Firebase responde auth/too-many-requests,
   que é limite do servidor, não do botão). */
var CLOUD_REENVIO_ATE = 0;
var CLOUD_REENVIO_TIMER = null;
var CLOUD_REENVIO_COOLDOWN_MS = 60000;

function fbConfigurado(){ return !!(DATA.firebase && DATA.firebase.apiKey && DATA.firebase.projectId && DATA.firebase.appId); }

async function fbCarregar(){
  if (FB.loaded) return true;
  if (!fbConfigurado()) return false;
  if (FB.error) return false;
  var base = 'https://www.gstatic.com/firebasejs/' + (DATA.firebaseSdk || '12.19.0') + '/';
  try {
    var appM = await import(base + 'firebase-app.js');
    var authM = await import(base + 'firebase-auth.js');
    var fsM = await import(base + 'firebase-firestore.js');
    var app = appM.initializeApp(DATA.firebase);
    FB.authM = authM; FB.fs = fsM;
    FB.auth = authM.getAuth(app);
    FB.firestore = fsM.getFirestore(app);
    FB.loaded = true;
    return true;
  } catch(e){
    FB.error = (typeof navigator !== 'undefined' && navigator.onLine === false)
      ? 'Sem conexão agora. A nuvem precisa de internet; o estudo offline continua normal.'
      : 'Não consegui carregar o Firebase (config, rede ou CDN). O estudo offline continua normal.';
    return false;
  }
}

function authErro(e){
  var c = (e && e.code) || '';
  var mapa = {
    'auth/email-already-in-use':'Este e-mail já tem conta. Use "Entrar".',
    'auth/invalid-email':'E-mail inválido.',
    'auth/weak-password':'Senha fraca: use ao menos 6 caracteres.',
    'auth/missing-password':'Digite a senha.',
    'auth/wrong-password':'Senha incorreta.',
    'auth/user-not-found':'Conta não encontrada. Crie uma.',
    'auth/invalid-credential':'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials':'E-mail ou senha incorretos.',
    'auth/too-many-requests':'Muitas tentativas. Aguarde um pouco.',
    'auth/network-request-failed':'Falha de rede. Confira a conexão.',
    'auth/operation-not-allowed':'O login por e-mail/senha está desativado no projeto Firebase.',
    'auth/user-disabled':'Esta conta foi desativada.'
  };
  return mapa[c] || ('Falha de autenticação' + (c ? ' (' + c + ')' : '') + '.');
}
/* Erros de sendEmailVerification. Mostra o código quando não há tradução pronta:
   é o que permite diagnosticar template/quota/domínio no console do Firebase sem
   vazar e-mail nem credencial. */
function verifErro(e){
  var c = (e && e.code) || '';
  var mapa = {
    'auth/too-many-requests':'Muitos envios seguidos. O Firebase bloqueia temporariamente os próximos; aguarde alguns minutos',
    'auth/network-request-failed':'Falha de rede ao enviar. Confira a conexão e tente "Reenviar"',
    'auth/user-token-expired':'Sessão expirada. Saia e entre de novo antes de reenviar',
    'auth/unauthorized-continue-uri':'Este domínio não está autorizado no Firebase (Authentication → Settings → Authorized domains)',
    'auth/missing-continue-uri':'O projeto Firebase está sem URL de continuação configurada para o e-mail',
    'auth/invalid-continue-uri':'A URL de continuação do e-mail é inválida no projeto Firebase'
  };
  var base = mapa[c] || 'Não consegui enviar o e-mail de verificação';
  return base + (c ? ' — código: ' + c : '') + '.';
}
/* Tenta enviar o e-mail de verificação e devolve {ok, erro}. Aplica cooldown
   local para não repetir em sequência; o cooldown NÃO é acionado quando o
   envio falha por rede, para o usuário poder tentar de novo logo. */
async function enviarVerificacao(user){
  var rest = reenvioRestante();
  if (rest > 0) return { ok:false, erro:'Aguarde ' + rest + 's antes de reenviar o e-mail.' };
  try {
    await FB.authM.sendEmailVerification(user);
    CLOUD_REENVIO_ATE = Date.now() + CLOUD_REENVIO_COOLDOWN_MS;
    agendarRedrawCooldown(CLOUD_REENVIO_COOLDOWN_MS);
    return { ok:true };
  } catch(e){
    var c = (e && e.code) || '';
    if (c === 'auth/too-many-requests'){
      CLOUD_REENVIO_ATE = Date.now() + CLOUD_REENVIO_COOLDOWN_MS;
      agendarRedrawCooldown(CLOUD_REENVIO_COOLDOWN_MS);
    }
    return { ok:false, erro: verifErro(e) };
  }
}
function reenvioRestante(){
  var ms = CLOUD_REENVIO_ATE - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}
/* Redesenha a tela quando o cooldown termina para o botão voltar a ficar ativo.
   Chamar .unref() evita segurar o processo Node nos testes. */
function agendarRedrawCooldown(ms){
  if (CLOUD_REENVIO_TIMER || typeof setTimeout !== 'function') return;
  CLOUD_REENVIO_TIMER = setTimeout(function(){
    CLOUD_REENVIO_TIMER = null;
    nuvemRedraw();
  }, ms + 50);
  if (CLOUD_REENVIO_TIMER && typeof CLOUD_REENVIO_TIMER.unref === 'function') CLOUD_REENVIO_TIMER.unref();
}
function fbErro(e){
  var c = (e && e.code) || '';
  if (c === 'permission-denied') return 'permissão negada pelas regras (conta aprovada e e-mail verificado?).';
  if (c === 'unavailable') return 'sem conexão com o Firestore.';
  if (c === 'failed-precondition') return 'Firestore indisponível ou mal configurado.';
  if (c === 'not-found') return 'documento não encontrado.';
  if (c === 'resource-exhausted' || c === 'deadline-exceeded') return 'limite/tempo excedido.';
  return c || 'erro de rede.';
}

async function nuvemAtualizarEstado(){
  CLOUD_USER = (FB.loaded && FB.auth && FB.auth.currentUser) ? FB.auth.currentUser : null;
  CLOUD_APROVACAO = 'unknown';
  if (!CLOUD_USER) return;
  if (!CLOUD_USER.emailVerified){
    try { await CLOUD_USER.reload(); } catch(e){}
    if (!CLOUD_USER.emailVerified){ CLOUD_APROVACAO = 'nao-verificado'; return; }
  }
  CLOUD_APROVACAO = 'carregando';
  try {
    await CLOUD_USER.getIdToken(true);
    var snap = await FB.fs.getDoc(FB.fs.doc(FB.firestore, 'acessos', CLOUD_USER.uid));
    CLOUD_APROVACAO = (snap.exists() && snap.data().aprovado === true) ? 'aprovado' : 'pendente';
  } catch(e){
    var c = (e && e.code) || '';
    if (c === 'permission-denied') CLOUD_APROVACAO = 'pendente';
    else if (c === 'unavailable' || c === 'failed-precondition') CLOUD_APROVACAO = 'offline';
    else CLOUD_APROVACAO = 'erro';
  }
}

function nuvemRedraw(){ if (location.hash === '#nuvem') renderNuvem(); }
function nuvemAgendarBoot(){
  if (!fbConfigurado() || CLOUD_BOOT) return;
  CLOUD_BOOT = true;
  nuvemBoot();
}
async function nuvemBoot(){
  if (!await fbCarregar()){ nuvemRedraw(); return; }
  FB.authM.onAuthStateChanged(FB.auth, async function(){
    await nuvemAtualizarEstado();
    nuvemRedraw();
  });
  await nuvemAtualizarEstado();
  nuvemRedraw();
}
function nuvemRetentar(){
  FB.error = ''; CLOUD_BOOT = false; CLOUD_MSG = { t:'info', m:'Recarregando a nuvem…' };
  nuvemRedraw(); nuvemAgendarBoot();
}

async function nuvemEntrar(){
  var email = (document.getElementById('nvEmail').value || '').trim();
  var senha = document.getElementById('nvSenha').value || '';
  if (!email || !senha){ CLOUD_MSG = { t:'err', m:'Preencha e-mail e senha.' }; nuvemRedraw(); return; }
  CLOUD_MSG = { t:'info', m:'Entrando…' }; nuvemRedraw();
  if (!await fbCarregar()){ CLOUD_MSG = { t:'err', m:FB.error || 'Nuvem indisponível.' }; nuvemRedraw(); return; }
  try {
    await FB.authM.signInWithEmailAndPassword(FB.auth, email, senha);
    CLOUD_MSG = { t:'ok', m:'Sessão iniciada.' };
  } catch(e){ CLOUD_MSG = { t:'err', m:authErro(e) }; }
  await nuvemAtualizarEstado();
  nuvemRedraw();
}
async function nuvemRegistrar(){
  var email = (document.getElementById('nvEmail').value || '').trim();
  var senha = document.getElementById('nvSenha').value || '';
  if (!email || !senha){ CLOUD_MSG = { t:'err', m:'Preencha e-mail e senha.' }; nuvemRedraw(); return; }
  CLOUD_MSG = { t:'info', m:'Criando conta…' }; nuvemRedraw();
  if (!await fbCarregar()){ CLOUD_MSG = { t:'err', m:FB.error || 'Nuvem indisponível.' }; nuvemRedraw(); return; }
  try {
    var r = await FB.authM.createUserWithEmailAndPassword(FB.auth, email, senha);
    var envio = await enviarVerificacao(r.user);
    CLOUD_MSG = envio.ok
      ? { t:'ok', m:'Conta criada. Enviei um e-mail de verificação; confirme para o admin aprovar o acesso.' }
      : { t:'warn', m:'Conta criada, mas o e-mail de verificação não saiu: ' + envio.erro + ' Você pode usar "Reenviar e-mail de verificação".' };
  } catch(e){ CLOUD_MSG = { t:'err', m:authErro(e) }; }
  await nuvemAtualizarEstado();
  nuvemRedraw();
}
async function nuvemSair(){
  if (FB.loaded && FB.authM && FB.auth){ try { await FB.authM.signOut(FB.auth); } catch(e){} }
  CLOUD_USER = null; CLOUD_APROVACAO = 'unknown';
  CLOUD_MSG = { t:'info', m:'Você saiu. O progresso local continua neste navegador.' };
  nuvemRedraw();
}
async function nuvemReenviar(){
  if (!FB.loaded || !FB.auth || !FB.auth.currentUser) return;
  var envio = await enviarVerificacao(FB.auth.currentUser);
  CLOUD_MSG = envio.ok
    ? { t:'ok', m:'E-mail de verificação reenviado. Confira a caixa de entrada e o spam.' }
    : { t:'warn', m: envio.erro };
  nuvemRedraw();
}
async function nuvemVerificar(){
  await nuvemAtualizarEstado();
  CLOUD_MSG = { t:'info', m: CLOUD_APROVACAO === 'aprovado' ? 'E-mail verificado e conta aprovada.' : (CLOUD_APROVACAO === 'nao-verificado' ? 'Ainda não consta como verificado. Abra o link do e-mail e tente de novo.' : 'Verificação atualizada.') };
  nuvemRedraw();
}

/* --- progresso: snapshot local, mesclagem e aplicação (funções puras) --- */
function localProgress(){
  var marks = {}, quiz = {}, rev = {};
  DATA.topics.forEach(function(t){
    t.cards.forEach(function(_, i){
      var k = t.id + ':' + i, v = getMark(t.id, i), at = tsGet('m:' + k);
      if (v) marks[k] = { v:v, at:at };
      else if (at) marks[k] = { v:'', at:at }; // tombstone: item limpo de propósito
    });
    t.quiz.forEach(function(_, i){
      var k = t.id + ':' + i, a = getQuizAns(t.id, i), at = tsGet('q:' + k);
      if (a !== null) quiz[k] = { v:a, at:at };
      else if (at) quiz[k] = { v:-1, at:at };
    });
    var r = LS.get(SKEY + ':rev:' + t.id);
    if (r) rev[t.id] = +r;
  });
  return { v:CLOUD_SCHEMA, fp:DATA.fp, chash:DATA.chash, updatedAt:0, marks:marks, quiz:quiz, rev:rev };
}
function mergeEntryMap(local, cloud){
  var out = {}, vistos = {};
  function put(k){
    if (vistos[k]) return; vistos[k] = 1;
    var a = local && local[k], b = cloud && cloud[k];
    if (!a) out[k] = b;
    else if (!b) out[k] = a;
    else out[k] = (+b.at || 0) > (+a.at || 0) ? b : a; // empate: prefere o local
  }
  if (local) Object.keys(local).forEach(put);
  if (cloud) Object.keys(cloud).forEach(put);
  return out;
}
function mergeRev(local, cloud){
  var out = {}, vistos = {};
  function put(k){ if (vistos[k]) return; vistos[k] = 1; out[k] = Math.max(+((local||{})[k]) || 0, +((cloud||{})[k]) || 0); }
  Object.keys(local || {}).forEach(put);
  Object.keys(cloud || {}).forEach(put);
  return out;
}
function mergeProgress(local, cloud){
  return {
    v: CLOUD_SCHEMA, fp: DATA.fp, chash: DATA.chash,
    updatedAt: Math.max(+(local && local.updatedAt) || 0, +(cloud && cloud.updatedAt) || 0),
    marks: mergeEntryMap(local && local.marks, cloud && cloud.marks),
    quiz: mergeEntryMap(local && local.quiz, cloud && cloud.quiz),
    rev: mergeRev(local && local.rev, cloud && cloud.rev)
  };
}
function normalizarNuvem(raw){
  if (!raw || typeof raw !== 'object') return null;
  var out = { v: CLOUD_SCHEMA, fp: raw.fp, chash: raw.chash, updatedAt: +raw.updatedAt || 0, marks: {}, quiz: {}, rev: {} };
  if (raw.marks && typeof raw.marks === 'object') Object.keys(raw.marks).forEach(function(k){
    var e = raw.marks[k]; if (e && typeof e.v === 'string') out.marks[k] = { v:e.v, at:+e.at || 0 };
  });
  if (raw.quiz && typeof raw.quiz === 'object') Object.keys(raw.quiz).forEach(function(k){
    var e = raw.quiz[k]; if (e && typeof e.v === 'number') out.quiz[k] = { v:e.v, at:+e.at || 0 };
  });
  if (raw.rev && typeof raw.rev === 'object') Object.keys(raw.rev).forEach(function(k){
    var n = +raw.rev[k]; if (n) out.rev[k] = n;
  });
  return out;
}
function aplicarProgressoNuvem(p){
  Object.keys(p.marks || {}).forEach(function(k){
    var e = p.marks[k], c = k.split(':'), tid = c[0], idx = +c[1];
    var t = DATA.topics.find(function(x){ return x.id === tid; });
    if (!t || !(idx >= 0) || idx >= t.cards.length) return;
    if (e.v) setMarkRaw(tid, idx, e.v); else LS.del(SKEY + ':' + tid + ':' + idx);
    tsSet('m:' + k, +e.at || 0);
  });
  Object.keys(p.quiz || {}).forEach(function(k){
    var e = p.quiz[k], c = k.split(':'), tid = c[0], idx = +c[1];
    var t = DATA.topics.find(function(x){ return x.id === tid; });
    if (!t || !(idx >= 0) || idx >= t.quiz.length) return;
    if (e.v >= 0 && e.v < t.quiz[idx].a.length) setQuizAnsRaw(tid, idx, e.v);
    else LS.del(SKEY + ':quiz:v3:' + tid + ':' + idx);
    tsSet('q:' + k, +e.at || 0);
  });
  Object.keys(p.rev || {}).forEach(function(tid){
    if (DATA.topics.some(function(x){ return x.id === tid; })) LS.set(SKEY + ':rev:' + tid, String(+p.rev[tid] || 0));
  });
}
function contarProgresso(p){
  var nm = 0, nq = 0;
  Object.keys((p && p.marks) || {}).forEach(function(k){ if (p.marks[k].v) nm++; });
  Object.keys((p && p.quiz) || {}).forEach(function(k){ if (p.quiz[k].v >= 0) nq++; });
  return { marcas:nm, quiz:nq };
}
function diffProgresso(a, b){
  var n = 0;
  function cmp(x, y){
    var vistos = {};
    Object.keys(x || {}).concat(Object.keys(y || {})).forEach(function(k){
      if (vistos[k]) return; vistos[k] = 1;
      var xv = (x && x[k]) ? x[k].v : undefined, yv = (y && y[k]) ? y[k].v : undefined;
      if (xv !== yv) n++;
    });
  }
  cmp(a && a.marks, b && b.marks); cmp(a && a.quiz, b && b.quiz);
  return n;
}
function contaDiferente(){
  var uid = LS.get(SKEY + ':cloud:uid');
  return !!(uid && CLOUD_USER && uid !== CLOUD_USER.uid);
}
function progressoLocalVazio(p){
  var c = contarProgresso(p);
  return !c.marcas && !c.quiz && !Object.keys((p && p.rev) || {}).length;
}
/* Substituição real do progresso local: limpa TODOS os itens conhecidos do
   material (marcando tombstones recentes, para não ressuscitarem numa próxima
   mesclagem) e só então aplica o da nuvem. É o que justifica a promessa do
   botão "Baixar da nuvem". */
function substituirProgressoLocal(p){
  var agora = Date.now();
  DATA.topics.forEach(function(t){
    t.cards.forEach(function(_, i){ LS.del(SKEY + ':' + t.id + ':' + i); tsSet('m:' + t.id + ':' + i, agora); });
    t.quiz.forEach(function(_, i){ LS.del(SKEY + ':quiz:v3:' + t.id + ':' + i); tsSet('q:' + t.id + ':' + i, agora); });
    LS.del(SKEY + ':rev:' + t.id);
  });
  aplicarProgressoNuvem(p);
}
function salvarBackupLocal(){ LS.set(SKEY + ':cloud:backup', JSON.stringify({ at: Date.now(), data: localProgress() })); }
function temBackupLocal(){ return !!LS.get(SKEY + ':cloud:backup'); }

/* --- leitura/escrita na nuvem --- */
async function fbLerNuvem(){
  var ref = FB.fs.doc(FB.firestore, 'usuarios', CLOUD_USER.uid, 'areas', DATA.siteKey);
  var snap = await FB.fs.getDoc(ref);
  return snap.exists() ? normalizarNuvem(snap.data()) : null;
}
async function fbGravarNuvem(p){
  p.updatedAt = Date.now();
  var ref = FB.fs.doc(FB.firestore, 'usuarios', CLOUD_USER.uid, 'areas', DATA.siteKey);
  await FB.fs.setDoc(ref, p);
}
async function nuvemPronto(){
  if (!await fbCarregar()){ CLOUD_MSG = { t:'err', m:FB.error || 'Nuvem indisponível.' }; nuvemRedraw(); return false; }
  if (!CLOUD_USER) await nuvemAtualizarEstado();
  if (!CLOUD_USER){ CLOUD_MSG = { t:'err', m:'Entre na sua conta primeiro.' }; nuvemRedraw(); return false; }
  if (CLOUD_APROVACAO !== 'aprovado'){ CLOUD_MSG = { t:'err', m:'Sua conta ainda não está aprovada pelo admin.' }; nuvemRedraw(); return false; }
  return true;
}

async function nuvemSincronizar(){
  if (!await nuvemPronto()) return;
  var marcador = LS.get(SKEY + ':cloud:uid');
  // Trava de conta: vale mesmo quando a nuvem ainda está vazia. Sem isso, o
  // progresso de A subiria para a conta B recém-criada.
  if (marcador && marcador !== CLOUD_USER.uid){
    CLOUD_MSG = { t:'err', m:'Este navegador guarda progresso associado a outra conta. Para não misturar, use "Enviar deste aparelho" (assume este progresso para a conta atual) ou "Baixar da nuvem" (substitui o local), de propósito.' };
    nuvemRedraw(); return;
  }
  var local = localProgress();
  // Sem marcador mas com progresso local: é o primeiro sync desta conta com
  // dados que podem ser legado (ou de outra pessoa). Exige confirmação para
  // associá-los; não sobe nada sozinho.
  if (!marcador && !progressoLocalVazio(local)){
    if (!confirm('Este navegador tem progresso local que ainda não foi associado a nenhuma conta. Sincronizar vai associá-lo à conta ' + CLOUD_USER.email + ' e combiná-lo com a nuvem. Continuar?')) return;
  }
  var merged, aviso = '';
  try {
    // Transação: lê o documento, mescla por item e grava atomicamente. Dois
    // aparelhos sincronizando juntos não se sobrescrevem — o Firestore serializa
    // e reexecuta a transação, e cada item resolve pelo carimbo de tempo.
    merged = await FB.fs.runTransaction(FB.firestore, async function(tx){
      var ref = FB.fs.doc(FB.firestore, 'usuarios', CLOUD_USER.uid, 'areas', DATA.siteKey);
      var snap = await tx.get(ref);
      var cloud = snap.exists() ? normalizarNuvem(snap.data()) : null;
      if (cloud && (cloud.fp !== DATA.fp || cloud.chash !== DATA.chash)){
        aviso = 'Atenção: o material mudou desde o progresso na nuvem; itens que não existem mais foram ignorados. ';
      }
      var m = mergeProgress(localProgress(), cloud || { marks:{}, quiz:{}, rev:{}, updatedAt:0 });
      m.updatedAt = Date.now();
      tx.set(ref, m);
      return m;
    });
  } catch(e){
    CLOUD_MSG = { t:'err', m:'Falha ao sincronizar; nada foi alterado neste navegador. ' + fbErro(e) };
    nuvemRedraw(); return;
  }
  var mudou = diffProgresso(local, merged);
  aplicarProgressoNuvem(merged); // só depois de a gravação ter dado certo
  LS.set(SKEY + ':cloud:uid', CLOUD_USER.uid);
  var c = contarProgresso(merged);
  CLOUD_ULTIMO_RESUMO = aviso + 'Sincronizado: ' + c.marcas + ' marcações e ' + c.quiz + ' respostas na nuvem' + (mudou ? ' (' + mudou + ' item(ns) atualizado(s) aqui).' : '.');
  nuvemRedraw();
}
async function nuvemEnviar(){
  if (!await nuvemPronto()) return;
  var local = localProgress();
  var aviso = contaDiferente() ? 'Atenção: este navegador guarda progresso de outra conta. ' : '';
  if (!confirm(aviso + 'Enviar o progresso deste navegador para a nuvem da conta ' + CLOUD_USER.email + '? Isto substitui o que estiver na nuvem desta conta.')) return;
  try { await fbGravarNuvem(local); LS.set(SKEY + ':cloud:uid', CLOUD_USER.uid); }
  catch(e){ CLOUD_MSG = { t:'err', m:'Falha ao enviar: ' + fbErro(e) }; nuvemRedraw(); return; }
  var c = contarProgresso(local);
  CLOUD_ULTIMO_RESUMO = 'Enviado: ' + c.marcas + ' marcações e ' + c.quiz + ' respostas.';
  nuvemRedraw();
}
async function nuvemBaixar(){
  if (!await nuvemPronto()) return;
  var cloud;
  try { cloud = await fbLerNuvem(); }
  catch(e){ CLOUD_MSG = { t:'err', m:'Não consegui ler a nuvem: ' + fbErro(e) }; nuvemRedraw(); return; }
  if (!cloud){ CLOUD_MSG = { t:'info', m:'Ainda não há progresso na nuvem para esta conta.' }; nuvemRedraw(); return; }
  var aviso = (cloud.fp !== DATA.fp || cloud.chash !== DATA.chash) ? 'Atenção: o material mudou desde este backup. ' : '';
  if (!confirm(aviso + 'Baixar da nuvem SUBSTITUI o progresso deste navegador pelo da conta ' + CLOUD_USER.email + ' (um backup local fica guardado para desfazer). Continuar?')) return;
  salvarBackupLocal();
  substituirProgressoLocal(cloud);
  LS.set(SKEY + ':cloud:uid', CLOUD_USER.uid);
  var c = contarProgresso(cloud);
  CLOUD_ULTIMO_RESUMO = 'Baixado: ' + c.marcas + ' marcações e ' + c.quiz + ' respostas. O progresso anterior deste navegador foi guardado — use "Desfazer último Baixar" se precisar.';
  nuvemRedraw();
}
function nuvemRestaurarBackup(){
  var raw = LS.get(SKEY + ':cloud:backup');
  if (!raw){ CLOUD_MSG = { t:'err', m:'Não há backup local para restaurar.' }; nuvemRedraw(); return; }
  var obj;
  try { obj = JSON.parse(raw); } catch(e){ obj = null; }
  if (!obj || !obj.data){ LS.del(SKEY + ':cloud:backup'); CLOUD_MSG = { t:'err', m:'O backup local estava corrompido e foi descartado.' }; nuvemRedraw(); return; }
  if (!confirm('Restaurar o progresso local de antes do último "Baixar da nuvem"? Isto substitui o progresso atual deste navegador.')) return;
  substituirProgressoLocal(normalizarNuvem(obj.data) || { marks:{}, quiz:{}, rev:{} });
  LS.del(SKEY + ':cloud:backup');
  CLOUD_ULTIMO_RESUMO = 'Progresso anterior restaurado.';
  nuvemRedraw();
}

/* --- tela --- */
function painelSync(resumo){
  var loc = localProgress(), c = contarProgresso(loc);
  var h = '<div class="sync-box"><h3>Manter em dia</h3>' +
    '<p>Neste navegador: <strong>' + c.marcas + '</strong> marcações e <strong>' + c.quiz + '</strong> respostas de quiz.</p>' +
    '<p><strong>Sincronizar</strong> mescla os dois lados: para cada item vale a versão mais recente, e a gravação é atômica (transação) — dois aparelhos juntos não se sobrescrevem. Nada é apagado por ser mais antigo, e o progresso local nunca é trocado sozinho pelo de outra conta.</p>' +
    '<button class="btn" onclick="nuvemSincronizar()">↻ Sincronizar (mesclar)</button>' +
    '<button class="btn ghost" onclick="nuvemEnviar()">⬆️ Enviar deste aparelho</button>' +
    '<button class="btn ghost" onclick="nuvemBaixar()">⬇️ Baixar da nuvem</button>' +
    (temBackupLocal() ? '<button class="btn ghost" onclick="nuvemRestaurarBackup()">↩️ Desfazer último Baixar</button>' : '');
  if (resumo) h += '<div class="note ok">' + escHtml(resumo) + '</div>';
  return h + '</div>';
}
function renderNuvem(){
  renderSidebar('nuvem');
  document.getElementById('tbTitle').textContent = 'Progresso na nuvem';
  nuvemAgendarBoot();
  var resumo = CLOUD_ULTIMO_RESUMO; CLOUD_ULTIMO_RESUMO = null;
  var h = '<div class="topic-head"><h1>☁️ Progresso na nuvem</h1>' +
    '<p class="sub">Opcional: leve o progresso entre aparelhos com uma conta. Sem isso, tudo continua funcionando offline, só neste navegador.</p></div>';
  if (CLOUD_MSG){ h += '<div class="note ' + (CLOUD_MSG.t === 'ok' ? 'ok' : CLOUD_MSG.t === 'err' ? 'err' : CLOUD_MSG.t === 'warn' ? 'warn' : '') + '">' + escHtml(CLOUD_MSG.m) + '</div>'; CLOUD_MSG = null; }
  if (!fbConfigurado()){
    h += '<div class="sync-box"><h3>Nuvem não configurada</h3>' +
      '<p>Este site não tem <code>firebase-config.json</code>, então o recurso de nuvem está desligado. Nada quebra: o progresso segue salvo apenas no navegador.</p>' +
      '<p>Quem publica pode ativar seguindo o manual no <code>README.md</code>: criar o projeto Firebase, colar as regras de <code>firestore.rules</code> no console e rodar o build. A config do app web é pública — a segurança vem das regras, não de esconder o arquivo.</p>' +
      '<p><strong>⚠️ Nunca</strong> coloque aqui credencial de administrador (service account, <code>private_key</code>): o build recusa.</p></div>';
  } else if (!FB.loaded){
    h += '<div class="sync-box"><h3>Carregando a nuvem…</h3><p>' + escHtml(FB.error || 'Conectando ao Firebase.') + '</p>' +
      '<p>O material funciona normalmente sem a nuvem; quando houver conexão, tente de novo.</p>' +
      '<button class="btn ghost" onclick="nuvemRetentar()">↻ Tentar de novo</button></div>';
  } else if (!CLOUD_USER){
    h += '<div class="sync-box"><h3>Entrar</h3>' +
      '<p>Uma conta por pessoa. O cadastro pode estar aberto tecnicamente, mas o <strong>acesso ao progresso</strong> só é liberado quando o admin aprova a conta. Sem aprovação, não há leitura nem escrita na nuvem.</p>' +
      '<div class="conta"><input id="nvEmail" type="email" placeholder="e-mail" autocomplete="email">' +
      '<input id="nvSenha" type="password" placeholder="senha (mín. 6)" autocomplete="current-password"></div>' +
      '<button class="btn" onclick="nuvemEntrar()">Entrar</button>' +
      '<button class="btn ghost" onclick="nuvemRegistrar()">Criar conta</button>' +
      '<p style="font-size:.85em;color:var(--muted)">Ao criar a conta, envio um e-mail de verificação. Depois de confirmar, aguarde a aprovação do admin.</p></div>';
  } else {
    var email = escHtml(CLOUD_USER.email || '(sem e-mail)');
    var estado = CLOUD_APROVACAO === 'aprovado' ? '<span class="tag ok">✅ aprovado</span>' :
      CLOUD_APROVACAO === 'pendente' ? '<span class="tag pend">⏳ aguardando aprovação</span>' :
      CLOUD_APROVACAO === 'carregando' ? '<span class="tag">… verificando</span>' :
      CLOUD_APROVACAO === 'offline' ? '<span class="tag warn">📴 sem conexão</span>' :
      CLOUD_APROVACAO === 'nao-verificado' ? '<span class="tag warn">✉️ e-mail não verificado</span>' :
      '<span class="tag warn">— estado desconhecido</span>';
    h += '<div class="sync-box"><h3>Conta</h3>' +
      '<p><strong>' + email + '</strong><br>' + estado +
      (CLOUD_USER.emailVerified ? '<span class="tag ok">e-mail verificado</span>' : '<span class="tag warn">e-mail não verificado</span>') + '</p>';
    if (!CLOUD_USER.emailVerified){
      var rest = reenvioRestante();
      h += '<button class="btn" onclick="nuvemReenviar()"' + (rest ? ' disabled' : '') + '>Reenviar e-mail de verificação' + (rest ? ' (aguarde ' + rest + 's)' : '') + '</button>' +
        '<button class="btn ghost" onclick="nuvemVerificar()">Já verifiquei</button>';
    } else if (CLOUD_APROVACAO === 'pendente'){
      h += '<p>Peça ao admin para aprovar sua conta: ele cria o documento <code>acessos/' + escHtml(CLOUD_USER.uid) + '</code> no console do Firestore. Até lá, seu progresso continua salvo localmente.</p>' +
        '<button class="btn ghost" onclick="nuvemVerificar()">Já fui aprovado</button>';
    } else if (CLOUD_APROVACAO === 'offline' || CLOUD_APROVACAO === 'erro'){
      h += '<button class="btn ghost" onclick="nuvemVerificar()">Tentar verificar de novo</button>';
    }
    h += '<button class="btn ghost" onclick="nuvemSair()">Sair</button></div>';
    if (CLOUD_APROVACAO === 'aprovado') h += painelSync(resumo);
    if (contaDiferente()) h += '<div class="note err">⚠️ Este navegador tem progresso associado a outra conta. Nada foi trocado automaticamente: escolha com cuidado entre enviar ou baixar.</div>';
  }
  document.getElementById('main').innerHTML = h;
  window.scrollTo(0,0);
}

/* ---------- simulado ----------
   Estudar tema a tema da uma falsa sensacao de dominio, porque o contexto ja
   entrega metade da resposta. Aqui as questoes vem de todos os temas
   misturadas e o gabarito so aparece no fim. */
var simAviso = '';
function simGet(){
  var s;
  try { s = JSON.parse(LS.get(SKEY + ':sim') || 'null'); } catch(e){ s = null; }
  if (!s) return null;
  if (!Array.isArray(s.itens) || !Array.isArray(s.resp)){
    simClear();
    simAviso = 'O simulado salvo estava corrompido e foi descartado.';
    return null;
  }
  // O simulado guarda a versão do material: se questões ou temas mudaram, as
  // referências antigas não valem mais — descarta em vez de associar errado.
  if (s.fp !== DATA.fp || s.chash !== DATA.chash){
    simClear();
    simAviso = 'O simulado salvo era de uma versão anterior do material e foi descartado — comece outro.';
    return null;
  }
  return s;
}
function simSet(s){ LS.set(SKEY + ':sim', JSON.stringify(s)); }
function simClear(){ LS.del(SKEY + ':sim'); }

function simIniciar(n){
  var todas = [];
  DATA.topics.forEach(function(t){ t.quiz.forEach(function(_, i){ todas.push([t.id, i]); }); });
  for (var k = todas.length - 1; k > 0; k--){
    var j = Math.floor(Math.random() * (k + 1));
    var tmp = todas[k]; todas[k] = todas[j]; todas[j] = tmp;
  }
  var itens = todas.slice(0, Math.min(n, todas.length));
  simAviso = '';
  simSet({ fp: DATA.fp, chash: DATA.chash, itens: itens, resp: itens.map(function(){ return null; }), pos: 0, fim: false });
  renderSimulado();
}
function simEscolher(j){
  var s = simGet(); if (!s || s.fim) return;
  s.resp[s.pos] = j; simSet(s); renderSimulado();
}
function simIr(d){
  var s = simGet(); if (!s) return;
  s.pos = Math.max(0, Math.min(s.itens.length - 1, s.pos + d)); simSet(s); renderSimulado();
}
function simFinalizar(){
  var s = simGet(); if (!s) return;
  var faltam = s.resp.filter(function(r){ return r === null; }).length;
  if (faltam && !confirm(faltam + ' questão(ões) sem resposta serão contadas como erro. Finalizar mesmo assim?')) return;
  s.fim = true; simSet(s);
  s.itens.forEach(function(ref){ marcarRevisao(ref[0]); });
  renderSimulado();
}
function simQuestao(ref){
  if (!Array.isArray(ref)) return null;
  var t = DATA.topics.find(function(x){ return x.id === ref[0]; });
  if (!t || !Number.isInteger(ref[1]) || !t.quiz[ref[1]]) return null;
  return { t: t, q: t.quiz[ref[1]] };
}

function renderSimulado(){
  renderSidebar('simulado');
  document.getElementById('tbTitle').textContent = 'Simulado';
  var s = simGet();
  var h = '';

  // Defesa extra: itens que não existem mais são removidos (ou o simulado
  // inteiro é descartado), com aviso, sem quebrar a tela.
  if (s){
    var itens = [], resp = [], removidos = 0;
    s.itens.forEach(function(ref, k){
      if (simQuestao(ref)){ itens.push(ref); resp.push(k < s.resp.length ? s.resp[k] : null); }
      else removidos++;
    });
    if (removidos){
      if (!itens.length){
        simClear(); s = null;
        simAviso = 'O simulado salvo apontava para questões que não existem mais e foi descartado.';
      } else {
        s.itens = itens; s.resp = resp;
        s.pos = Math.max(0, Math.min(s.pos, s.itens.length - 1));
        simSet(s);
        simAviso = removidos + ' questão(ões) de uma versão anterior do material foram ignoradas.';
      }
    }
  }
  if (simAviso){ h += '<div class="note err">⚠️ ' + simAviso + '</div>'; simAviso = ''; }

  if (!s){
    var totalQ = DATA.topics.reduce(function(a,t){ return a + t.quiz.length; }, 0);
    h += '<div class="topic-head"><h1>📝 Simulado</h1>' +
         '<p class="sub">Questões sorteadas de todos os ' + DATA.topics.length + ' temas, misturadas. ' +
         'O gabarito só aparece no fim, com o resultado separado por tema e por nível.</p></div>';
    h += '<div class="sync-box"><h3>Quantas questões?</h3>' +
         '<div class="seg">' +
         '<button onclick="simIniciar(10)">10<br><span style="font-weight:400;font-size:.8em">~5 min</span></button>' +
         '<button onclick="simIniciar(20)">20<br><span style="font-weight:400;font-size:.8em">~10 min</span></button>' +
         '<button onclick="simIniciar(40)">40<br><span style="font-weight:400;font-size:.8em">~20 min</span></button>' +
         '<button onclick="simIniciar(' + totalQ + ')">Todas<br><span style="font-weight:400;font-size:.8em">' + totalQ + ' questões</span></button>' +
         '</div>' +
         '<p style="color:var(--muted);font-size:.87em;margin-top:12px">As respostas do simulado são independentes do quiz por tema — fazer simulado não altera o seu progresso nos temas.</p>' +
         '</div>';
    document.getElementById('main').innerHTML = h;
    window.scrollTo(0,0);
    return;
  }

  if (s.fim){
    var acertos = 0;
    var porTema = {}, porNivel = { '🟢':{ok:0,n:0}, '🟡':{ok:0,n:0}, '🔴':{ok:0,n:0} };
    s.itens.forEach(function(ref, k){
      var o = simQuestao(ref);
      if (!o) return;
      var ok = s.resp[k] === o.q.c;
      if (ok) acertos++;
      if (!porTema[ref[0]]) porTema[ref[0]] = { ok:0, n:0, nome:o.t.shortTitle };
      porTema[ref[0]].n++; if (ok) porTema[ref[0]].ok++;
      var nv = porNivel[o.q.n]; if (nv){ nv.n++; if (ok) nv.ok++; }
    });
    var pct = Math.round(100 * acertos / s.itens.length);
    h += '<div class="topic-head"><h1>📝 Resultado do simulado</h1></div>';
    h += '<div class="resultado"><div class="nota">' + pct + '%</div>' +
         '<div class="sub">' + acertos + ' de ' + s.itens.length + ' questões</div></div>';

    h += '<div class="perf"><h3>Por nível</h3>';
    NIVEIS.forEach(function(nv){
      var d = porNivel[nv];
      var p = d.n ? Math.round(100 * d.ok / d.n) : 0;
      var cls = !d.n ? '' : p >= 75 ? 'hi' : p >= 50 ? 'mid' : 'lo';
      h += '<div class="perf-row"><span class="lv">' + nv + ' ' + NOME_NIVEL[nv] + '</span>' +
           '<span class="bar"><i class="' + cls + '" style="width:' + p + '%"></i></span>' +
           '<span class="val">' + (d.n ? p + '% (' + d.ok + '/' + d.n + ')' : '—') + '</span></div>';
    });
    h += '</div>';

    h += '<div class="perf"><h3>Por tema</h3>';
    Object.keys(porTema).sort().forEach(function(tid){
      var d = porTema[tid];
      var p = Math.round(100 * d.ok / d.n);
      var cls = p >= 75 ? 'hi' : p >= 50 ? 'mid' : 'lo';
      h += '<div class="perf-row"><span class="lv">' + tid + '</span>' +
           '<span class="bar"><i class="' + cls + '" style="width:' + p + '%"></i></span>' +
           '<span class="val">' + d.ok + '/' + d.n + '</span></div>';
    });
    h += '<p class="hint">Tema com desempenho baixo aqui é onde vale voltar a estudar.</p></div>';

    h += '<button class="btn" onclick="simClear();renderSimulado()">🔁 Novo simulado</button>' +
         '<button class="btn ghost" onclick="location.hash=\\'#home\\'">Voltar ao início</button>';

    h += '<h2 style="margin-top:26px">Revisão das questões</h2>';
    s.itens.forEach(function(ref, k){
      var o = simQuestao(ref);
      if (!o) return;
      var marcou = s.resp[k], ok = marcou === o.q.c;
      h += '<div class="qz l-' + o.q.levelName + '">' +
           '<div class="qnum">' + (k+1) + ' · TEMA ' + ref[0] + ' · ' + o.q.n + ' · ' + (ok ? '✅ acertou' : '❌ errou') + '</div>' +
           '<div class="qtext">' + o.q.q + '</div>';
      o.q.a.forEach(function(alt, j){
        var cls = 'alt locked' + (j === o.q.c ? ' correct' : (j === marcou ? ' wrong' : ' dim'));
        h += '<button type="button" class="' + cls + '" disabled><span class="letter">' + LETTERS[j] + '</span><span>' + alt + '</span></button>';
      });
      h += '<div class="qz-exp">' + o.q.e + '</div></div>';
    });
    document.getElementById('main').innerHTML = h;
    window.scrollTo(0,0);
    return;
  }

  var ref = s.itens[s.pos], o = simQuestao(ref);
  if (!o){
    simClear();
    simAviso = 'Esta questão não existe mais no material — o simulado foi encerrado.';
    renderSimulado();
    return;
  }
  var respondidas = s.resp.filter(function(r){ return r !== null; }).length;
  h += '<div class="sim-top"><span class="cont">' + (s.pos+1) + ' / ' + s.itens.length + '</span>' +
       '<span class="barra"><i style="width:' + Math.round(100*respondidas/s.itens.length) + '%"></i></span>' +
       '<button class="chip" onclick="simFinalizar()">Finalizar</button>' +
       '<button class="chip" onclick="if(confirm(\\'Descartar este simulado?\\')){simClear();renderSimulado()}">Sair</button></div>';
  h += '<div class="qz l-' + o.q.levelName + '">' +
       '<div class="qnum">' + o.q.n + ' · TEMA ' + ref[0] + '</div>' +
       '<div class="qtext">' + o.q.q + '</div>';
  o.q.a.forEach(function(alt, j){
    h += '<button type="button" class="alt' + (s.resp[s.pos] === j ? ' escolhida' : '') + '" onclick="simEscolher(' + j + ')">' +
         '<span class="letter">' + LETTERS[j] + '</span><span>' + alt + '</span></button>';
  });
  h += '</div>';
  h += '<div class="sim-nav">' +
       (s.pos > 0 ? '<button class="btn ghost" onclick="simIr(-1)">← Anterior</button>' : '') +
       (s.pos < s.itens.length - 1
          ? '<button class="btn" onclick="simIr(1)">Próxima →</button>'
          : '<button class="btn" onclick="simFinalizar()">Ver resultado</button>') +
       '</div>';
  document.getElementById('main').innerHTML = h;
  window.scrollTo(0,0);
}

/* ---------- revisar erros ---------- */
var revFeitos = {};
function revResponderQuiz(tid, i, j){
  var t = DATA.topics.find(function(x){ return x.id === tid; });
  setQuizAns(tid, i, j);
  marcarRevisao(tid);
  if (j === t.quiz[i].c) revFeitos[tid + ':' + i] = true;
  renderRevisar();
}
function revMarcar(tid, i, v){
  setMark(tid, i, v);
  marcarRevisao(tid);
  if (v === 'ok') revFeitos['a' + tid + ':' + i] = true;
  renderRevisar();
}
function renderRevisar(){
  renderSidebar('revisar');
  document.getElementById('tbTitle').textContent = 'Revisar erros';
  var errs = quizErrados();
  var abertas = abertasRevisar();
  var resolvidosQuiz = Object.keys(revFeitos).filter(function(k){ return k.indexOf('a') !== 0; });
  var resolvidasAb = Object.keys(revFeitos).filter(function(k){ return k.indexOf('a') === 0; });

  var h = '<div class="topic-head"><h1>🔁 Revisar erros</h1>' +
          '<p class="sub">Tudo que você errou ou marcou como dúvida, de todos os temas, reunido para refazer. Ao acertar, sai da lista.</p></div>';

  if (!errs.length && !abertas.length && !resolvidosQuiz.length && !resolvidasAb.length){
    h += '<p class="empty">Nada para revisar — você não tem questões erradas nem marcadas como dúvida.</p>';
    document.getElementById('main').innerHTML = h;
    window.scrollTo(0,0);
    return;
  }

  if (errs.length || resolvidosQuiz.length){
    h += '<h2>🎯 Quiz errado (' + errs.length + ')</h2>';
    var vistos = {};
    errs.concat(resolvidosQuiz.map(function(k){ var p = k.split(':'); return { t:p[0], i:+p[1] }; }))
      .forEach(function(r){
        var key = r.t + ':' + r.i;
        if (vistos[key]) return; vistos[key] = 1;
        var t = DATA.topics.find(function(x){ return x.id === r.t; });
        var q = t.quiz[r.i], ans = getQuizAns(r.t, r.i), acertou = ans === q.c;
        h += '<div class="qz l-' + q.levelName + '">' +
             '<div class="qnum">TEMA ' + r.t + ' · ' + q.n + (acertou ? ' · ✅ resolvido' : '') + '</div>' +
             '<div class="qtext">' + q.q + '</div>';
        q.a.forEach(function(alt, j){
          if (acertou){
            var cls = 'alt locked' + (j === q.c ? ' correct' : ' dim');
            h += '<div class="' + cls + '"><span class="letter">' + LETTERS[j] + '</span><span>' + alt + '</span></div>';
          } else {
            h += '<div class="alt" onclick="revResponderQuiz(\\'' + r.t + '\\',' + r.i + ',' + j + ')">' +
                 '<span class="letter">' + LETTERS[j] + '</span><span>' + alt + '</span></div>';
          }
        });
        if (acertou) h += '<div class="qz-exp"><span class="verdict ok">✅ Agora sim — sai da lista.</span>' + q.e + '</div>';
        else if (ans !== null) h += '<div class="qz-exp"><span class="verdict nok">Você marcou ' + LETTERS[ans] + ' da última vez.</span>Tente de novo antes de ver a explicação.</div>';
        h += '</div>';
      });
  }

  if (abertas.length || resolvidasAb.length){
    h += '<h2 style="margin-top:24px">❓ Questões abertas em dúvida (' + abertas.length + ')</h2>';
    var vistas = {};
    abertas.concat(resolvidasAb.map(function(k){ var p = k.slice(1).split(':'); return { t:p[0], i:+p[1] }; }))
      .forEach(function(r){
        var key = r.t + ':' + r.i;
        if (vistas[key]) return; vistas[key] = 1;
        var t = DATA.topics.find(function(x){ return x.id === r.t; });
        var c = t.cards[r.i], m = getMark(r.t, r.i);
        h += '<div class="card l-' + c.levelName + '" id="rev-' + r.t + '-' + r.i + '">' +
             '<div class="card-q" onclick="var e=document.getElementById(\\'rev-' + r.t + '-' + r.i + '\\');e.classList.toggle(\\'open\\')">' +
             '<span class="qt"><span style="color:var(--muted);font-size:.8em">TEMA ' + r.t + '</span><br>' + c.titleHtml + '</span>' +
             '<span class="toggle">ver ▾</span></div>' +
             '<div class="card-a">' + c.bodyHtml +
             '<div class="card-mark"><span class="lbl">' + (m === 'ok' ? '✅ resolvido — sai da lista' : 'Como você foi agora?') + '</span>' +
             '<button class="mark-btn' + (m==='ok'?' sel-ok':'') + '" onclick="revMarcar(\\'' + r.t + '\\',' + r.i + ',\\'ok\\')">✅ Acertei</button>' +
             '<button class="mark-btn' + (m==='meh'?' sel-meh':'') + '" onclick="revMarcar(\\'' + r.t + '\\',' + r.i + ',\\'meh\\')">⚠️ Parcial</button>' +
             '<button class="mark-btn' + (m==='bad'?' sel-bad':'') + '" onclick="revMarcar(\\'' + r.t + '\\',' + r.i + ',\\'bad\\')">❌ Errei</button>' +
             '</div></div></div>';
      });
  }
  document.getElementById('main').innerHTML = h;
  bindTopicLinks();
  window.scrollTo(0,0);
}

/* ---------- busca ---------- */
var _idx = null;
function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function semTags(h){
  return h.replace(/<[^>]+>/g,' ')
          .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
          .replace(/&#39;/g,"'").replace(/&amp;/g,'&')
          .replace(/\\s+/g,' ').trim();
}
function norm(s){ return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(); }
function idxBusca(){
  if (_idx) return _idx;
  _idx = [];
  DATA.topics.forEach(function(t){
    var re = /<section class="study-sec" id="([^"]+)"><h2>(.*?)<\\/h2>/g, m, partes = [];
    while ((m = re.exec(t.studyHtml)) !== null) partes.push({ id:m[1], titulo:semTags(m[2]), ini:m.index });
    partes.forEach(function(p, k){
      var fim = k + 1 < partes.length ? partes[k+1].ini : t.studyHtml.length;
      _idx.push({ tid:t.id, tab:'estudo', tipo:'Estudo', ancora:p.id,
                  titulo:p.titulo, texto:semTags(t.studyHtml.slice(p.ini, fim)) });
    });
    t.cards.forEach(function(c, i){
      _idx.push({ tid:t.id, tab:'questoes', tipo:'Questão aberta', foco:'card-' + i,
                  titulo:semTags(c.titleHtml), texto:semTags(c.titleHtml + ' ' + c.bodyHtml) });
    });
    t.quiz.forEach(function(q, i){
      _idx.push({ tid:t.id, tab:'quiz', tipo:'Quiz', foco:'qz-' + i,
                  titulo:semTags(q.q), texto:semTags(q.q + ' ' + q.a.join(' · ') + ' ' + q.e) });
    });
  });
  return _idx;
}
function destacar(txt, alvo){
  var n = norm(txt), out = '', ini = 0, p = n.indexOf(alvo);
  while (p !== -1){
    out += escHtml(txt.slice(ini, p)) + '<mark>' + escHtml(txt.slice(p, p + alvo.length)) + '</mark>';
    ini = p + alvo.length;
    p = n.indexOf(alvo, ini);
  }
  return out + escHtml(txt.slice(ini));
}
var focoPendente = null;
function irPara(tid, tab, ancora, foco){
  focoPendente = { ancora: ancora, foco: foco };
  location.hash = '#topic/' + tid + '/' + tab;
}
function aplicarFoco(){
  if (!focoPendente) return;
  var f = focoPendente; focoPendente = null;
  setTimeout(function(){
    var el = document.getElementById(f.foco || f.ancora);
    if (!el) return;
    el.scrollIntoView({ block:'center' });
    var antes = el.style.outline;
    el.style.outline = '3px solid var(--accent)';
    el.style.outlineOffset = '3px';
    setTimeout(function(){ el.style.outline = antes; el.style.outlineOffset = ''; }, 1600);
  }, 60);
}
function buscar(){
  var termo = document.getElementById('q').value.trim();
  var alvo = norm(termo);
  var cx = document.getElementById('res');
  if (alvo.length < 2){ cx.innerHTML = '<p class="empty">Digite ao menos 2 caracteres.</p>'; return; }
  var achados = [];
  idxBusca().forEach(function(e){
    var p = norm(e.texto).indexOf(alvo);
    if (p === -1) return;
    var ini = Math.max(0, p - 70), fim = Math.min(e.texto.length, p + 160);
    achados.push({ e:e, trecho: (ini > 0 ? '… ' : '') + e.texto.slice(ini, fim) + (fim < e.texto.length ? ' …' : '') });
  });
  if (!achados.length){ cx.innerHTML = '<p class="empty">Nada encontrado para “' + escHtml(termo) + '”.</p>'; return; }
  var h = '<p style="color:var(--muted);font-size:.88em">' + achados.length + ' trecho(s) encontrados</p>';
  achados.slice(0, 40).forEach(function(a){
    var e = a.e;
    h += '<div class="hit" onclick="irPara(\\'' + e.tid + '\\',\\'' + e.tab + '\\',\\'' + (e.ancora||'') + '\\',\\'' + (e.foco||'') + '\\')">' +
         '<div class="onde">Tema ' + e.tid + ' · ' + e.tipo + '</div>' +
         '<div class="tit">' + destacar(e.titulo, alvo) + '</div>' +
         '<div class="trecho">' + destacar(a.trecho, alvo) + '</div></div>';
  });
  if (achados.length > 40) h += '<p class="empty">Mostrando os 40 primeiros de ' + achados.length + '.</p>';
  cx.innerHTML = h;
}
function renderBusca(){
  renderSidebar('busca');
  document.getElementById('tbTitle').textContent = 'Buscar';
  document.getElementById('main').innerHTML =
    '<div class="topic-head"><h1>🔎 Buscar no material</h1>' +
    '<p class="sub">Procura em resumos, questões abertas e quiz de todos os temas.</p></div>' +
    '<div class="busca-campo"><input id="q" type="search" placeholder="Ex.: idempotência, watermark, leakage..." autocomplete="off"></div>' +
    '<div id="res"></div>';
  var inp = document.getElementById('q');
  inp.addEventListener('input', buscar);
  inp.focus();
  window.scrollTo(0,0);
}

/* ---------- topico ---------- */
var levelFilter = 'todos';
var statusFilter = 'todas';

function topicNav(t){
  var i = DATA.topics.indexOf(t), prev = DATA.topics[i-1], next = DATA.topics[i+1];
  var h = '<nav class="topic-nav" aria-label="Navegação entre temas">';
  h += prev ? '<a href="#topic/' + prev.id + '"><small>← Tema anterior</small><strong>' + prev.shortTitle + '</strong></a>' : '<span></span>';
  h += next ? '<a href="#topic/' + next.id + '"><small>Próximo tema →</small><strong>' + next.shortTitle + '</strong></a>' : '<a href="#simulado"><small>Próximo passo →</small><strong>Fazer um simulado</strong></a>';
  return h + '</nav>';
}

function renderTopic(id, tab){
  var t = DATA.topics.find(function(x){ return x.id === id; });
  if (!t){ location.hash = '#home'; return; }
  renderSidebar(id);
  document.getElementById('tbTitle').textContent = t.shortTitle;
  var cur = tab || 'estudo';
  if (cur === 'quiz' && !t.quiz.length) cur = 'questoes';

  var h = '<div class="topic-head"><h1>' + t.fullTitle + '</h1>' +
          (t.subtitle ? '<p class="sub">' + t.subtitle + '</p>' : '') + '</div>';
  h += '<div class="tabs" role="tablist" aria-label="Modo de estudo">' +
       '<button class="tab' + (cur==='estudo'?' active':'') + '" role="tab" aria-selected="' + (cur==='estudo') + '" onclick="goTab(\\'' + id + '\\',\\'estudo\\')">📖 Estudo</button>' +
       '<button class="tab' + (cur==='quiz'?' active':'') + '" role="tab" aria-selected="' + (cur==='quiz') + '" onclick="goTab(\\'' + id + '\\',\\'quiz\\')">🎯 Quiz <span class="count">(' + t.quiz.length + ')</span></button>' +
       '<button class="tab' + (cur==='questoes'?' active':'') + '" role="tab" aria-selected="' + (cur==='questoes') + '" onclick="goTab(\\'' + id + '\\',\\'questoes\\')">❓ Abertas <span class="count">(' + t.cards.length + ')</span></button>' +
       '</div>';

  if (cur === 'estudo'){
    if (t.toc.length > 1){
      h += '<nav class="toc"><b>Nesta página</b>';
      t.toc.forEach(function(s){
        h += '<a href="#' + s.id + '" onclick="event.preventDefault();document.getElementById(\\'' + s.id + '\\').scrollIntoView({behavior:\\'smooth\\'})">' + s.title + '</a>';
      });
      h += '</nav>';
    }
    h += t.studyHtml || '<p class="empty">Sem conteúdo de estudo neste tema.</p>';
    h += topicNav(t);
  } else if (cur === 'quiz'){
    h += renderQuiz(t);
  } else {
    h += renderOpenQuestions(t);
  }
  document.getElementById('main').innerHTML = h;
  bindTopicLinks();
}

function goTab(id, tab){
  location.hash = '#topic/' + id + '/' + tab;
}

function renderQuiz(t){
  var qp = quizProgress(t);
  var h = '<div class="quiz-head">' +
          '<span class="score"><span class="ok">' + qp.correct + '</span> / ' + qp.answered + ' acertos</span>' +
          '<span class="detail">' + qp.answered + ' de ' + qp.total + ' respondidas — toque numa alternativa para responder.</span>' +
          '<button class="chip" onclick="if(confirm(\\'Apagar suas respostas deste tema?\\')){clearQuiz(\\'' + t.id + '\\');rerenderQuiz(\\'' + t.id + '\\');}">↺ Refazer</button>' +
          '</div>';
  // Acerto separado por nivel: e o que diz se o dominio e real ou so no basico.
  if (qp.answered) h += '<div class="perf"><h3>Neste tema, por nível</h3>' + barraPerf(statsNivel(t.id)) + '</div>';
  t.quiz.forEach(function(q, i){
    h += quizCardHtml(t, q, i);
  });
  return h;
}
function quizCardHtml(t, q, i){
  var ans = getQuizAns(t.id, i);
  var answered = ans !== null;
  var h = '<div class="qz l-' + q.levelName + '" id="qz-' + i + '">' +
          '<div class="qnum">QUESTÃO ' + (i+1) + ' DE ' + t.quiz.length + ' · ' + q.n + '</div>' +
          '<div class="qtext">' + q.q + '</div>';
  q.a.forEach(function(alt, j){
    var cls = 'alt';
    if (answered){
      cls += ' locked';
      if (j === q.c) cls += ' correct';
      else if (j === ans) cls += ' wrong';
      else cls += ' dim';
    }
    var click = answered ? ' disabled' : ' onclick="answerQuiz(\\'' + t.id + '\\',' + i + ',' + j + ')"';
    h += '<button type="button" class="' + cls + '"' + click + '><span class="letter">' + LETTERS[j] + '</span><span>' + alt + '</span></button>';
  });
  if (answered){
    var ok = ans === q.c;
    h += '<div class="qz-exp"><span class="verdict ' + (ok?'ok':'nok') + '">' +
         (ok ? '✅ Correto!' : '❌ Você marcou ' + LETTERS[ans] + ' — a correta é ' + LETTERS[q.c] + '.') +
         '</span>' + q.e + '</div>';
  }
  h += '</div>';
  return h;
}
/* Responder atualiza SO o card tocado: nada de re-render global, que perderia
   a posicao do scroll e fecharia as respostas ja abertas. */
function answerQuiz(tid, i, j){
  if (getQuizAns(tid, i) !== null) return;
  setQuizAns(tid, i, j);
  var t = DATA.topics.find(function(x){ return x.id === tid; });
  var el = document.getElementById('qz-' + i);
  if (el){
    var tmp = document.createElement('div');
    tmp.innerHTML = quizCardHtml(t, t.quiz[i], i);
    el.replaceWith(tmp.firstChild);
  }
  marcarRevisao(tid);
  var qp = quizProgress(t);
  var head = document.querySelector('.quiz-head');
  if (head){
    head.querySelector('.score').innerHTML = '<span class="ok">' + qp.correct + '</span> / ' + qp.answered + ' acertos';
    head.querySelector('.detail').textContent = qp.answered + ' de ' + qp.total + ' respondidas — toque numa alternativa para responder.';
    // O painel por nivel acompanha a resposta; se ainda nao existe (primeira do
    // tema), e criado logo depois do cabecalho, sem redesenhar a lista.
    var perf = document.querySelector('#main .perf');
    var corpo = '<h3>Neste tema, por nível</h3>' + barraPerf(statsNivel(tid));
    if (perf) perf.innerHTML = corpo;
    else {
      var novo = document.createElement('div');
      novo.className = 'perf';
      novo.innerHTML = corpo;
      head.insertAdjacentElement('afterend', novo);
    }
  }
  renderSidebar(tid);
}
function rerenderQuiz(tid){
  var t = DATA.topics.find(function(x){ return x.id === tid; });
  var main = document.getElementById('main');
  var head = main.querySelector('.quiz-head');
  if (!head) return;
  var wrapper = document.createElement('div');
  wrapper.innerHTML = renderQuiz(t);
  var first = main.querySelector('.quiz-head');
  var nodes = [];
  var n = first;
  while (n){ nodes.push(n); n = n.nextElementSibling; }
  nodes.forEach(function(x){ x.remove(); });
  while (wrapper.firstChild) main.appendChild(wrapper.firstChild);
  renderSidebar(tid);
}

function renderOpenQuestions(t){
  var h = '<div class="q-tools">' +
       chip('nivel','todos','Todos') + chip('nivel','🟢','🟢') + chip('nivel','🟡','🟡') + chip('nivel','🔴','🔴') +
       '<span class="spacer"></span>' +
       chip('status','todas','Todas') + chip('status','pendentes','Não marcadas') + chip('status','revisar','Revisar') +
       '</div>';
  if (t.questionsIntroHtml) h += '<div class="q-intro">' + t.questionsIntroHtml + '</div>';
  var shown = 0;
  t.cards.forEach(function(c, i){
    var mark = getMark(t.id, i);
    if (levelFilter !== 'todos' && c.level !== levelFilter) return;
    if (statusFilter === 'pendentes' && mark) return;
    if (statusFilter === 'revisar' && mark !== 'meh' && mark !== 'bad') return;
    shown++;
    h += '<div class="card l-' + c.levelName + '" id="card-' + i + '">' +
         '<button type="button" class="card-q" aria-expanded="false" onclick="toggleCard(' + i + ')"><span class="qt">' + c.titleHtml + '</span>' +
         '<span class="toggle">ver ▾</span></button>' +
         '<div class="card-a">' + c.bodyHtml +
         '<div class="card-mark" id="cm-' + i + '"><span class="lbl">Como você foi?</span>' + markBtns(t.id, i, mark) +
         '</div></div></div>';
  });
  if (!shown) h += '<p class="empty">Nenhuma questão com esse filtro.</p>';
  return h;
}
function markBtns(tid, i, mark){
  var b = function(v, label){
    return '<button class="mark-btn' + (mark===v ? ' sel-' + v : '') + '" onclick="mark(\\'' + tid + '\\',' + i + ',\\'' + v + '\\')">' + label + '</button>';
  };
  return b('ok','✅ Acertei') + b('meh','⚠️ Parcial') + b('bad','❌ Errei') +
    (mark ? '<button class="mark-btn" onclick="mark(\\'' + tid + '\\',' + i + ',\\'\\')">limpar</button>' : '');
}
/* Marcar tambem atualiza so o proprio card. */
function mark(tid, i, v){
  setMark(tid, i, v);
  marcarRevisao(tid);
  var cm = document.getElementById('cm-' + i);
  if (cm) cm.innerHTML = '<span class="lbl">Como você foi?</span>' + markBtns(tid, i, getMark(tid, i));
  renderSidebar(tid);
}
function chip(kind, val, label){
  var active = (kind==='nivel' ? levelFilter : statusFilter) === val;
  return '<button class="chip' + (active?' active':'') + '" onclick="setFilter(\\'' + kind + '\\',\\'' + val + '\\')">' + label + '</button>';
}
function setFilter(kind, val){
  if (kind==='nivel') levelFilter = val; else statusFilter = val;
  var m = (location.hash || '').match(/^#topic\\/(\\d{2})(?:\\/(\\w+))?/);
  if (m) renderTopic(m[1], m[2] || 'estudo');
}
function toggleCard(i){
  var el = document.getElementById('card-' + i);
  el.classList.toggle('open');
  el.querySelector('.card-q').setAttribute('aria-expanded', el.classList.contains('open') ? 'true' : 'false');
  el.querySelector('.toggle').textContent = el.classList.contains('open') ? 'ocultar ▴' : 'ver ▾';
}
function bindTopicLinks(){
  document.querySelectorAll('.topic-link').forEach(function(a){
    a.addEventListener('click', function(e){ e.preventDefault(); location.hash = '#topic/' + a.dataset.topic; });
  });
}

/* ---------- roteamento (a aba entra no hash: #topic/03/quiz) ---------- */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
function route(){
  var hash = location.hash || '#home';
  closeSidebar();
  // Os itens acertados ficam visiveis com a explicacao enquanto voce esta na
  // tela de revisao; ao sair, somem de vez.
  if (hash !== '#revisar') revFeitos = {};
  var m = hash.match(/^#topic\\/(\\d{2})(?:\\/(\\w+))?/);
  if (m){
    renderTopic(m[1], m[2] || 'estudo');
    window.scrollTo(0, 0);
    aplicarFoco();
  } else if (hash === '#sync'){
    location.replace(location.pathname + location.search.replace(/([?&])p=[^&]*/g, '$1').replace(/[?&]$/, '') + '#nuvem');
    return;
  } else if (hash === '#nuvem'){
    renderNuvem();
  } else if (hash === '#simulado'){
    renderSimulado();
  } else if (hash === '#revisar'){
    renderRevisar();
  } else if (hash === '#busca'){
    renderBusca();
  } else {
    renderHome();
  }
}
window.addEventListener('hashchange', route);

/* Links antigos ?p= carregavam progresso no aparelho ao abrir. Agora apenas
   removemos o parâmetro e mostramos a tela de nuvem: nenhum dado é importado,
   sobrescrito ou apagado. */
(function(){
  if (/[?&]p=[A-Za-z0-9_-]+/.test(location.search)) {
    var clean = location.search.replace(/([?&])p=[^&]*/g, '$1').replace(/[?&]$/, '');
    history.replaceState(null, '', location.pathname + clean + '#nuvem');
    window.setTimeout(function(){ alert('Este link usava a transferência antiga de progresso, que foi desativada. Nada foi importado ou alterado. Seu progresso local permanece neste aparelho; use a sincronização na nuvem com uma conta aprovada.'); }, 0);
  }
  route();
})();

/* Service worker: leitura offline depois da primeira visita. So faz sentido
   sob http(s) — em file:// o arquivo ja e local. */
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  });
}
</script>
</body>
</html>`;

  const finalHtml = html.replace('READMEHTML', JSON.stringify(readmeHtml));

  writeFileSync(join(dir, 'index.html'), finalHtml, 'utf8');

  // Manifest: caminhos relativos para o site continuar portátil em subpasta.
  const manifest = {
    name: `${site.title} — Estudos`,
    short_name: site.short,
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait-primary',
    lang: 'pt-BR',
    dir: 'ltr',
    background_color: BG_LIGHT,
    theme_color: site.accent,
    description: `Material de estudo e quiz de ${site.title}.`,
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2), 'utf8');

  // Cache versionado pelo conteúdo: rebuild novo ⇒ sw.js novo ⇒ cache novo.
  const version = (fnv1a(finalHtml) >>> 0).toString(36);
  const sw = `// Gerado por build-site.mjs — não editar à mão.
const CACHE = 'estudos-${site.folder}-${version}';
// Só apaga caches DESTE app (mesmo prefixo). Outros projetos no mesmo domínio
// (ex.: /estudos) têm os próprios caches e não são tocados.
const CACHE_PREFIX = 'estudos-${site.folder}-';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: abre instantâneo (e offline), mas busca a versão
// nova em segundo plano para a próxima abertura.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Links de importação de progresso (?p=) e de cache-busting (?v=) apontam para
  // o mesmo documento. Sem normalizar, cada variação guardaria uma cópia de
  // ~600 KB no cache.
  const key = url.search ? new Request(url.origin + url.pathname, { headers: e.request.headers }) : e.request;
  e.respondWith(
    caches.match(key).then((cached) => {
      const net = fetch(e.request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
`;
  writeFileSync(join(dir, 'sw.js'), sw, 'utf8');

  writeFileSync(join(dir, 'icon-192.png'), makeIcon(192, site.accent, site.icon));
  writeFileSync(join(dir, 'icon-512.png'), makeIcon(512, site.accent, site.icon));
  writeFileSync(join(dir, 'apple-touch-icon-180.png'), makeIcon(180, site.accent, site.icon));

  console.log(
    `✔ ${site.folder}/ — ${topics.length} temas, ${totalQuestions} abertas, ${totalQuiz} quiz, ` +
      `${(finalHtml.length / 1024).toFixed(0)} KB (v ${version})`
  );

  for (const t of topics) {
    if (t.cards.length === 0) console.warn(`  ⚠ tema ${t.id} sem questões abertas`);
    if (t.quiz.length === 0) console.warn(`  ⚠ tema ${t.id} sem quiz`);
  }
  auditarQuiz(site.folder, quizBank).forEach((e) => errosAuditoria.push(`${site.folder}: ${e}`));

  return { totalQuestions, totalQuiz, topics: topics.length };
}

/* ================================ hub da raiz ================================ */

function buildHub(stats) {
  const cards = SITES.map((s, i) => {
    const st = stats[i];
    return `    <a class="hub-card" href="./${s.folder}/" style="--c:${s.accent};--cd:${s.accentDark}">
      <span class="hub-top"><span class="hub-em">${s.emoji}</span><span class="hub-pill">${st.topics} ${st.topics === 1 ? 'tema' : 'temas'}</span></span>
      <span class="hub-t">${s.title}</span>
      <span class="hub-s">Resumos conceituais, prática guiada e revisão espaçada.</span>
      <span class="hub-meta"><b>${st.totalQuestions}</b> abertas <i>•</i> <b>${st.totalQuiz}</b> de múltipla escolha</span>
      <span class="hub-go">Entrar na trilha <b>→</b></span>
    </a>`;
  }).join('\n');

  const hubTitle = `Estudos — ${SITES.map((s) => s.title).join(' & ')}`;
  const glows = SITES
    .map((s, i) => `radial-gradient(circle at ${i % 2 ? '84% 82%' : '16% 12%'},${s.accent}18,transparent 30rem)`)
    .join(',');
  const hubMax = SITES.length > 1 ? 900 : 620;
  const hubCols = SITES.length > 1 ? '1fr 1fr' : '1fr';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${BG_LIGHT}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${BG_DARK}" media="(prefers-color-scheme: dark)">
<title>${hubTitle}</title>
<style>
:root{color-scheme:light dark;--bg:${BG_LIGHT};--panel:#fff;--text:#0f172a;--muted:#64748b;--border:#dbe4ef}
@media (prefers-color-scheme:dark){:root{--bg:${BG_DARK};--panel:#111a2e;--text:#e6edf7;--muted:#9aa9bd;--border:#24314a}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;
  background:${glows},var(--bg);
  color:var(--text);font-family:Inter,'Segoe UI',system-ui,-apple-system,sans-serif;
  padding:42px 20px calc(42px + env(safe-area-inset-bottom));line-height:1.6}
.wrap{width:100%;max-width:${hubMax}px}
.eyebrow{text-align:center;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:700;font-size:.72em}
h1{font-size:clamp(1.8em,5vw,2.75em);line-height:1.15;margin:.3em 0 .25em;text-align:center;letter-spacing:-.035em}
.sub{color:var(--muted);text-align:center;margin:0 auto 34px;font-size:1em;max-width:560px}
.tracks{display:grid;grid-template-columns:${hubCols};gap:18px}
.hub-card{display:flex;flex-direction:column;min-height:280px;background:color-mix(in srgb,var(--panel) 94%,transparent);
  border:1px solid var(--border);border-top:4px solid var(--c);border-radius:20px;padding:24px;text-decoration:none;color:inherit;
  box-shadow:0 18px 45px rgba(15,23,42,.08);transition:transform .16s,border-color .16s,box-shadow .16s;backdrop-filter:blur(16px)}
@media (prefers-color-scheme:dark){.hub-card{border-top-color:var(--cd);box-shadow:0 18px 45px rgba(0,0,0,.24)}}
@media (hover:hover){.hub-card:hover{transform:translateY(-4px);box-shadow:0 24px 54px rgba(15,23,42,.14)}}
.hub-card:active{transform:scale(.99)}
.hub-top{display:flex;justify-content:space-between;align-items:center}.hub-em{font-size:2.15em}
.hub-pill{font-size:.72em;font-weight:700;color:var(--muted);border:1px solid var(--border);border-radius:99px;padding:5px 9px}
.hub-t{font-size:1.35em;font-weight:800;display:block;margin-top:18px}
.hub-s{color:var(--muted);font-size:.9em;display:block;margin-top:5px}
.hub-meta{color:var(--muted);font-size:.82em;display:block;margin-top:16px}.hub-meta b{color:var(--text)}.hub-meta i{margin:0 5px}
.hub-go{color:var(--c);font-weight:700;font-size:.9em;display:block;margin-top:auto;padding-top:22px}.hub-go b{font-size:1.2em}
@media (prefers-color-scheme:dark){.hub-go{color:var(--cd)}}
.foot{color:var(--muted);font-size:.8em;text-align:center;margin-top:26px;line-height:1.7}
@media(max-width:680px){.tracks{grid-template-columns:1fr}.hub-card{min-height:235px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Estudo orientado por prática</div>
  <h1>📚 Material de Estudos</h1>
  <p class="sub">Escolha uma trilha, teste o que você sabe e deixe a revisão espaçada indicar o próximo passo.</p>
  <div class="tracks">
${cards}
  </div>
  <p class="foot">Cada área abre um app próprio, que pode ser instalado na tela de início<br>e funciona offline depois da primeira visita.</p>
</div>
</body>
</html>`;
  writeFileSync(join(ROOT, 'index.html'), html, 'utf8');
  console.log(`✔ index.html (hub da raiz)`);
}

/* ================================ execução ================================ */

const stats = SITES.map((s) => buildSite(s));
buildHub(stats);

if (errosAuditoria.length) {
  console.error(
    `\n✖ Auditoria do quiz reprovada — ${errosAuditoria.length} erro(s) de balanceamento das alternativas.`
  );
  process.exit(1);
}
console.log('\nPronto. Abra index.html na raiz, ou publique a pasta inteira.');
