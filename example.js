const ChunkDumper = require('.')

const chunkDumper = new ChunkDumper('1.14.4')

async function run () {
  await chunkDumper.start()
  chunkDumper.on('chunk', ({ x, z, bitMap, chunkData }) => console.log('I received a chunk at ' + x + ';' + z))
  chunkDumper.on('chunk_light', ({ chunkX, chunkZ }) => console.log('I received a chunk light at ' + chunkX + ';' + chunkZ))
  await chunkDumper.saveChunks('dumps/', 100)
  await chunkDumper.stop()
}

run().then(() => console.log('All done !'))
