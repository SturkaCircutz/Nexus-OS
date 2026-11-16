/** Run the offline Search & Discover validation workflow. */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backendRoot = join(repoRoot, 'apps', 'engine', 'backend')
const frontendRoot = join(repoRoot, 'apps', 'shell', 'frontend')

function backendPython() {
  const candidates = [
    join(backendRoot, '.venv', 'Scripts', 'python.exe'),
    join(backendRoot, '.venv', 'bin', 'python'),
  ]
  return candidates.find(existsSync) ?? (process.platform === 'win32' ? 'python' : 'python3')
}

function run(label, command, args) {
  console.log(`\n[${label}] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const python = backendPython()
const npmCli = process.env.npm_execpath
if (process.platform === 'win32' && !npmCli) {
  throw new Error('Run this workflow with npm test so the npm CLI path is available.')
}

run('contract generation', python, ['scripts/generate-search-contracts.py', '--check'])
run('contract examples', python, ['scripts/validate-search-contracts.py'])
run('backend tests', python, ['-m', 'pytest'])
run('AI-Core systems tests', python, ['-m', 'pytest', 'tests/systems', '-q'])
run('frontend tests', npmCli ? process.execPath : 'npm', [
  ...(npmCli ? [npmCli] : []), '--prefix', frontendRoot, 'run', 'test:run',
])

console.log('\nSearch & Discover validation passed.')
