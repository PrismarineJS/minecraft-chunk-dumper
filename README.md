# minecraft-chunk-dumper

[![NPM version](https://img.shields.io/npm/v/minecraft-chunk-dumper.svg)](http://npmjs.com/package/minecraft-chunk-dumper)
[![Build Status](https://github.com/PrismarineJS/minecraft-chunk-dumper/workflows/CI/badge.svg)](https://github.com/PrismarineJS/minecraft-chunk-dumper/actions?query=workflow%3A%22CI%22)

Dumps chunks for minecraft versions 1.7 to 1.15 



## Install

To install a `minecraftChunkDumper` command line program, run:

```bash
npm install minecraft-chunk-dumper -g
```


## Usage

### Cli

```bash
$ minecraftChunkDumper --help

Usage:
    minecraftChunkDumper [command] <minecraft-version> <options>

Example:
    minecraftChunkDumper saveChunk "1.14.4" "chunk.dump" "chunk.meta" "chunk_light.dump" "chunk_light.meta"

Commands:
    saveChunk <minecraft-version> <chunk-file> <meta-file>    save a single chunk file to specified files
    saveChunks <minecraft-version> <folder> <count>           save the specified number of chunks to the given folder
    continuouslySave <minecraft-version> <folder>             continuously saves chunks to the specified folder, until the program is stopped
```

### Programmatic example

```js
const ChunkDumper = require('minecraft-chunk-dumper')

const chunkDumper = new ChunkDumper('1.14.4')

async function run () {
  await chunkDumper.start()
  chunkDumper.on('chunk', (x, z, bitMap, chunkData) => console.log('I received a chunk at ' + x + ';' + z))
  chunkDumper.on('chunk_light', ({ chunkX, chunkZ }) => console.log('I received a chunk light at ' + chunkX + ';' + chunkZ))
  await chunkDumper.saveChunks('dumps/', 100)
  await chunkDumper.stop()
}

run().then(() => console.log('All done !'))
```

### Debugging

You can enable some debugging output using DEBUG environment variable:

DEBUG="chunk-dumper" node [...]

### API

ChunkDumper is a class which can dumps chunk for a given minecraft version.

It saves 2 type of files :
* Chunk files contain the buffer of the chunk (binary format)
* Metadata files are json files of that shape : `{"x":-10,"z":-1,"groundUp":true,"bitMap":15,"biomes":[1,2...]}`

for more recent versions (starting from 1.14), it also saves chunk light files :
* Chunk light files contain the buffer of the chunk (binary format)
* Metadata chunk light files are json files of that shape : `{"chunkX":-10,"chunkZ":-1,"skyLightMask":15,"blockLightMask":15,"emptySkyLightMask":15,"emptyBlockLightMask":15}`

You should create an instance with the version you want. Then start it.
You then have several possibilities :
* use the "chunk" event to do whatever you want with chunks
* use saveChunk to save a single chunk
* use the saveChunks to save a given number of chunks
* use the startSavingChunks to continuously save chunks, then call stopSavingChunks to stop

When you are done, you should call the stop method to finish your session.

#### ChunkDumper(version)

Build a new ChunkDumper for minecraft `version`

#### ChunkDumper.start()

Downloads and starts the server then connect a node-minecraft-protocol client to it.
Returns a promise when ready.

#### ChunkDumper.stop()

Stops the nmp client then stops the server.
Returns a promise when finished.

#### ChunkDumper.saveChunk(chunkFile, metaFile, chunkLightFile, metaChunkLightFile)

Save 1 chunk in specified `chunkFile` and `metaFile` 
Save 1 chunk light in specified `chunkLightFile` and `metaChunkLightFile` 
Returns a promise when finished.

#### ChunkDumper.saveChunks(folder, n)

Save n chunks in specified folder
Returns a promise when finished.

#### ChunkDumper.startSavingChunks(folder)

Continuously saves all chunk and metadata file to folder.
* Chunks are named chunk_x_z.dump
* Metadata files are named chunk_x_z.data
* Chunk light files are named chunk_light_x_z.dump
* Metadata light files are named chunk_light_x_z.data

#### ChunkDumper.stopSavingChunks()

Stops saving chunks

#### "chunk"(x, z, bitMap, chunkData)

Emitted when a chunk is received


### License

MIT. Copyright (c) Romain Beaumont
