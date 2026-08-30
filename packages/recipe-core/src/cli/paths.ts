import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
export const recipesDir = new URL('../../../../recipes/', import.meta.url)
export const indexPath = fileURLToPath(new URL('../../../../index.json', import.meta.url))
