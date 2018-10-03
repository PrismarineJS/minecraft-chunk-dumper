/* eslint-env mocha */

const version = '1.13'
const ChunkDumper = require('../index.js')
const chunkDumper = new ChunkDumper(version)
const fs = require('fs').promises
const path = require('path')
const assert = require('assert')

describe(`chunkDumper lib`, () => {
  before('can start', async () => {
    await chunkDumper.start()
  })

  it('can receive a chunk event', async () => {
    await new Promise(resolve => chunkDumper.on('chunk', () => resolve()))
  })

  it('can save a chunk', async () => {
    await chunkDumper.saveChunk('chunk.dump', 'chunk.meta')
    await fs.access('chunk.dump', fs.constants.R_OK)
    await fs.access('chunk.meta', fs.constants.R_OK)
    await fs.unlink('chunk.dump')
    await fs.unlink('chunk.meta')
  })

  it('can save 10 chunks', async () => {
    await chunkDumper.saveChunks('chunks/', 10)
    const dirContent = await fs.readdir('chunks/')
    assert.strictEqual(dirContent.length, 10)
    for (let file of dirContent) {
      await fs.unlink(path.join('chunks', file))
    }
    await fs.rmDir('chunks')
  })

  it('can save chunks continuously', async () => {
    chunkDumper.startSavingChunks('chunks')
    setTimeout(() => chunkDumper.stopSavingChunks('chunks'), 10)

    const dirContent = await fs.readdir('chunks/')
    assert.notStrictEqual(dirContent.length, 0)
    for (let file of dirContent) {
      await fs.unlink(path.join('chunks', file))
    }
    await fs.rmDir('chunks')
  })

  after('can stop', async () => {
    await chunkDumper.stop()
  })
})
