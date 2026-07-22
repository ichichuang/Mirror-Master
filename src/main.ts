import './styles/tokens.css';
import './styles/base.css';
import './styles/page.css';

import { renderApp } from './app';
import { mountLocalImageInput } from './features/local-image-input/localImageInput';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Mirror Master bootstrap failed: missing #app element.');
}

app.innerHTML = renderApp();

const imageInputRoot = app.querySelector<HTMLElement>('[data-local-image-input]');

if (!imageInputRoot) {
  throw new Error('Mirror Master bootstrap failed: missing local image input root.');
}

mountLocalImageInput(imageInputRoot);
