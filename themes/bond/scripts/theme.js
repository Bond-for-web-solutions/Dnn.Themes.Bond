// DNN.Themes.Bond - theme bundle entry (-> resources/js/theme.js).
// Every initialiser is a no-op when its markup is absent, so one bundle serves
// all layouts and the browser caches it once.
import { onDnnReady } from '@bond/dnn/ready.js';
import { initAuthCard } from '@bond/components/auth-card.js';
import { initHeader } from './header.js';

onDnnReady(initHeader);

initAuthCard({
  loginTitle: 'Welcome back',
  loginSubtitle: 'Sign in to continue to your account.',
  resetTitle: 'Reset password',
  resetSubtitle: 'Enter your account details and we’ll email you a reset link.',
});
