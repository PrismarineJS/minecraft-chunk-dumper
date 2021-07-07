/* eslint-env mocha */

const version = '1.15.2'
const assert = require('assert')
const util = require('util')
const fs = require('fs').promises
const path = require('path')
const exec = util.promisify(require('child_process').exec)
const { spawn } = require('child_process')
const fsOriginal = require('fs')

const CMD_PATH = path.resolve(__dirname, '..', 'bin', 'cmd.js')
const CMD = 'node ' + CMD_PATH

describe('chunkDumper cli', function () {
  this.timeout(120000)
  describe('help', () => {
    it('has an help command', async () => {
      const { stdout, stderr } = await exec(CMD + ' help')
      assert.strictEqual(stderr, '')
      assert(stdout.toLowerCase().includes('usage'))
    })
    it('has a --help option', async () => {
      const { stdout, stderr } = await exec(CMD + ' --help')
      assert.strictEqual(stderr, '')
      assert(stdout.toLowerCase().includes('usage'))
    })
    it('handle no command gracefully', async () => {
      const { stdout, stderr } = await exec(CMD)
      assert.strictEqual(stderr, '')
      assert(stdout.toLowerCase().includes('usage'))
    })
  })

  describe('version', () => {
    const expectedVersion = require('../package.json').version + '\n'
    it('has a version command', async () => {
      const { stdout, stderr } = await exec(CMD + ' version')
      assert.strictEqual(stderr, '')
      assert(stdout.toLowerCase().includes(expectedVersion))
    })
    it('has a --version option', async () => {
      const { stdout, stderr } = await exec(CMD + ' --version')
      assert.strictEqual(stderr, '')
      assert(stdout.toLowerCase().includes(expectedVersion))
    })
    it('has a -v option', async () => {
      const { stdout, stderr } = await exec(CMD + ' -v')
      assert.strictEqual(stderr, '')
      assert(stdout.toLowerCase().includes(expectedVersion))
    })
  })

  it('can download one chunk', async () => {
    const cm = CMD + ` saveChunk "${version}" "` + path.join(__dirname, 'chunk.dump') + '" "' +
    path.join(__dirname, 'chunk.meta') + '" "' + path.join(__dirname, 'chunk_light.dump') + '" "' + path.join(__dirname, 'chunk_light.meta') + '"'
    console.log('running ' + cm)
    const { stdout, stderr } = await exec(cm, { env: { DEBUG: 'chunk-dumper' } })
    console.log('stdout:' + stdout)
    console.log('stderr:' + stderr)
    assert(stdout.toLowerCase().includes('successfully'), `${stdout} should contain successfully`)

    await fs.access(path.join(__dirname, 'chunk.dump'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk.meta'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk_light.dump'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk_light.meta'), fsOriginal.constants.F_OK)
    await fs.unlink(path.join(__dirname, 'chunk.dump'))
    await fs.unlink(path.join(__dirname, 'chunk.meta'))
    await fs.unlink(path.join(__dirname, 'chunk_light.dump'))
    await fs.unlink(path.join(__dirname, 'chunk_light.meta'))
  })

  it('can download 10 chunks', async () => {
    const { stdout } = await exec(CMD + ` saveChunks "${version}" "` + path.join(__dirname, 'chunks') + '" 10')
    assert(stdout.toLowerCase().includes('successfully'))

    const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
    assert(dirContent.length >= 40, 'should have at least 40 files')
    for (const file of dirContent) {
      await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
    }
    await fs.rmdir(path.join(__dirname, 'chunks'))
  })

  it('can continuously save chunks', async () => {
    await new Promise((resolve, reject) => {
      const child = spawn('node', [CMD_PATH, 'continuouslySave', version, path.join(__dirname, 'chunks')])

      child.on('error', reject)

      child.stdout.on('data', (data) => {
        console.log('stdout: ' + data)
        if (data.includes('Saving chunks')) {
          setTimeout(() => child.kill('SIGINT'), 10000)
        }
      })

      child.on('close', async () => {
        const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
        assert.notStrictEqual(dirContent.length, 0)
        for (const file of dirContent) {
          await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
        }
        await fs.rmdir(path.join(__dirname, 'chunks'))
        resolve()
      })
    })
  })
})
