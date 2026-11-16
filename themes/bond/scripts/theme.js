// DNN.Themes.Bond - theme bundle entry (-> resources/js/theme.js).
// Every initialiser is a no-op when its markup is absent, so one bundle serves
// all layouts and the browser caches it once.
import { onDnnReady } from '@bond/dnn/ready.js';
import { initAuthCard } from '@bond/components/auth-card.js';
import { initHeader, initCompactHeader } from './header.js';
import { initReveal } from './reveal.js';
import { initGtm } from './gtm.js';

onDnnReady(initHeader);
onDnnReady(initCompactHeader);
onDnnReady(initReveal);
initGtm();

// Huisstijl 2027: Dutch, je-vorm, no exclamation marks.
initAuthCard({
  loginTitle: 'Welkom terug',
  loginSubtitle: 'Log in om verder te gaan.',
  resetTitle: 'Nieuw wachtwoord',
  resetSubtitle: 'Vul je gegevens in. We mailen je een link om een nieuw wachtwoord te kiezen.',
});
