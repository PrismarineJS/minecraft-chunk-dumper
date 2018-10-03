/* eslint-env mocha */

const assert = require('assert')
const util = require('util')
const fs = require('fs').promises
const path = require('path')
const exec = util.promisify(require('child_process').exec)
const { spawn } = require('child_process')

const CMD_PATH = path.resolve(__dirname, '..', 'bin', 'cmd.js')
const CMD = 'node ' + CMD_PATH

describe(`chunkDumper cli`, () => {
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

    await fs.access('chunk.dump', fs.constants.R_OK)
    await fs.access('chunk.meta', fs.constants.R_OK)
    await fs.unlink('chunk.dump')
    await fs.unlink('chunk.meta')
  })

  it('can download 10 chunks', async () => {
    const { stdout, stderr } = await exec(CMD + ' saveChunks "1.13.1" "chunks/" 10')
    assert.strictEqual(stderr, '')
    assert(stdout.toLowerCase().includes('done'))

    const dirContent = await fs.readdir('chunks/')
    assert.strictEqual(dirContent.length, 10)
    for (let file of dirContent) {
      await fs.unlink(path.join('chunks', file))
    }
    await fs.rmDir('chunks')
  })

  it('can continuously save chunks', async () => {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [ CMD_PATH, 'continuouslySave', '1.13.1', 'chunks/' ])

      child.on('error', reject)

      setTimeout(() => child.kill('SIGINT'), 10)

      child.on('close', async () => {
        const dirContent = await fs.readdir('chunks/')
        assert.notStrictEqual(dirContent.length, 0)
        for (let file of dirContent) {
          await fs.unlink(path.join('chunks', file))
        }
        await fs.rmDir('chunks')

        resolve()
      })
    })
  })
})
