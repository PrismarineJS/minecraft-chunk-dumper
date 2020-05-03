#!/usr/bin/env node

const minimist = require('minimist')

const argv = minimist(process.argv.slice(2), {
  alias: {
    h: 'help',
    v: 'version'
  },
  boolean: [ // options that are always boolean
    'help',
    'version'
  ]
})

const command = argv._[0]

if (['saveChunk', 'saveChunks', 'continuouslySave'].indexOf(command) !== -1 && argv._.length === 1) {
  runHelp()
} else if (command === 'help' || argv.help) {
  runHelp()
} else if (command === 'version' || argv.version) {
  runVersion()
} else if (command === 'saveChunk') {
  if (argv._.length !== 4 && argv._.length !== 6) {
    runHelp()
  } else {
    const version = argv._[1]
    const chunkFile = argv._[2]
    const metaFile = argv._[3]
    const chunkLightFile = argv._[4]
    const metaLightFile = argv._[5]
    runSaveChunk(version, chunkFile, metaFile, chunkLightFile, metaLightFile)
  }
} else if (command === 'saveChunks') {
  if (argv._.length !== 4) {
    runHelp()
  } else {
    const version = argv._[1]
    const folder = argv._[2]
    const count = argv._[3]
    runSaveChunks(version, folder, count)
  }
} else if (command === 'continuouslySave') {
  if (argv._.length !== 3) {
    runHelp()
  } else {
    const version = argv._[1]
    const folder = argv._[2]
    runContinuouslySave(version, folder)
  }
} else {
  runHelp()
}

function runVersion () {
  console.log(
    require('../package.json').version
  )
}

function runHelp () {
  console.log(function () {
    /*
  Usage:
    minecraftChunkDumper [command] <minecraft-version> <options>

  Example:
      minecraftChunkDumper saveChunk "1.14.4" "chunk.dump" "chunk.meta" "chunkLight.dump" "chunkLight.meta"

  Commands:
      saveChunk <minecraft-version> <chunk-file> <meta-file> [<chunk-light-file> <meta-light-file>]    save a single chunk file to specified files
      saveChunks <minecraft-version> <folder> <count>           save the specified number of chunks to the given folder
      continuouslySave <minecraft-version> <folder>             continuously saves chunks to the specified folder, until the program is stopped
    */
  }.toString().split(/\n/).slice(2, -2).join('\n'))
}

async function runSaveChunk (version, chunkFile, metaFile, chunkLightFile, metaLightFile) {
  const ChunkDumper = require('../index.js')
  const chunkDumper = new ChunkDumper(version)

  console.log('Starting server...')
  await chunkDumper.start()
  console.log('Saving chunk in ' + chunkFile + ' and ' + metaFile + '.')
  console.log('Saving chunk light in ' + chunkLightFile + ' and ' + metaLightFile + '.')
  await chunkDumper.saveChunk(chunkFile, metaFile, chunkLightFile, metaLightFile)
  console.log('Stopping server...')
  await chunkDumper.stop()
  console.log('Chunk successfully saved at ' + chunkFile + ' and ' + metaFile)
  console.log('Chunk light successfully saved at ' + chunkLightFile + ' and ' + metaLightFile)
  process.exit(0)
}

async function runSaveChunks (version, folder, count) {
  const ChunkDumper = require('../index.js')
  const chunkDumper = new ChunkDumper(version)

  console.log('Starting server...')
  await chunkDumper.start()
  console.log('Saving chunks in ' + folder + '.')
  await chunkDumper.saveChunks(folder, count)
  console.log('Stopping server...')
  await chunkDumper.stop()
  console.log(count + ' chunks were successfully saved at ' + folder)
  process.exit(0)
}

async function runContinuouslySave (version, folder) {
  const ChunkDumper = require('../index.js')
  const chunkDumper = new ChunkDumper(version)

  console.log('Starting server...')
  await chunkDumper.start()
  console.log('Saving chunks in ' + folder + '. Press ctrl+c to stop.')
  await chunkDumper.startSavingChunks(folder)
  await new Promise(resolve => {
    const stop = () => {
      chunkDumper.stopSavingChunks()
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      resolve()
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  })
  console.log('Stopping server...')
  await chunkDumper.stop()
  console.log('Chunks were successfully saved at ' + folder)
  process.exit(0)
}
