/// <reference types="node" />
import path from 'path'
import { defineConfig } from 'prisma/config'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '.env') })

export default defineConfig({
  migrations: {
    seed: 'ts-node prisma/seed/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] as string,
  },
})
