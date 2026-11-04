/* ==========================================================================
   DNN.Themes.Bond — auth restyle (login + reset password)
   Hides the native DNN auth forms and "clothes" them in a new flex-styled
   card. The card mirrors the native fields and triggers the original (hidden)
   controls, so all of DNN's postback + validation wiring keeps working.
   Both forms reuse the same .bond-login visual component (see login.css).
   Selectors use [id$="..."] (ends-with) because DNN prefixes control ids with
   a per-module container id that varies between portals/pages.
   ========================================================================== */
(function () {
    'use strict';

    var NATIVE_HIDDEN = 'bond-login-native--hidden';
    var hooked = false;

    // Collapse whitespace and trim; fall back when the element is missing.
    function text(el, fallback) {
        if (!el) { return fallback; }
        var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return t || fallback;
    }

    function make(tag, cls) {
        var node = document.createElement(tag);
        if (cls) { node.className = cls; }
        return node;
    }

    // Build one labelled input that mirrors its value into the native field.
    function field(labelText, original, type, autocomplete) {
        var wrap = make('div', 'bond-login__field');

        var input = make('input', 'bond-login__input');
        input.type = type;
        input.id = (original.id || 'bond-login-' + type) + '_bond';
        input.autocomplete = autocomplete;
        input.value = original.value || '';

        var label = make('label', 'bond-login__label');
        label.htmlFor = input.id;
        label.textContent = labelText;

        // Keep the hidden native input in sync as the user types.
        input.addEventListener('input', function () { original.value = input.value; });

        wrap.appendChild(label);
        wrap.appendChild(input);
        return { wrap: wrap, input: input, original: original };
    }

    // Card shell: a centered .bond-login wrapper + card with a heading group.
    // `kind` tags the wrapper so each builder cleans up only its own card.
    function makeCard(kind, titleText, subtitleText) {
        var box = make('div', 'bond-login');
        box.setAttribute('data-bond-auth', kind);

        var card = make('div', 'bond-login__card');
        box.appendChild(card);

        var header = make('div', 'bond-login__header');
        card.appendChild(header);

        var title = make('div', 'bond-login__title');
        title.textContent = titleText;
        header.appendChild(title);

        if (subtitleText) {
            var subtitle = make('div', 'bond-login__subtitle');
            subtitle.textContent = subtitleText;
            header.appendChild(subtitle);
        }
        return { box: box, card: card };
    }

    function submitButton(label) {
        var btn = make('button', 'bond-login__submit');
        btn.type = 'button';
        btn.textContent = label;
        return btn;
    }

    // Clone a native anchor (reset/cancel) into a styled link, or null.
    function linkTo(original, fallback) {
        if (!original || !original.href) { return null; }
        var a = make('a', 'bond-login__link');
        a.href = original.href;
        a.textContent = text(original, fallback);
        return a;
    }

    function enterToSubmit(input, action) {
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); action(); }
        });
    }

    function removeExisting(kind) {
        var prev = document.querySelector('.bond-login[data-bond-auth="' + kind + '"]');
        if (prev && prev.parentNode) { prev.parentNode.removeChild(prev); }
    }

    /* ===== Login ===== */
    function buildLogin() {
        var service = document.querySelector('.dnnLoginService');
        if (!service) { return; }                  // not a login page

        var origUser = service.querySelector('input[id$="_txtUsername"]');
        var origPass = service.querySelector('input[id$="_txtPassword"]');
        if (!origUser || !origPass) { return; }     // unexpected markup → leave native form alone

        var origRemember = service.querySelector('input[id$="_chkCookie"]');
        var origLogin    = service.querySelector('a[id$="_cmdLogin"]');
        var origReset    = service.querySelector('a[id$="_passwordLink"]');
        var origCancel   = service.querySelector('a[id$="_cancelLink"]');

        removeExisting('login');

        var built = makeCard('login', 'Welcome back', 'Sign in to continue to your account.');
        var card = built.card;

        var userLbl = text(service.querySelector('label[id$="_plUsername"]'), 'Username');
        var passLbl = text(service.querySelector('label[id$="_plPassword"]'), 'Password');

        var user = field(userLbl, origUser, 'text', 'username');
        var pass = field(passLbl, origPass, 'password', 'current-password');
        card.appendChild(user.wrap);
        card.appendChild(pass.wrap);

        // Remember me + reset link row
        var row = make('div', 'bond-login__row');
        if (origRemember) {
            var remLabel = make('label', 'bond-login__remember');
            var rem = make('input', 'bond-login__checkbox');
            rem.type = 'checkbox';
            rem.checked = origRemember.checked;
            rem.addEventListener('change', function () { origRemember.checked = rem.checked; });
            var remText = make('span');
            remText.textContent = text(service.querySelector('label[for$="_chkCookie"]'), 'Remember Login');
            remLabel.appendChild(rem);
            remLabel.appendChild(remText);
            row.appendChild(remLabel);
        }
        var resetLink = linkTo(origReset, 'Reset Password');
        if (resetLink) { row.appendChild(resetLink); }
        if (row.childNodes.length) { card.appendChild(row); }

        var submit = submitButton(text(origLogin, 'Login'));
        card.appendChild(submit);

        function doLogin() {
            origUser.value = user.input.value;
            origPass.value = pass.input.value;
            if (origLogin) { origLogin.click(); }   // fires DNN's __doPostBack
        }
        submit.addEventListener('click', doLogin);
        enterToSubmit(user.input, doLogin);
        enterToSubmit(pass.input, doLogin);

        var cancel = linkTo(origCancel, 'Cancel');
        if (cancel) {
            var footer = make('div', 'bond-login__footer');
            footer.appendChild(cancel);
            card.appendChild(footer);
        }

        service.classList.add(NATIVE_HIDDEN);
        service.parentNode.insertBefore(built.box, service);
    }

    /* ===== Reset password (SendPassword) ===== */
    function buildReset() {
        var form = document.querySelector('.dnnSendPassword');
        if (!form) { return; }                      // not a reset-password page

        var origUser  = form.querySelector('input[id$="_txtUsername"]');
        var origEmail = form.querySelector('input[id$="_txtEmail"]');
        var origSend  = form.querySelector('a[id$="_cmdSendPassword"]');
        var origCancel = form.querySelector('a[id$="_lnkCancel"]');
        if (!origSend || (!origUser && !origEmail)) { return; }

        removeExisting('reset');

        // The native info message makes a good subtitle (DNN localises it).
        var subtitle = text(form.querySelector('.dnnFormInfo'),
            'Enter your account details and we’ll email you a reset link.');

        var built = makeCard('reset', 'Reset password', subtitle);
        var card = built.card;

        var fields = [];
        if (origUser) {
            var uLbl = text(form.querySelector('span[id$="_plUsername_lblLabel"]'), 'User Name');
            var u = field(uLbl, origUser, 'text', 'username');
            card.appendChild(u.wrap);
            fields.push(u);
        }
        if (origEmail) {
            var eLbl = text(form.querySelector('span[id$="_plEmail_lblLabel"]'), 'Email');
            var e = field(eLbl, origEmail, 'email', 'email');
            card.appendChild(e.wrap);
            fields.push(e);
        }

        var send = submitButton(text(origSend, 'Send Reset Link'));
        card.appendChild(send);

        function doSend() {
            for (var i = 0; i < fields.length; i++) {
                fields[i].original.value = fields[i].input.value;
            }
            origSend.click();                        // fires DNN's __doPostBack
        }
        send.addEventListener('click', doSend);
        for (var j = 0; j < fields.length; j++) {
            enterToSubmit(fields[j].input, doSend);
        }

        var cancel = linkTo(origCancel, 'Cancel');
        if (cancel) {
            var footer = make('div', 'bond-login__footer');
            footer.appendChild(cancel);
            card.appendChild(footer);
        }

        form.classList.add(NATIVE_HIDDEN);
        form.parentNode.insertBefore(built.box, form);
    }

    function buildAll() {
        buildLogin();
        buildReset();
    }

    function init() {
        buildAll();
        // DNN renders auth forms inside an UpdatePanel; rebuild after AJAX
        // postbacks re-render them (stale refs + lost hidden class otherwise).
        if (!hooked && window.Sys && Sys.WebForms && Sys.WebForms.PageRequestManager) {
            Sys.WebForms.PageRequestManager.getInstance().add_endRequest(buildAll);
            hooked = true;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
