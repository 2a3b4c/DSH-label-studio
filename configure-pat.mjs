#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { pathToFileURL } from 'node:url'

/** Credential reference consumed by the Label Studio plugin. */
export const PAT_KEY = 'LABEL_STUDIO_PAT'

/** Expand the DSH-supported `~`, `~/`, and `~\` path prefixes. */
function expandHomePath(value, userHome) {
  if (value === '~') return userHome
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(userHome, value.slice(2))
  return value
}

/**
 * Resolve the Harness home with the same environment and path rules as DSH.
 * @param {Record<string, string | undefined>} env environment containing an optional DSH_HOME.
 * @param {string} userHome operating-system user home.
 * @param {string} cwd base for a relative DSH_HOME.
 * @returns {string} absolute Harness home.
 */
export function resolveDshHome(env = process.env, userHome = homedir(), cwd = process.cwd()) {
  const configured = env.DSH_HOME
  const selected = configured === undefined || configured.trim() === ''
    ? join(userHome, '.dsh')
    : expandHomePath(configured, userHome)
  return resolve(cwd, selected)
}

/** Reject values that cannot be represented as one intentional dotenv value. */
function validatePat(token) {
  if (typeof token !== 'string' || token === '' || token.trim() !== token || /[\0\r\n]/u.test(token)) {
    throw new Error('Label Studio PAT must be one non-empty value without surrounding whitespace')
  }
}

/**
 * Replace every existing PAT assignment with one quoted assignment while preserving other lines.
 * @param {string} source current dotenv document.
 * @param {string} token PAT supplied interactively by the local user.
 * @returns {string} updated dotenv document with one trailing newline.
 */
export function updateEnvDocument(source, token) {
  if (typeof source !== 'string') throw new TypeError('dotenv document must be a string')
  validatePat(token)

  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source === '' ? [] : source.split(/\r?\n/u)
  if (lines.at(-1) === '') lines.pop()

  const assignment = `${PAT_KEY}=${JSON.stringify(token)}`
  const pattern = /^\s*(?:export\s+)?LABEL_STUDIO_PAT\s*=/u
  const updated = []
  let replaced = false
  for (const line of lines) {
    if (!pattern.test(line)) {
      updated.push(line)
      continue
    }
    if (!replaced) updated.push(assignment)
    replaced = true
  }
  if (!replaced) updated.push(assignment)
  return `${updated.join(newline)}${newline}`
}

/** Read a UTF-8 document or return an empty document when it does not exist. */
async function readOptional(filename) {
  try {
    return await readFile(filename, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

/**
 * Store the PAT in `$DSH_HOME/.env` without touching other variables.
 * @param {string} token PAT supplied interactively by the local user.
 * @param {{env?: Record<string, string | undefined>, userHome?: string, cwd?: string}} options path inputs.
 * @returns {Promise<string>} absolute filename written.
 */
export async function storePat(token, options = {}) {
  validatePat(token)
  const dshHome = resolveDshHome(
    options.env ?? process.env,
    options.userHome ?? homedir(),
    options.cwd ?? process.cwd(),
  )
  const filename = join(dshHome, '.env')
  await mkdir(dshHome, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') await chmod(dshHome, 0o700)
  const document = updateEnvDocument(await readOptional(filename), token)
  await writeFile(filename, document, { encoding: 'utf8', mode: 0o600 })
  if (process.platform !== 'win32') await chmod(filename, 0o600)
  return filename
}

/** Prompt for a secret without echoing its characters to an interactive terminal. */
export async function promptPat(input = process.stdin, output = process.stdout) {
  if (input.isTTY !== true || output.isTTY !== true) {
    throw new Error('an interactive terminal is required')
  }

  let muted = false
  const promptOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) output.write(chunk, encoding)
      callback()
    },
  })
  const prompt = createInterface({ input, output: promptOutput, terminal: true })
  try {
    const answer = prompt.question('请输入 Label Studio PAT：')
    muted = true
    const token = await answer
    muted = false
    output.write('\n')
    return token
  } finally {
    muted = false
    prompt.close()
  }
}

/** Run the interactive cross-platform configurator. */
export async function main() {
  const token = await promptPat()
  const filename = await storePat(token)
  process.stdout.write(`凭证已保存到 ${filename}\n请重新启动 DSH。\n`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`配置 LABEL_STUDIO_PAT 失败：${message}\n`)
    process.exitCode = 1
  })
}
