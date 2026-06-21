import './styles/base.css';
import { applyTheme } from './theme/applyTheme';
import { activeTheme } from './theme/tokens';
import { WorkerClient } from './worker/client';
import { createStore } from './state/store';
import { mountApp } from './ui/view';

applyTheme(activeTheme);

const worker = new WorkerClient();
const store = createStore(worker);

const root = document.querySelector<HTMLDivElement>('#app')!;
mountApp(root, store);

void store.init();
