import type { Plugin } from 'vite';
import { deleteUserRecipe, listUserRecipes, saveUserRecipe } from './user-recipes.ts';
import { readJsonBody, sendJson } from '../plugins/export-http.ts';

export function userRecipesPlugin(): Plugin {
  return {
    name: 'reelsmith-user-recipes',
    configureServer(server) {
      server.middlewares.use('/api/reelsmith/user-recipes', async (req, res) => {
        try {
          if (req.method === 'GET') { sendJson(res, 200, await listUserRecipes()); return; }
          if (req.method !== 'POST' && req.method !== 'DELETE') { sendJson(res, 405, { error: 'use GET, POST, or DELETE' }); return; }
          const body = await readJsonBody(req) as Record<string, unknown>;
          if (req.method === 'POST') {
            const recipe = await saveUserRecipe(body.recipe, body.replace === true);
            sendJson(res, 200, { recipe }); return;
          }
          if (typeof body.id !== 'string') { sendJson(res, 400, { error: 'id is required' }); return; }
          sendJson(res, 200, { deleted: await deleteUserRecipe(body.id) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          sendJson(res, 400, { error: message });
        }
      });
    },
  };
}
