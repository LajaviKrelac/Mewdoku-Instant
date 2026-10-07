// Owner: app
// Entry (04 §3): window.onerror/unhandledrejection, mount the SVG sprite, create the platform, run
// boot(). FOUNDATION PLACEHOLDER: renders the wordmark only, until the app workstream wires boot().
import './styles/tokens.css';
import './styles/base.css';
import { createPlatform } from '@platform';
import { t } from './i18n';

const root = document.getElementById('app');
if (root) {
  root.dataset.platform = __PLATFORM__;
  root.textContent = '';
  const title = document.createElement('h1');
  title.className = 'placeholder-wordmark';
  title.textContent = t('app.name');
  root.appendChild(title);
}

// Resolving '@platform' here makes both build modes check the alias. The app workstream replaces
// this placeholder with: boot(createPlatform(), root).
void createPlatform;
