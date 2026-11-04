/* ==========================================================================
   bond-auth - progressive enhancement of DNN's login + reset-password forms.
   Migrated from DNN.Themes.Bond resources/js/login.js (behaviour unchanged):
   hides the native forms and "clothes" them in a card that mirrors values
   into the original (hidden) controls and clicks the original buttons, so all
   of DNN's postback, validation and auth-provider wiring keeps working.
   If the native markup is not what we expect we do nothing (fail open).
   Selectors use [id$="..."] because DNN prefixes ids with the module
   container id (dnn_ctr123_Login_Login_DNN_txtUsername).
   Security: text only (textContent / properties); never innerHTML.
   ========================================================================== */
import { onDnnReady } from '@bond/dnn/ready.js';

const NATIVE_HIDDEN = 'bond-auth__native--hidden';

const DEFAULT_TEXT = {
  loginTitle: 'Sign in',
  loginSubtitle: '',
  resetTitle: 'Reset password',
  resetSubtitle: 'Enter your account details and we will email you a reset link.',
};

// Collapse whitespace and trim; fall back when the element is missing/empty.
function text(el, fallback) {
  if (!el) return fallback;
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return t || fallback;
}

function make(tag, cls) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  return node;
}

// One labelled input that mirrors its value into the native field.
function field(labelText, original, type, autocomplete) {
  const wrap = make('div', 'bond-field');
  const input = make('input', 'bond-field__input');
  input.type = type;
  input.id = `${original.id || `bond-auth-${type}`}_bond`;
  input.autocomplete = autocomplete;
  input.value = original.value || '';
  const label = make('label', 'bond-field__label');
  label.htmlFor = input.id;
  label.textContent = labelText;
  input.addEventListener('input', () => { original.value = input.value; });
  wrap.append(label, input);
  return { wrap, input, original };
}

function makeCard(kind, titleText, subtitleText) {
  const box = make('div', 'bond-auth');
  box.setAttribute('data-bond-auth', kind);
  const card = make('div', 'bond-card bond-auth__card');
  const header = make('div', 'bond-auth__header');
  const title = make('div', 'bond-auth__title');
  title.textContent = titleText;
  header.append(title);
  if (subtitleText) {
    const subtitle = make('div', 'bond-auth__subtitle');
    subtitle.textContent = subtitleText;
    header.append(subtitle);
  }
  card.append(header);
  box.append(card);
  return { box, card };
}

function submitButton(label) {
  const btn = make('button', 'bond-button bond-button--block');
  btn.type = 'button';
  btn.textContent = label;
  return btn;
}

// Clone a native anchor (reset/cancel) into a styled link, or null.
// Only http(s) / relative hrefs are copied - never javascript: URLs.
function linkTo(original, fallback) {
  if (!original || !original.href) return null;
  try {
    if (!['http:', 'https:'].includes(new URL(original.href, document.baseURI).protocol)) return null;
  } catch { return null; }
  const a = make('a', 'bond-auth__link');
  a.href = original.href;
  a.textContent = text(original, fallback);
  return a;
}

function enterToSubmit(input, action) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); action(); }
  });
}

function removeExisting(kind) {
  const prev = document.querySelector(`.bond-auth[data-bond-auth="${kind}"]`);
  if (prev) prev.remove();
}

function appendFooterLinks(card, links) {
  const made = links.map(([original, fallback]) => linkTo(original, fallback)).filter(Boolean);
  if (!made.length) return;
  const footer = make('div', 'bond-auth__footer');
  footer.append(...made);
  card.append(footer);
}

// Fail open: if DNN renders controls the card does not mirror (captcha,
// verification code, provider-specific fields), leave the native form alone
// rather than hiding something the user needs.
function hasUnmirroredControls(form, mirrored) {
  return [...form.querySelectorAll('input, select, textarea')]
    .some((el) => el.type !== 'hidden' && !mirrored.includes(el));
}

// Hidden for everyone (display:none, out of the tab order and accessibility
// tree) but still in the DOM, so DNN's postback and validators keep working.
function hideNative(form) {
  form.classList.add(NATIVE_HIDDEN);
  form.hidden = true;
}

