// Static validation of staged DNN runtime files (layouts, partials, containers,
// DDRMenu templates). Each rule maps to a real DNN failure mode - see
// docs/dnn-integration.md#validation-rules.
//
// Checks run per physical file (so line numbers point at the right partial);
// aggregate rules (one Control directive, a ContentPane, registered tags) are
// evaluated over the layout plus everything it includes.
import fs from 'node:fs';
import path from 'node:path';
import { lineCol } from './util.mjs';

// Tags provided by namespace registrations used in DNN skins.
const NAMESPACE_TAGS = {
  'DotNetNuke.Web.Client.ClientResourceManagement': ['DnnCssInclude', 'DnnJsInclude', 'DnnCssExclude', 'DnnJsExclude', 'DnnHtmlInclude'],
  'DotNetNuke.Web.DDRMenu.TemplateEngine': ['TemplateArgument'],
};
const PANE_TAGS = 'div|td|span|p|section|header|footer|main|article|aside';

function attrs(tagText) {
  const out = {};
  for (const m of tagText.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1].toLowerCase()] = m[2];
  return out;
}

/** Ordered list of files reachable through `<!--#include file="..." -->`, starting with relFile. */
export function includeClosure(root, relFile, diag, stack = [], seen = new Set()) {
  if (seen.has(relFile)) return [];
  seen.add(relFile);
  const abs = path.join(root, relFile);
  const text = fs.readFileSync(abs, 'utf8');
  const out = [{ rel: relFile, abs, text }];
  for (const m of text.matchAll(/<!--\s*#include\s+(file|virtual)\s*=\s*"([^"]+)"\s*-->/gi)) {
    const loc = { file: abs, ...lineCol(text, m.index) };
    if (m[1].toLowerCase() === 'virtual') { diag.warn('BOND302', `Virtual include "${m[2]}" points outside the theme and cannot be validated.`, loc); continue; }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(relFile), m[2].replace(/\\/g, '/')));
    if (target.startsWith('..')) { diag.error('BOND303', `Include "${m[2]}" escapes the theme folder.`, loc); continue; }
    const dir = path.join(root, path.posix.dirname(target));
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).includes(path.posix.basename(target))) {
      diag.error('BOND304', `Include "${m[2]}" not found (check letter case).`, loc);
      continue;
    }
    if (stack.includes(target)) { diag.error('BOND301', `Include cycle: ${[...stack, relFile, target].join(' -> ')}`, loc); continue; }
    out.push(...includeClosure(root, target, diag, [...stack, relFile], seen));
  }
  return out;
}

/**
 * Validate one ascx (layout or container) and its includes.
 * @param {'layout'|'container'} kind
 */
export function checkAscx({ root, relFile, kind, diag, stagedFiles, cspLevel, contentPaneOptional = false }) {
  const files = includeClosure(root, relFile, diag);
  const main = files[0];
  const tagNames = new Set();
  const controls = [];
  const paneIds = new Map();

  for (const f of files) {
    const loc = (i) => ({ file: f.abs, ...lineCol(f.text, i) });
    // 1. No code render blocks: DNN injects server controls (meta, CSS/JS includes,
    //    control panel) into skins; ASP.NET then throws "The Controls collection
    //    cannot be modified because the control contains code blocks" and DNN
    //    shows a misleading 503 page.
    for (const m of f.text.matchAll(/<%(?![@-])/g)) {
      diag.error('BOND310', 'Code render block ("<%", "<%=", "<%:", "<%#"). DNN injects controls into skins, which then fails with "Controls collection cannot be modified" (shown as a misleading 503). Use a server control, DnnCssInclude/DnnJsInclude, or CSS instead.', loc(m.index));
    }
    for (const m of f.text.matchAll(/<%@\s*Control\b([^%]*)%>/gi)) controls.push({ a: attrs(m[1]), loc: loc(m.index) });
    for (const m of f.text.matchAll(/<%@\s*Register\b([^%]*)%>/gi)) {
      const a = attrs(m[1]);
      const prefix = (a.tagprefix || '').toLowerCase();
      if (a.tagname) tagNames.add(`${prefix}:${a.tagname.toLowerCase()}`);
      for (const t of NAMESPACE_TAGS[a.namespace] || []) tagNames.add(`${prefix}:${t.toLowerCase()}`);
    }
    for (const m of f.text.matchAll(new RegExp(`<(${PANE_TAGS})\\b([^>]*)>`, 'gi'))) {
      const a = attrs(m[2]);
      if ((a.runat || '').toLowerCase() !== 'server' || !a.id) continue;
      if (paneIds.has(a.id)) diag.error('BOND314', `Duplicate server id "${a.id}".`, loc(m.index));
      paneIds.set(a.id, true);
    }
    if (cspLevel !== 'off') cspScan({ text: f.text, file: f.abs, diag, level: cspLevel });
  }

  // 2. Exactly one Control directive inheriting the right base class.
  const expected = kind === 'layout' ? 'DotNetNuke.UI.Skins.Skin' : 'DotNetNuke.UI.Containers.Container';
  if (controls.length !== 1) diag.error('BOND311', `Expected exactly one <%@ Control %> directive across ${relFile} and its includes (found ${controls.length}).`, { file: main.abs });
  else if ((controls[0].a.inherits || '') !== expected) diag.error('BOND312', `<%@ Control %> must have Inherits="${expected}".`, controls[0].loc);

  // 3. ContentPane.
  if (!paneIds.has('ContentPane')) {
    const msg = 'No <div id="ContentPane" runat="server"> found. DNN places modules whose pane is missing into ContentPane; without one they cannot be shown or added.';
    if (contentPaneOptional) diag.warn('BOND313', `${msg} (allowed by theme.json "layoutsWithoutContentPane")`, { file: main.abs });
    else diag.error('BOND313', msg, { file: main.abs });
  }

  // 4–6. Tags must be registered; resource includes and menus must resolve.
  for (const f of files) {
    const loc = (i) => ({ file: f.abs, ...lineCol(f.text, i) });
    for (const m of f.text.matchAll(/<(\w+):(\w+)\b([^>]*)>/g)) {
      if (m[1].toLowerCase() === 'asp') continue;
      if (!tagNames.has(`${m[1].toLowerCase()}:${m[2].toLowerCase()}`)) diag.error('BOND315', `<${m[1]}:${m[2]}> is used but not registered (add it to partials/_registers.ascx).`, loc(m.index));
      const a = attrs(m[3]);
      const tag = m[2].toLowerCase();
      if ((tag === 'dnncssinclude' || tag === 'dnnjsinclude') && a.filepath) {
        const fp = a.filepath;
        if ((a.pathnamealias || '').toLowerCase() === 'skinpath') {
          if (fp.toLowerCase() === 'skin.css') diag.error('BOND316', 'skin.css is registered automatically by DNN; including it again loads it twice.', loc(m.index));
          else if (!stagedFiles.has(fp)) diag.error('BOND317', `${m[2]} FilePath="${fp}" does not exist in the staged theme (check letter case).`, loc(m.index));
        } else if (/(^|\/)Skins\//i.test(fp) || /^(~|\/)/.test(fp)) {
          diag.warn('BOND318', `${m[2]} FilePath="${fp}" is outside this theme - a runtime dependency on another extension.`, loc(m.index));
        }
      }
      if (tag === 'menu' && a.menustyle) {
        const def = `${a.menustyle.replace(/\\/g, '/').replace(/\/$/, '')}/menudef.xml`;
        if (!stagedFiles.has(def)) diag.error('BOND319', `MenuStyle="${a.menustyle}" needs ${def} (DDRMenu fails with "Illegal characters in path").`, loc(m.index));
      }
    }
  }
  return { files: files.map((f) => f.rel) };
}

