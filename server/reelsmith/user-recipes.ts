import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRecipe, validateRecipe, type Recipe } from '../../shared/reelsmith/recipe.ts';
import { runtimeProfile } from '../runtime-profile.ts';

const userRecipeDir = () => join(runtimeProfile().rootDir, 'user-recipes');
const safeId = /^ai-[a-z0-9][a-z0-9-]{2,63}$/;

export interface UserRecipeCatalog { recipes: Recipe[]; rejected: Array<{ file: string; errors: string[] }> }

export async function listUserRecipes(): Promise<UserRecipeCatalog> {
  const dir = userRecipeDir();
  const out: UserRecipeCatalog = { recipes: [], rejected: [] };
  let files: string[];
  try { files = (await readdir(dir)).filter((file) => file.endsWith('.recipe.json')).sort(); }
  catch { return out; }
  for (const file of files) {
    try {
      const raw = await readFile(join(dir, file), 'utf8');
      if (Buffer.byteLength(raw) > 256_000) { out.rejected.push({ file, errors: ['recipe file exceeds 256 KB'] }); continue; }
      const parsed = parseRecipe(raw);
      if (!parsed.ok) out.rejected.push({ file, errors: parsed.errors });
      else if (!safeId.test(parsed.recipe.id) || file !== `${parsed.recipe.id}.recipe.json`) out.rejected.push({ file, errors: ['user recipe filename or id is invalid'] });
      else { const { agentHints: _untrusted, ...recipe } = parsed.recipe; out.recipes.push(recipe); }
    } catch (error) {
      out.rejected.push({ file, errors: [error instanceof Error ? error.message : String(error)] });
    }
  }
  return out;
}

export async function saveUserRecipe(value: unknown, replace = false): Promise<Recipe> {
  const parsed = validateRecipe(value);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  // agentHints are instructions passed to the agent as the recipe author's; only built-in recipes may carry them
  if (parsed.recipe.agentHints !== undefined) throw new Error('agentHints are only allowed in built-in recipes');
  if (!safeId.test(parsed.recipe.id)) throw new Error('user recipe id must start with ai- and use lowercase letters, numbers, and hyphens');
  const dir = userRecipeDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${parsed.recipe.id}.recipe.json`);
  const previous = await readFile(path, 'utf8').catch(() => null);
  if (previous !== null && !replace) throw new Error('a recipe with this id already exists');
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(parsed.recipe, null, 2)}\n`, { flag: 'wx' });
  try { await rename(temp, path); }
  catch (error) { await unlink(temp).catch(() => undefined); throw error; }
  return parsed.recipe;
}

export async function deleteUserRecipe(id: string): Promise<boolean> {
  if (!safeId.test(id)) throw new Error('invalid user recipe id');
  const path = join(userRecipeDir(), `${id}.recipe.json`);
  try { await unlink(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
