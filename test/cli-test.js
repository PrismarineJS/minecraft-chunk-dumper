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

describe.skip(`chunkDumper cli`, function () {
  this.timeout(60000)
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

  it('can download one chunk', async () => {
    const { stdout, stderr } = await exec(CMD + ' saveChunk "1.13.1" "chunk.dump" "chunk.meta"')
    assert.strictEqual(stderr, '')
    assert(stdout.toLowerCase().includes('done'))

    await fs.access(path.join(__dirname, 'chunk.dump'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk.meta'), fsOriginal.constants.F_OK)
    await fs.unlink(path.join(__dirname, 'chunk.dump'))
    await fs.unlink(path.join(__dirname, 'chunk.meta'))
  })

  it('can download 10 chunks', async () => {
    const { stdout, stderr } = await exec(CMD + ' saveChunks "1.13.1" ' + path.join(__dirname, 'chunks') + ' 10')
    assert.strictEqual(stderr, '')
    assert(stdout.toLowerCase().includes('done'))

    const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
    assert.strictEqual(dirContent.length, 20)
    for (let file of dirContent) {
      await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
    }
    await fs.rmdir('chunks')
  })

  it('can continuously save chunks', async () => {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [ CMD_PATH, 'continuouslySave', '1.13.1', path.join(__dirname, 'chunks') ])

      child.on('error', reject)

      setTimeout(() => child.kill('SIGINT'), 10)

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
