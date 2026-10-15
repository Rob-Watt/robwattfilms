/* Sign in / create account / forgot password — /forum/login/
   Supabase CAPTCHA protection is on, so every sign-up, sign-in, magic-link and
   reset call must carry a Cloudflare Turnstile token (options.captchaToken). */

(function () {
  var F = window.Forum, el = F.el;
  var status = document.getElementById('auth-status');
  var next = F.param('next');
  // Capture how we arrived before Supabase tidies the address bar
  var arrivedFromEmail = /access_token|type=/.test(window.location.hash) || !!(F.param('confirmed') || F.param('via') || F.param('code'));
  var arrivedForReset = F.param('reset') === '1' || /type=recovery/.test(window.location.hash);
  var base = window.location.origin;

  function say(text, kind) {
    status.textContent = text || '';
    status.className = 'forum-msg' + (kind ? ' forum-msg--' + kind : '');
  }

  if (!F.db) { say(F.OFFLINE, 'error'); return; }

  // ---------- tabs ----------
  var tabs = ['signin', 'signup', 'forgot'];
  var panels = ['signin', 'signup', 'forgot', 'newpass', 'signedin'];

  function show(name) {
    panels.forEach(function (p) { document.getElementById('panel-' + p).hidden = p !== name; });
    tabs.forEach(function (t) { document.getElementById('tab-' + t).setAttribute('aria-selected', String(t === name)); });
    document.querySelector('.forum-tabs').hidden = tabs.indexOf(name) === -1;
    var form = document.querySelector('#panel-' + name + ' form');
    if (form) renderCaptcha(form);
    var heading = { signin: 'sign in', signup: 'create account', forgot: 'forgot password', newpass: 'new password', signedin: 'signed in' }[name];
    F.setPage({ heading: heading, crumbs: [{ text: heading }] });
  }

  tabs.forEach(function (t) {
    document.getElementById('tab-' + t).addEventListener('click', function () {
      say('');
      history.replaceState(null, '', window.location.pathname + window.location.search + (t === 'signin' ? '' : '#' + t));
      show(t);
    });
  });

  // ---------- Cloudflare Turnstile ----------
  var turnstileReady = false;
  var widgets = {};   // form id -> widget id
  var tokens = {};    // form id -> token

  window.forumTurnstileReady = function () {
    turnstileReady = true;
    var visible = document.querySelector('.forum-panel:not([hidden]) form');
    if (visible) renderCaptcha(visible);
  };

  function renderCaptcha(form) {
    var box = form.querySelector('[data-captcha]');
    if (!box || !turnstileReady || widgets[form.id] !== undefined) return;
    widgets[form.id] = window.turnstile.render(box, {
      sitekey: F.config.TURNSTILE_SITE_KEY,
      theme: 'light',
      callback: function (t) { tokens[form.id] = t; },
      'expired-callback': function () { tokens[form.id] = null; },
      'error-callback': function () {
        tokens[form.id] = null;
        say('The spam check couldn’t load. Please refresh the page and try again.', 'error');
      }
    });
  }

  function captchaToken(form) {
    return tokens[form.id] || null;
  }

  // Tokens can only be used once, so reset the widget after every attempt
  function resetCaptcha(form) {
    tokens[form.id] = null;
    if (turnstileReady && widgets[form.id] !== undefined) window.turnstile.reset(widgets[form.id]);
  }

  // ---------- helpers ----------
  function busy(form, on) {
    form.querySelectorAll('button').forEach(function (b) { b.disabled = on; });
  }

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function redirectUrl(path) {
    return base + path + (next ? (path.indexOf('?') > -1 ? '&' : '?') + 'next=' + encodeURIComponent(F.safeNext(next)) : '');
  }

  function goOn() {
    F.afterSignIn(next).then(function (href) { window.location.href = href; });
  }

  // ---------- sign in (password or magic link) ----------
  var signinForm = document.getElementById('form-signin');
  var signinAction = 'password';
  signinForm.querySelectorAll('button[data-action]').forEach(function (b) {
    b.addEventListener('click', function () { signinAction = b.getAttribute('data-action'); });
  });

  signinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = signinForm.email.value.trim();
    var password = signinForm.password.value;
    if (!validEmail(email)) { say('Please enter your email address.', 'error'); return; }
    if (signinAction === 'password' && !password) { say('Please enter your password, or choose the email link option.', 'error'); return; }
    var token = captchaToken(signinForm);
    if (!token) { say('Please complete the spam check first.', 'error'); return; }

    busy(signinForm, true);
    say(signinAction === 'magic' ? 'Sending your sign-in link…' : 'Signing in…');

    var call = signinAction === 'magic'
      ? F.db.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, captchaToken: token, emailRedirectTo: redirectUrl('/forum/login/?via=link') } })
      : F.db.auth.signInWithPassword({ email: email, password: password, options: { captchaToken: token } });

    call.then(function (res) {
      busy(signinForm, false);
      resetCaptcha(signinForm);
      if (res.error) { say(F.authError(res.error), 'error'); return; }
      if (signinAction === 'magic') {
        say('Check your email — we’ve sent you a link to sign in. You can close this tab.', 'ok');
        signinForm.reset();
        return;
      }
      say('Signed in.', 'ok');
      goOn();
    });
  });

  // ---------- create account ----------
  var signupForm = document.getElementById('form-signup');
  signupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = signupForm.email.value.trim();
    var password = signupForm.password.value;
    if (!validEmail(email)) { say('Please enter your email address.', 'error'); return; }
    if (password.length < 8) { say('Please use a password of at least 8 characters.', 'error'); return; }
    if (!signupForm.agree.checked) { say('Please agree to the forum rules to create an account.', 'error'); return; }
    var token = captchaToken(signupForm);
    if (!token) { say('Please complete the spam check first.', 'error'); return; }

    busy(signupForm, true);
    say('Creating your account…');
    F.db.auth.signUp({
      email: email,
      password: password,
      options: { captchaToken: token, emailRedirectTo: redirectUrl('/forum/login/?confirmed=1') }
    }).then(function (res) {
      busy(signupForm, false);
      resetCaptcha(signupForm);
      if (res.error) { say(F.authError(res.error), 'error'); return; }
      // Supabase doesn't reveal existing accounts; an empty identities list means "already registered"
      if (res.data.user && res.data.user.identities && res.data.user.identities.length === 0) {
        say('There’s already an account with that email. Sign in instead, or reset your password.', 'error');
        return;
      }
      if (res.data.session) { goOn(); return; }   // email confirmation turned off
      signupForm.reset();
      say('Almost done — we’ve emailed you a confirmation link. Click it to finish creating your account.', 'ok');
    });
  });

  // ---------- forgot password ----------
  var forgotForm = document.getElementById('form-forgot');
  forgotForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = forgotForm.email.value.trim();
    if (!validEmail(email)) { say('Please enter your email address.', 'error'); return; }
    var token = captchaToken(forgotForm);
    if (!token) { say('Please complete the spam check first.', 'error'); return; }

    busy(forgotForm, true);
    say('Sending…');
    F.db.auth.resetPasswordForEmail(email, { captchaToken: token, redirectTo: base + '/forum/login/?reset=1' })
      .then(function (res) {
        busy(forgotForm, false);
        resetCaptcha(forgotForm);
        if (res.error) { say(F.authError(res.error), 'error'); return; }
        forgotForm.reset();
        say('If there’s an account for that email, we’ve sent a link to reset your password.', 'ok');
      });
  });

  // ---------- set a new password (from the reset email) ----------
  var newpassForm = document.getElementById('form-newpass');
  newpassForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var password = newpassForm.password.value;
    if (password.length < 8) { say('Please use a password of at least 8 characters.', 'error'); return; }
    busy(newpassForm, true);
    say('Saving…');
    F.db.auth.updateUser({ password: password }).then(function (res) {
      busy(newpassForm, false);
      if (res.error) { say(F.authError(res.error), 'error'); return; }
      say('Password updated. You’re signed in.', 'ok');
      goOn();
    });
  });

  // ---------- already signed in ----------
  document.getElementById('signedin-out').addEventListener('click', function (e) {
    e.preventDefault();
    F.signOut();
  });

  F.db.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY') { say('Choose a new password.'); show('newpass'); }
  });

  // ---------- decide what to show ----------
  F.getSession().then(function (session) {
    if (session && arrivedForReset) { say('Choose a new password.'); show('newpass'); return; }
    if (session && arrivedFromEmail) {
      say(F.param('confirmed') ? 'Email confirmed — welcome!' : 'Signed in.', 'ok');
      goOn();
      return;
    }
    if (session) {
      F.me().then(function (profile) {
        var link = document.getElementById('signedin-name');
        link.textContent = profile ? profile.username : session.user.email;
        link.href = profile ? F.profileHref(profile.username, F.needsUsername(profile)) : '/forum/';
        show('signedin');
      });
      return;
    }
    if (arrivedFromEmail || arrivedForReset) {
      say('That link has expired or was already used. Please sign in, or ask for a new link.', 'error');
    }
    var hash = window.location.hash.replace('#', '');
    show(tabs.indexOf(hash) > -1 ? hash : 'signin');
  });
})();
