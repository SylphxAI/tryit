import { defineConfig } from 'drizzle-kit'

// Used only by `drizzle-kit export` (scripts/check-schema-parity.sh, atlas.hcl):
// it renders schema.ts to SQL for the parity check and needs no database.
export default defineConfig({
	schema: './src/lib/db/schema.ts',
	dialect: 'postgresql',
})
