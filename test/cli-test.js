/* eslint-env mocha */

const assert = require('assert')
const util = require('util')
const fs = require('fs').promises
const path = require('path')
const exec = util.promisify(require('child_process').exec)
const { spawn } = require('child_process')
const fsOriginal = require('fs')

const CMD_PATH = path.resolve(__dirname, '..', 'bin', 'cmd.js')
const CMD = 'node ' + CMD_PATH

describe(`chunkDumper cli`, function () {
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
    const { stdout } = await exec(CMD + ' saveChunk "1.13.1" "' + path.join(__dirname, 'chunk.dump') + '" "' + path.join(__dirname, 'chunk.meta') + '"')
    assert(stdout.toLowerCase().includes('successfully'))

    await fs.access(path.join(__dirname, 'chunk.dump'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk.meta'), fsOriginal.constants.F_OK)
    await fs.unlink(path.join(__dirname, 'chunk.dump'))
    await fs.unlink(path.join(__dirname, 'chunk.meta'))
  })

  it.skip('can download 10 chunks', async () => {
    const { stdout } = await exec(CMD + ' saveChunks "1.13.1" "' + path.join(__dirname, 'chunks') + '" 10')
    assert(stdout.toLowerCase().includes('successfully'))

    const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
    assert.strictEqual(dirContent.length, 20)
    for (let file of dirContent) {
      await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
    }
    await fs.rmdir(path.join(__dirname, 'chunks'))
  })

  it.skip('can continuously save chunks', async () => {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [ CMD_PATH, 'continuouslySave', '1.13.1', path.join(__dirname, 'chunks') ])

      child.on('error', reject)

      setTimeout(() => child.kill('SIGINT'), 10000)

      child.on('close', async () => {
        const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
        assert.notStrictEqual(dirContent.length, 0)
        for (let file of dirContent) {
          await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
        }
        await fs.rmDir(path.join(__dirname, 'chunks'))

        resolve()
      })
    })
  })
})
