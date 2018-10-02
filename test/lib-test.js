/* eslint-env mocha */

const version = '1.13'
const ChunkDumper = require('../index.js')
const chunkDumper = new ChunkDumper(version)

describe(`chunkDumper lib`, () => {
  it('can start', async () => {
    await chunkDumper.start()
  })

  it('can stop', async () => {
    await chunkDumper.stop()
  })
})