export function cspScan({ text, file, diag, level }) {
  const report = (code, msg, i) => diag.add(level === 'error' ? 'error' : 'warning', code, msg, { file, ...lineCol(text, i) });
  const scan = text.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length)).replace(/@\*[\s\S]*?\*@/g, (c) => ' '.repeat(c.length));
  for (const m of scan.matchAll(/\son[a-z]+\s*=\s*["']/gi)) report('BOND330', `Inline event handler (${m[0].trim()}) blocks a strict Content-Security-Policy; bind events in a bundled script.`, m.index);
  for (const m of scan.matchAll(/<script\b(?![^>]*\bsrc=)/gi)) report('BOND331', 'Inline <script> block; move it into the theme bundle (scripts/).', m.index);
  for (const m of scan.matchAll(/(href|src)\s*=\s*["']\s*javascript:/gi)) report('BOND332', 'javascript: URL; use a <button> or a bundled event handler.', m.index);
}

/** DDRMenu: every menu folder with a template needs menudef.xml whose <template> exists. */
export function checkMenus({ root, diag, stagedFiles, cspLevel }) {
  const dirs = new Set([...stagedFiles].filter((f) => f.startsWith('menus/') && /\.(cshtml|vbhtml|xslt?|html?|txt)$/i.test(f)).map((f) => path.posix.dirname(f)));
  for (const f of stagedFiles) if (f.endsWith('/menudef.xml')) dirs.add(path.posix.dirname(f));
  for (const dir of [...dirs].sort()) {
    const def = `${dir}/menudef.xml`;
    if (!stagedFiles.has(def)) { diag.error('BOND320', `${dir}/ has a menu template but no menudef.xml.`, { file: path.join(root, dir) }); continue; }
    const xml = fs.readFileSync(path.join(root, def), 'utf8');
    const t = /<template>\s*([^<\s]+)\s*<\/template>/i.exec(xml);
    if (!t) diag.error('BOND321', 'menudef.xml has no <template>.', { file: path.join(root, def) });
    else if (!stagedFiles.has(`${dir}/${t[1]}`)) diag.error('BOND322', `menudef.xml template "${t[1]}" not found in ${dir}/ (check letter case).`, { file: path.join(root, def) });
  }
  for (const f of [...stagedFiles].filter((x) => x.endsWith('.cshtml'))) {
    const abs = path.join(root, f);
    const text = fs.readFileSync(abs, 'utf8');
    if (cspLevel !== 'off') cspScan({ text, file: abs, diag, level: cspLevel });
    for (const m of text.matchAll(/@Html\.Raw\s*\(/g)) diag.warn('BOND333', 'Html.Raw bypasses Razor HTML encoding; make sure the value cannot contain user input.', { file: abs, ...lineCol(text, m.index) });
  }
}
