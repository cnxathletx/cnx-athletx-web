import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(apiRoot, 'sql/migrations')

function normalizeIdentifier(raw: string): string {
  return raw.replace(/["`[\]]/g, '').toLowerCase()
}

function columnNameFromCreateLine(line: string): string | null {
  const trimmed = line.trim().replace(/,$/, '')
  if (!trimmed || trimmed.startsWith('--')) return null

  const firstToken = trimmed.split(/\s+/)[0]
  if (!firstToken) return null

  const name = normalizeIdentifier(firstToken)
  if (['check', 'constraint', 'foreign', 'primary', 'unique'].includes(name)) {
    return null
  }

  return name
}

describe('D1 migrations', () => {
  it('does not add columns already created by earlier migrations', () => {
    const knownColumns = new Map<string, Set<string>>()
    const duplicates: string[] = []

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b))

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8')

      for (const match of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([A-Za-z_][\w]*)\s*\(([\s\S]*?)\);/gi)) {
        const table = normalizeIdentifier(match[1])
        const columns = knownColumns.get(table) ?? new Set<string>()

        for (const line of match[2].split('\n')) {
          const column = columnNameFromCreateLine(line)
          if (column) columns.add(column)
        }

        knownColumns.set(table, columns)
      }

      for (const match of sql.matchAll(/ALTER TABLE\s+([A-Za-z_][\w]*)\s+ADD COLUMN\s+([A-Za-z_][\w]*)/gi)) {
        const table = normalizeIdentifier(match[1])
        const column = normalizeIdentifier(match[2])
        const columns = knownColumns.get(table) ?? new Set<string>()

        if (columns.has(column)) {
          duplicates.push(`${file}: ${table}.${column}`)
        }

        columns.add(column)
        knownColumns.set(table, columns)
      }
    }

    expect(duplicates).toEqual([])
  })
})
