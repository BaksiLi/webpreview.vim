import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const script = dirname(fileURLToPath(import.meta.url));
const root = resolve(script, '../..');
const [plugin, output] = process.argv.slice(2);
assert(plugin && output, 'Usage: node web/demo/record.mjs /path/to/texinsitu.vim /path/to/new-output');
const texinsitu = resolve(plugin);
const folder = resolve(output);
assert(existsSync(join(texinsitu, 'plugin/texinsitu.vim')), 'TeXinsitu checkout required');
mkdirSync(folder);
const shell = readFileSync(join(script, 'layout.html'), 'utf8');
const jobs = [
  { file: 'transitivity.md', name: 'vim-markdown-live-preview' },
  { file: 'correspondence.tex', name: 'vim-latex-pdf-preview-synctex' },
];

async function until(check, message) {
  const deadline = Date.now() + 12000;
  for (;;) {
    try {
      if (await check()) return;
    } catch (error) {
      // Vim can briefly unlink an existing snapshot while replacing it.
      if (error.code !== 'ENOENT') throw error;
    }
    assert(Date.now() < deadline, message);
    await delay(50);
  }
}

async function record(browser, { file, name }) {
  const work = join(folder, name);
  mkdirSync(work);
  const at = path => join(work, path);
  const read = path => readFileSync(at(path), 'utf8');
  const json = path => JSON.parse(read(path));
  const tex = file.endsWith('.tex');
  const copy = path => copyFileSync(join(root, 'doc/examples', path), at(path));
  copy(file);
  if (tex) {
    copy('correspondence.base.tex');
    execFileSync('latexmk', ['-pdf', '-synctex=1', '-interaction=nonstopmode', '-halt-on-error', file], { cwd: work });
  }
  const original = read(file);
  const vim = spawn(process.env.DEMO_VIM || 'vim', ['-Nu', 'NONE', '-i', 'NONE', '-n', '-es', '-S', join(script, 'terminal.vim')], {
    cwd: work, stdio: 'ignore',
    env: { ...process.env, DEMO_SCRIPT: script, DEMO_PACKAGE: root, DEMO_TEXINSITU: texinsitu, DEMO_FILE: file },
  });
  const closed = new Promise((accept, reject) => { vim.once('error', reject); vim.once('close', accept); });
  async function command(request) {
    await until(() => !existsSync(at('request')), 'Vim accepts requests');
    writeFileSync(at('request.tmp'), JSON.stringify(request));
    renameSync(at('request.tmp'), at('request'));
  }
  const page = await browser.newPage({ viewport: { width: 1400, height: 644 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const timeline = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await until(() => existsSync(at('reader.url')), 'Vim opens a WebPreview session');
    const url = read('reader.url').trim();
    const captureUrl = new URL('/_recording', url).href;
    await page.route(captureUrl, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: shell }));
    await page.goto(captureUrl);
    await page.evaluate(({ file, url }) => {
      document.querySelector('#filename').textContent = file;
      document.querySelector('iframe').src = url;
    }, { file, url });
    const frame = page.frameLocator('iframe');
    const source = frame.locator('#source');
    const reader = page.locator('iframe');
    const point = async locator => {
      const box = await locator.boundingBox();
      assert(box, 'capture target visible');
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    const capture = async (seconds, direction, caption, pointer) => {
      rmSync(at('screen.json'), { force: true });
      await command({ screen: true });
      await until(() => existsSync(at('screen.json')), 'Vim terminal cells available');
      const screen = json('screen.json');
      await page.evaluate(({ screen, direction, caption, pointer }) => {
        const editor = document.querySelector('#editor');
        editor.replaceChildren(...screen.rows.map(row => {
          const line = document.createElement('div');
          line.className = 'row';
          for (const cell of row) {
            const box = document.createElement('span');
            box.className = 'cell';
            Object.assign(box.style, { width: cell.width * 8.5 + 'px', color: cell.fg, background: cell.bg });
            const glyph = document.createElement('span');
            glyph.className = 'glyph';
            glyph.textContent = cell.chars || ' ';
            box.append(glyph);
            line.append(box);
          }
          return line;
        }));
        // Preserve Vim's column widths even when the browser uses a fallback glyph.
        for (const glyph of editor.querySelectorAll('.glyph')) {
          const expected = glyph.parentElement.getBoundingClientRect().width;
          const actual = glyph.getBoundingClientRect().width;
          if (actual > expected) {
            glyph.style.transformOrigin = 'left center';
            glyph.style.transform = `scaleX(${expected / actual})`;
          }
        }
        const [line, column, state] = screen.cursor;
        if (state.visible) {
          const cursor = document.createElement('div');
          cursor.id = 'cursor';
          cursor.style.top = 8 + (line - 1) * 21 + 'px';
          cursor.style.left = 8 + (column - 1) * 8.5 + 'px';
          editor.append(cursor);
        }
        document.querySelector('#direction').textContent = direction;
        document.querySelector('#caption').textContent = caption;
        const marker = document.querySelector('#pointer');
        marker.style.display = pointer ? 'block' : 'none';
        if (pointer) Object.assign(marker.style, { left: pointer.x + 'px', top: pointer.y + 'px' });
      }, { screen, direction, caption, pointer });
      const png = 'frame-' + String(timeline.length).padStart(2, '0') + '.png';
      await page.screenshot({ path: at(png) });
      timeline.push({ png, seconds });
      return screen.rows.flat().map(cell => cell.chars).join('');
    };

    if (tex) {
      const sentence = 'The inclusion holds at every world.';
      const line = original.split('\n').indexOf(sentence) + 1;
      const passage = frame.locator('.textLayer span').filter({ hasText: sentence }).first();
      await passage.waitFor();
      await until(() => json('editor.json').line !== line, 'Vim starts away from the lookup target');
      const cells = await capture(0.9, '↔', 'LaTeX · rendered in Vim and built for the browser');
      assert(cells.includes('⋃'), 'TeXinsitu renders the indexed union before recording');
      await source.click();
      const target = await point(passage);
      await capture(0.6, '←', 'Click the PDF passage', target);
      await page.mouse.click(target.x, target.y);
      await until(() => json('editor.json').line === line, 'SyncTeX locates the source line');
      const notice = frame.locator('#status');
      await notice.filter({ hasText: 'Sent to source editor' }).waitFor();
      await capture(0.65, '←', 'SyncTeX brings you to the source');
      await notice.waitFor({ state: 'hidden' });
      await capture(0.6, '←', 'SyncTeX brings you to the source');
      await command({ keys: ':WebPreviewChanges\r' });
      await frame.locator('#changes[aria-pressed=true]').waitFor();
      await frame.locator('.textLayer span').filter({ hasText: /initial/ }).first().waitFor();
      const detail = frame.locator('#change-close');
      if (await detail.isVisible()) await detail.click();
      await capture(1.9, '→', 'Review additions and deletions in the same tab');
      await reader.screenshot({ path: join(folder, 'changes.png') });
    } else {
      const diagram = frame.locator('.wp-diagram img');
      const ruby = frame.locator('ruby').first();
      await diagram.waitFor();
      await diagram.evaluate(img => img.decode());
      const initial = await diagram.getAttribute('src');
      await capture(0.85, '→', 'Markdown · a Mermaid diagram and a CJK annotation');
      const edgeLine = original.split('\n').indexOf('  b --> c["c：p 為假"]') + 1;
      await command({ keys: edgeLine + 'Go  a --> c' });
      await until(() => json('editor.json').modified === 1, 'Vim edits an unsaved draft');
      await until(async () => await diagram.getAttribute('src') !== initial, 'Pele redraws the missing edge');
      await diagram.evaluate(img => img.decode());
      await capture(1.0, '→', 'Add the missing edge · no save needed');
      await command({ keys: '\u001b' });
      await reader.screenshot({ path: join(folder, 'preview.png') });
      await page.emulateMedia({ colorScheme:'dark' });
      await frame.locator('html[data-theme=dark]').waitFor();
      await reader.screenshot({ path: join(folder, 'preview-dark.png') });
      await page.emulateMedia({ colorScheme:'light' });
      await frame.locator('html[data-theme=light]').waitFor();
      const annotation = await ruby.boundingBox();
      await page.screenshot({ path: join(folder, 'annotation.png'), clip: {
        x: Math.floor(annotation.x), y: Math.floor(annotation.y - 12),
        width: Math.ceil(annotation.width), height: Math.ceil(annotation.height + 20),
      } });
      await ruby.evaluate(node => {
        const selection = getSelection(), range = document.createRange();
        range.selectNode(node);
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await frame.getByRole('button', { name: 'Select in source' }).waitFor();
      await capture(0.65, '←', 'Send the annotated phrase back to Vim', await point(source));
      await source.click();
      await until(() => json('editor.json').mode === 'v', 'Browser selects Markdown source in Vim');
      await until(() => json('editor.json').selection === '[可達關係]^^(Accessibility)', 'Vim selects the exact annotation markup');
      const notice = frame.locator('#notice');
      await notice.filter({ hasText: 'Sent to source editor' }).waitFor();
      await capture(0.7, '←', 'Vim selects the original annotation markup');
      await notice.waitFor({ state: 'hidden' });
      await capture(1.45, '←', 'Vim selects the original annotation markup');
    }
    assert.equal(read(file), original, 'Recording leaves the fixture on disk unchanged');
    assert.deepEqual(errors, []);
    const last = timeline.at(-1).png;
    writeFileSync(at('frames.txt'), timeline.map(({ png, seconds }) => `file '${png}'\nduration ${seconds}\n`).join('')
      + `file '${last}'\nduration 0.04\nfile '${last}'\n`);
    const length = timeline.reduce((sum, entry) => sum + entry.seconds, 0).toFixed(2);
    const encode = (filter, ...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'concat', '-i', 'frames.txt',
      '-t', length, '-vf', filter, ...args], { cwd: work });
    const scale = 'scale=1400:-1:flags=lanczos';
    encode(`fps=12,${scale},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer`, join(folder, name + '.gif'));
    encode(`fps=30,${scale},format=yuv420p`, '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', join(folder, name + '.mp4'));
  } finally {
    await page.close();
    if (vim.exitCode === null && !vim.killed) {
      await command({ keys: '\u001b:qa!\r' });
      if (await Promise.race([closed, delay(3000, 'timeout', { ref: false })]) === 'timeout') vim.kill();
    }
    assert.equal(await closed, 0);
  }
}

const browser = await chromium.launch();
try {
  for (const job of jobs) await record(browser, job);
} finally {
  await browser.close();
}
writeFileSync(join(folder, 'combine.txt'), jobs.map(({ name }) => `file '${name}.mp4'`).join('\n') + '\n');
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'concat', '-i', 'combine.txt', '-c', 'copy', '-movflags', '+faststart', 'workflow.mp4'], { cwd: folder });
console.log(folder);