/* ===== Login ===== */
function buildLogin(t) {
  const service = document.querySelector('.dnnLoginService');
  if (!service) return;                                   // not a login page
  const origUser = service.querySelector('input[id$="_txtUsername"]');
  const origPass = service.querySelector('input[id$="_txtPassword"]');
  if (!origUser || !origPass) return;                     // unexpected markup -> leave native form alone
  const origRemember = service.querySelector('input[id$="_chkCookie"]');
  const origLogin = service.querySelector('a[id$="_cmdLogin"]');
  const origReset = service.querySelector('a[id$="_passwordLink"]');
  const origCancel = service.querySelector('a[id$="_cancelLink"]');
  const origRegister = service.querySelector('a[id$="_registerLink"]');
  if (!origLogin || hasUnmirroredControls(service, [origUser, origPass, origRemember])) return;

  removeExisting('login');
  const { box, card } = makeCard('login', t.loginTitle, t.loginSubtitle);

  const user = field(text(service.querySelector('label[id$="_plUsername"]'), 'Username'), origUser, 'text', 'username');
  const pass = field(text(service.querySelector('label[id$="_plPassword"]'), 'Password'), origPass, 'password', 'current-password');
  card.append(user.wrap, pass.wrap);

  const row = make('div', 'bond-auth__row');
  if (origRemember) {
    const remLabel = make('label', 'bond-auth__remember');
    const rem = make('input', 'bond-auth__checkbox');
    rem.type = 'checkbox';
    rem.checked = origRemember.checked;
    rem.addEventListener('change', () => { origRemember.checked = rem.checked; });
    const remText = make('span');
    remText.textContent = text(service.querySelector('label[for$="_chkCookie"]'), 'Remember Login');
    remLabel.append(rem, remText);
    row.append(remLabel);
  }
  const resetLink = linkTo(origReset, 'Reset Password');
  if (resetLink) row.append(resetLink);
  if (row.childNodes.length) card.append(row);

  const submit = submitButton(text(origLogin, 'Login'));
  card.append(submit);
  const doLogin = () => {
    origUser.value = user.input.value;
    origPass.value = pass.input.value;
    origLogin.click();                                    // fires DNN's __doPostBack
  };
  submit.addEventListener('click', doLogin);
  enterToSubmit(user.input, doLogin);
  enterToSubmit(pass.input, doLogin);
  appendFooterLinks(card, [[origRegister, 'Register'], [origCancel, 'Cancel']]);

  hideNative(service);
  service.before(box);
}

/* ===== Reset password (SendPassword) ===== */
function buildReset(t) {
  const form = document.querySelector('.dnnSendPassword');
  if (!form) return;
  const origUser = form.querySelector('input[id$="_txtUsername"]');
  const origEmail = form.querySelector('input[id$="_txtEmail"]');
  const origSend = form.querySelector('a[id$="_cmdSendPassword"]');
  const origCancel = form.querySelector('a[id$="_lnkCancel"]');
  if (!origSend || (!origUser && !origEmail)) return;
  if (hasUnmirroredControls(form, [origUser, origEmail])) return;

  removeExisting('reset');
  // DNN's localised info message makes a good subtitle.
  const { box, card } = makeCard('reset', t.resetTitle, text(form.querySelector('.dnnFormInfo'), t.resetSubtitle));
  const fields = [];
  if (origUser) {
    const u = field(text(form.querySelector('span[id$="_plUsername_lblLabel"]'), 'User Name'), origUser, 'text', 'username');
    card.append(u.wrap); fields.push(u);
  }
  if (origEmail) {
    const e = field(text(form.querySelector('span[id$="_plEmail_lblLabel"]'), 'Email'), origEmail, 'email', 'email');
    card.append(e.wrap); fields.push(e);
  }
  const send = submitButton(text(origSend, 'Send Reset Link'));
  card.append(send);
  const doSend = () => {
    for (const f of fields) f.original.value = f.input.value;
    origSend.click();                                     // fires DNN's __doPostBack
  };
  send.addEventListener('click', doSend);
  for (const f of fields) enterToSubmit(f.input, doSend);
  appendFooterLinks(card, [[origCancel, 'Cancel']]);

  hideNative(form);
  form.before(box);
}

/**
 * Enhance DNN's login / reset-password forms on this page (no-op elsewhere).
 * Safe to call on every page: it returns immediately when the forms are absent.
 * @param {Partial<typeof DEFAULT_TEXT>} [strings] theme-specific copy
 */
export function initAuthCard(strings = {}) {
  const t = { ...DEFAULT_TEXT, ...strings };
  onDnnReady(() => { buildLogin(t); buildReset(t); });
}
