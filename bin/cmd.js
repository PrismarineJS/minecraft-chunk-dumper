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
  if (argv._.length !== 4) {
    runHelp()
  } else {
    const version = argv._[1]
    const chunkFile = argv._[2]
    const metaFile = argv._[3]
    runSaveChunk(version, chunkFile, metaFile)
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
      minecraftChunkDumper saveChunk "1.13.1" "chunk.dump" "chunk.meta"

  Commands:
      saveChunk <minecraft-version> <chunk-file> <meta-file>    save a single chunk file to specified files
      saveChunks <minecraft-version> <folder> <count>           save the specified number of chunks to the given folder
      continuouslySave <minecraft-version> <folder>             continuously saves chunks to the specified folder, until the program is stopped
    */
  }.toString().split(/\n/).slice(2, -2).join('\n'))
}

function runSaveChunk (version, chunkFile, metaFile) {

}

function runSaveChunks (version, folder, count) {

}

function runContinuouslySave (version, folder) {

}
