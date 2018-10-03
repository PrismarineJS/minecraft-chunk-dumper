/* eslint-env mocha */

const version = '1.13'
const ChunkDumper = require('../index.js')
const chunkDumper = new ChunkDumper(version)
const fs = require('fs').promises
const path = require('path')
const assert = require('assert')
const fsOriginal = require('fs')

describe(`chunkDumper lib`, function () {
  this.timeout(60000)
  before('can start', async () => {
    await chunkDumper.start()
  })

  it('can receive a chunk event', async () => {
    await new Promise(resolve => chunkDumper.on('chunk', () => resolve()))
  })

  it('can save a chunk', async () => {
    await chunkDumper.saveChunk(path.join(__dirname, 'chunk.dump'), path.join(__dirname, 'chunk.meta'))
    await fs.access(path.join(__dirname, 'chunk.dump'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk.meta'), fsOriginal.constants.F_OK)
    await fs.unlink(path.join(__dirname, 'chunk.dump'))
    await fs.unlink(path.join(__dirname, 'chunk.meta'))
  })

  it.skip('can save 10 chunks', async () => {
    await chunkDumper.saveChunks(path.join(__dirname, 'chunks'), 10)
    const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
    assert.strictEqual(dirContent.length, 10)
    for (let file of dirContent) {
      await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
    }
    await fs.rmDir(path.join(__dirname, 'chunks'))
  })

  it.skip('can save chunks continuously', async () => {
    chunkDumper.startSavingChunks(path.join(__dirname, 'chunks'))
    setTimeout(() => chunkDumper.stopSavingChunks(path.join(__dirname, 'chunks')), 10)

    const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
    assert.notStrictEqual(dirContent.length, 0)
    for (let file of dirContent) {
      await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
    }
    await fs.rmDir(path.join(__dirname, 'chunks'))
  })

  after('can stop', async () => {
    await chunkDumper.stop()
  })
})
