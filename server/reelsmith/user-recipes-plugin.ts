import type { Plugin } from 'vite';
import { deleteUserRecipe, listUserRecipes, readUserPreview, saveUserRecipe, writeUserPoster } from './user-recipes.ts';
import { readJsonBody, sendJson } from '../plugins/export-http.ts';
import { mountIdeaRoutes } from './ideas.ts';

export function userRecipesPlugin(): Plugin {
  return {
    name: 'reelsmith-user-recipes',
    configureServer(server) {
      mountIdeaRoutes(server.middlewares);
      server.middlewares.use('/api/reelsmith/user-recipe-previews', async (req, res) => {
        if (req.method === 'POST') {
          try {
            const body = await readJsonBody(req) as Record<string, unknown>;
            if (typeof body.id !== 'string' || typeof body.base64 !== 'string') { sendJson(res, 400, { error: 'id and base64 are required' }); return; }
            sendJson(res, 200, { poster: await writeUserPoster(body.id, body.base64) });
          } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) }); }
          return;
        }
        const preview = req.method === 'GET' ? await readUserPreview(decodeURIComponent((req.url ?? '').split('?')[0]!.replace(/^\//, ''))) : null;
        if (!preview) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', preview.type);
        res.setHeader('Cache-Control', 'no-cache');
        res.end(preview.data);
      });
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
