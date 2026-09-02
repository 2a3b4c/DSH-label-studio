import assert from 'node:assert/strict'
import { mkdtemp, readFile, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import {
  resolveDshHome,
  storePat,
  updateEnvDocument,
} from '../configure-pat.mjs'

const PAT = 'header.payload.signature'

test('resolveDshHome follows the DSH_HOME default, tilde, and relative-path rules', () => {
  const userHome = resolve('/users/student')
  const cwd = resolve('/course/workspace')

  assert.equal(resolveDshHome({}, userHome, cwd), join(userHome, '.dsh'))
  assert.equal(resolveDshHome({ DSH_HOME: '   ' }, userHome, cwd), join(userHome, '.dsh'))
  assert.equal(resolveDshHome({ DSH_HOME: '~/harness' }, userHome, cwd), join(userHome, 'harness'))
  assert.equal(resolveDshHome({ DSH_HOME: '.state' }, userHome, cwd), resolve(cwd, '.state'))
})

test('updateEnvDocument appends one quoted PAT and preserves unrelated entries', () => {
  assert.equal(updateEnvDocument('', PAT), `LABEL_STUDIO_PAT=${JSON.stringify(PAT)}\n`)
  assert.equal(
    updateEnvDocument('DEEPSEEK_API_KEY="keep"\nCOURSE=multimodal\n', PAT),
    `DEEPSEEK_API_KEY="keep"\nCOURSE=multimodal\nLABEL_STUDIO_PAT=${JSON.stringify(PAT)}\n`,
  )
})

test('updateEnvDocument replaces duplicate PAT entries once and retains CRLF', () => {
  const source = 'FIRST=1\r\nLABEL_STUDIO_PAT=old\r\nSECOND=2\r\nexport LABEL_STUDIO_PAT=older\r\n'
  assert.equal(
    updateEnvDocument(source, PAT),
    `FIRST=1\r\nLABEL_STUDIO_PAT=${JSON.stringify(PAT)}\r\nSECOND=2\r\n`,
  )
})

test('updateEnvDocument rejects empty, padded, multiline, and NUL credentials without echoing them', () => {
  for (const token of ['', ' padded', 'padded ', 'line\nbreak', 'nul\0byte']) {
    assert.throws(
      () => updateEnvDocument('', token),
      error => error instanceof Error && (token === '' || !error.message.includes(token)),
    )
  }
})

test('storePat creates the configured DSH home, preserves its env, and restricts POSIX permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-label-studio-pat-'))
  const parent = join(root, 'nested')
  const dshHome = join(parent, '.dsh')
  const filename = join(dshHome, '.env')

  try {
    assert.equal(
      await storePat(PAT, { env: { DSH_HOME: dshHome }, userHome: root, cwd: root }),
      filename,
    )
    assert.equal(await readFile(filename, 'utf8'), `LABEL_STUDIO_PAT=${JSON.stringify(PAT)}\n`)

    await writeFile(filename, 'COURSE=keep\nLABEL_STUDIO_PAT="old"\n', 'utf8')
    await storePat('new.value.token', { env: { DSH_HOME: dshHome }, userHome: root, cwd: root })
    assert.equal(
      await readFile(filename, 'utf8'),
      'COURSE=keep\nLABEL_STUDIO_PAT="new.value.token"\n',
    )

    if (process.platform !== 'win32') {
      assert.equal((await stat(dshHome)).mode & 0o777, 0o700)
      assert.equal((await stat(filename)).mode & 0o777, 0o600)
    }
  } finally {
    try { await unlink(filename) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    try { await rmdir(dshHome) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    try { await rmdir(parent) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rmdir(root)
  }
})
