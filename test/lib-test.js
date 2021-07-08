/* eslint-env mocha */

const version = '1.15.2'
const ChunkDumper = require('../index.js')
const chunkDumper = new ChunkDumper(version)
const fs = require('fs').promises
const assert = require('assert')
const fsOriginal = require('fs')
const { makeLocalPath } = require('./util')
const { once } = require('events')
const debug = require('debug')('chunk-dumper')

describe('chunkDumper lib', function () {
  this.timeout(90 * 1000)
  // before: make server and client but log out after the client recieves the login packet
  // beforeEach: make the client so we can verify we will always get the chunks
  // afterEach: make the client leave so we can remake the listeners in the next beforeEach
  // after: close the server and delete server data
  before(async function () {
    this.timeout(180 * 1000)
    debug('starting start')
    await chunkDumper.start()
    await once(chunkDumper.client, 'login')
    debug('done start')
    chunkDumper.client.end()
    await once(chunkDumper.client, 'end')
  })
  after(async function () {
    this.timeout(180 * 1000)
    debug('starting stop')
    await chunkDumper.stop()
    debug('done stop')
  })
  beforeEach(async () => {
    await chunkDumper.logBackIn()
  })
  afterEach(async () => {
    if (chunkDumper.client.state !== 'play') await once(chunkDumper.client, 'login')
    chunkDumper.client.end()
    await once(chunkDumper.client, 'end')
  })

  it('can receive a chunk event', async () => {
    await once(chunkDumper, 'chunk')
  })

  it('can save a chunk', async () => {
    const filesPaths = [
      makeLocalPath('chunk.dump'),
      makeLocalPath('chunk.meta'),
      makeLocalPath('chunk_light.dump'),
      makeLocalPath('chunk_light.meta')
    ]
    await chunkDumper.saveChunk(...filesPaths)
    for (const file of filesPaths) {
      await fs.access(file, fsOriginal.constants.F_OK)
      await fs.unlink(file)
    }
  })

  it('can save 10 chunks', async () => {
    await chunkDumper.saveChunks(makeLocalPath('chunks'), 10)
    const dirContent = await fs.readdir(makeLocalPath('chunks'))
    assert(dirContent.length === 40, 'should have at least 40 files')
    for (const file of dirContent) {
      await fs.unlink(makeLocalPath('chunks', file))
    }
    await fs.rmdir(makeLocalPath('chunks'))
  })

  it('can save chunks continuously', async () => {
    chunkDumper.startSavingChunks(makeLocalPath('chunks'))
    await new Promise((resolve) => setTimeout(() => {
      chunkDumper.stopSavingChunks(makeLocalPath('chunks'))
      resolve()
    }, 10000))

    const dirContent = await fs.readdir(makeLocalPath('chunks'))
    assert.notStrictEqual(dirContent.length, 0)
    for (const file of dirContent) {
      await fs.unlink(makeLocalPath('chunks', file))
    }
    await fs.rmdir(makeLocalPath('chunks'))
  })
})
