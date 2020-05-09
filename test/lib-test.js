/* eslint-env mocha */

const version = '1.15.2'
const ChunkDumper = require('../index.js')
const chunkDumper = new ChunkDumper(version)
const fs = require('fs').promises
const path = require('path')
const assert = require('assert')
const fsOriginal = require('fs')

describe('chunkDumper lib', function () {
  this.timeout(120000)
  before('can start', async () => {
    await chunkDumper.start()
  })

  it('can receive a chunk event', async () => {
    await new Promise(resolve => chunkDumper.on('chunk', () => resolve()))
  })

  it('can save a chunk', async () => {
    await chunkDumper.saveChunk(path.join(__dirname, 'chunk.dump'), path.join(__dirname, 'chunk.meta'),
      path.join(__dirname, 'chunk_light.dump'), path.join(__dirname, 'chunk_light.meta'))
    await fs.access(path.join(__dirname, 'chunk.dump'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk.meta'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk_light.dump'), fsOriginal.constants.F_OK)
    await fs.access(path.join(__dirname, 'chunk_light.meta'), fsOriginal.constants.F_OK)
    await fs.unlink(path.join(__dirname, 'chunk.dump'))
    await fs.unlink(path.join(__dirname, 'chunk.meta'))
    await fs.unlink(path.join(__dirname, 'chunk_light.dump'))
    await fs.unlink(path.join(__dirname, 'chunk_light.meta'))
  })

  it('can save 10 chunks', async () => {
    await chunkDumper.saveChunks(path.join(__dirname, 'chunks'), 10)
    const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
    assert(dirContent.length >= 40, 'should have at least 40 files')
    for (const file of dirContent) {
      await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
    }
    await fs.rmdir(path.join(__dirname, 'chunks'))
  })

  it('can save chunks continuously', async () => {
    chunkDumper.startSavingChunks(path.join(__dirname, 'chunks'))
    await new Promise((resolve) => setTimeout(() => {
      chunkDumper.stopSavingChunks(path.join(__dirname, 'chunks'))
      resolve()
    }, 10000))

    const dirContent = await fs.readdir(path.join(__dirname, 'chunks'))
    assert.notStrictEqual(dirContent.length, 0)
    for (const file of dirContent) {
      await fs.unlink(path.join(path.join(__dirname, 'chunks'), file))
    }
    await fs.rmdir(path.join(__dirname, 'chunks'))
  })

  after('can stop', async () => {
    await chunkDumper.stop()
  })
})
