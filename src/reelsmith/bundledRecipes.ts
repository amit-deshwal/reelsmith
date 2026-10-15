// The recipes shipped in /recipes, loaded once. Outside Vite (tsx verifies) the glob is unavailable and the list is empty.
import { loadCatalog } from './catalog';

const raw = (typeof import.meta.env === 'undefined'
  ? {}
  : import.meta.glob('/recipes/*.recipe.json', { eager: true, query: '?raw', import: 'default' })) as Record<string, string>;

export const bundledCatalog = loadCatalog(raw);
