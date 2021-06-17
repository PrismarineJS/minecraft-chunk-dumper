const EventEmitter = require('events').EventEmitter
const WrapServer = require('minecraft-wrap').WrapServer
const downloadServer = require('minecraft-wrap').downloadServer
const path = require('path')
const os = require('os')
const MC_SERVER_PATH = path.join(os.tmpdir(), 'server')
const MC_SERVER_JAR = path.join(os.tmpdir(), 'server.jar')
const fs = require('fs').promises
const util = require('util')
const mc = require('minecraft-protocol')
const debug = require('debug')('chunk-dumper')

function flattenMaskArray (sectionBitMask) {
  // We need to handle arrays specially because protocol will return
  // array of BigInt on new versions, while we really need an array of 32-bit integers,
  // with bits sorted from least to most significant ones
  // BigInt is internally an array, but bits are sorted in the opposite way,
  // e.g. most significant bits first, so we need to flip it manually before passing to prismarine-chunk
  // and then flatten the array
  if (Array.isArray(sectionBitMask)) {
    return sectionBitMask.map(bigInt => bigInt.reverse()).flat(1)
  }
  return sectionBitMask
}

function condenseLightingDataPacket (packet) {
  // total payload length is amount of all sections, each section is 2048 bytes + 2 bytes for varInt size
  const totalPayloadLength = (packet.skyLight.length + packet.blockLight.length) * (2048 + 2)
  const resultBuffer = Buffer.alloc(totalPayloadLength)

  let currentIndex = 0
  for (const skyLightArray of packet.skyLight) {
    // write varInt(2048) first
    resultBuffer.writeUInt8(128, currentIndex++)
    resultBuffer.writeUInt8(16, currentIndex++)

    // write actual chunk section payload now
    resultBuffer.set(skyLightArray, currentIndex)
    currentIndex += skyLightArray.length
  }

  for (const blockLightArray of packet.blockLight) {
    // write varInt(2048) first
    resultBuffer.writeUInt8(128, currentIndex++)
    resultBuffer.writeUInt8(16, currentIndex++)

    // write actual chunk section payload now
    resultBuffer.set(blockLightArray, currentIndex)
    currentIndex += blockLightArray.length
  }

  // validate payload size
  if (currentIndex !== totalPayloadLength) {
    throw new Error(`Malformed light update packet received, expected length: ${totalPayloadLength}, received: ${currentIndex}`)
  }

  return resultBuffer
}

class ChunkDumper extends EventEmitter {
  constructor (version) {
    super()
    this.version = version
    this.withLightPackets = this.version.includes('1.14') || this.version.includes('1.15') ||
      this.version.includes('1.16') || this.version.includes('1.17')
  }

  async start () {
    debug('downloading server')
    await util.promisify(downloadServer)(this.version, MC_SERVER_JAR)
    this.server = new WrapServer(MC_SERVER_JAR, MC_SERVER_PATH)
    this.server.startServerAsync = util.promisify(this.server.startServer)
    this.server.stopServerAsync = util.promisify(this.server.stopServer)
    this.server.deleteServerDataAsync = util.promisify(this.server.deleteServerData)

    debug('starting server')
    this.server.on('line', (line) => {
      debug(line)
    })
    await this.server.startServerAsync({ 'server-port': 25569, 'online-mode': 'false' })
    debug('connecting client')
    this.client = mc.createClient({
      username: 'Player',
      version: this.version,
      port: 25569
    })
    this.client.on('map_chunk', (packet) => {
      this.emit('chunk', {
        x: packet.x,
        z: packet.z,
        bitMap: packet.bitMap ?? flattenMaskArray(packet.primaryBitMask),
        biomes: packet.biomes,
        groundUp: packet.groundUp,
        chunkData: packet.chunkData
      })
    })
    this.client.on('update_light', (packet) => {
      this.emit('chunk_light', {
        chunkX: packet.chunkX,
        chunkZ: packet.chunkZ,
        skyLightMask: flattenMaskArray(packet.skyLightMask),
        blockLightMask: flattenMaskArray(packet.blockLightMask),
        emptySkyLightMask: packet.emptySkyLightMask,
        emptyBlockLightMask: packet.emptyBlockLightMask,
        data: packet.data ?? condenseLightingDataPacket(packet)
      })
    })
  }

  async stop () {
    this.client.end()
    debug('stopping server')
    await this.server.stopServerAsync()
    debug('deleting data')
    await this.server.deleteServerDataAsync()
    debug('deleting server')
    await fs.unlink(MC_SERVER_JAR)
    await fs.unlink(path.join(process.cwd(), 'versions', this.version, this.version + '.json'))
    await fs.rmdir(path.join(process.cwd(), 'versions', this.version))
    await fs.rmdir(path.join(process.cwd(), 'versions'))
  }

  async saveChunk (chunkFile, metaFile, chunkLightFile, lightMetaFile) {
    await this.saveChunks('', 1, {
      chunkFile,
      metaFile,
      chunkLightFile,
      lightMetaFile
    })
  }

  async saveChunks (folder, count, forcedFileNames = undefined) {
    try {
      await fs.mkdir(folder)
    } catch (err) {

    }
    const lightsSaved = new Set()
    const chunksSaved = new Set()
    await new Promise((resolve, reject) => {
      let saveChunkLight
      const saveChunk = async d => {
        const { x, z } = d
        chunksSaved.add(`${x},${z}`)
        let finished = false

        if ((chunksSaved.size === count && !this.withLightPackets) || (([...lightsSaved].filter(x => chunksSaved.has(x))).length >= count &&
         this.withLightPackets)) {
          this.removeListener('chunk', saveChunk)
          if (this.withLightPackets) {
            this.removeListener('chunk_light', saveChunkLight)
          }
          finished = true
        }
        try {
          if (forcedFileNames !== undefined) {
            await ChunkDumper.saveChunkFiles(forcedFileNames.chunkFile, forcedFileNames.metaFile, d)
          } else {
            await ChunkDumper.saveChunkFilesToFolder(folder, d)
          }
          if (finished) {
            resolve()
          }
        } catch (err) {
          this.removeListener('chunk', saveChunk)
          if (this.withLightPackets) {
            this.removeListener('chunk_light', saveChunkLight)
          }
          reject(err)
        }
      }
      this.on('chunk', saveChunk)
      if (this.withLightPackets) {
        saveChunkLight = async d => {
          const { chunkX, chunkZ } = d
          lightsSaved.add(`${chunkX},${chunkZ}`)
          let finished = false
          if (([...lightsSaved].filter(x => chunksSaved.has(x))).length >= count) {
            this.removeListener('chunk', saveChunk)
            this.removeListener('chunk_light', saveChunkLight)
            finished = true
          }
          try {
            if (forcedFileNames !== undefined) {
              await ChunkDumper.saveChunkLightFiles(forcedFileNames.chunkLightFile,
                forcedFileNames.lightMetaFile, d)
            } else {
              await ChunkDumper.saveChunkLightFilesToFolder(folder, d)
            }
            if (finished) {
              resolve()
            }
          } catch (err) {
            this.removeListener('chunk', saveChunk)
            this.removeListener('chunk_light', saveChunkLight)
            reject(err)
          }
        }
        this.on('chunk_light', saveChunkLight)
      }
    })
  }

  async startSavingChunks (folder) {
    try {
      await fs.mkdir(folder)
    } catch (err) {

    }
    this.savingChunk = async d => {
      try {
        await ChunkDumper.saveChunkFilesToFolder(folder, d)
      } catch (err) {
        this.stopSavingChunks()
        throw err
      }
    }
    this.on('chunk', this.savingChunk)
    if (this.withLightPackets) {
      this.savingChunkLight = async d => {
        try {
          await ChunkDumper.saveChunkLightFilesToFolder(folder, d)
        } catch (err) {
          this.stopSavingChunks()
          throw err
        }
      }
      this.on('chunk_light', this.savingChunkLight)
    }
  }

  static async saveChunkFilesToFolder (folder, d) {
    const { x, z } = d
    await ChunkDumper.saveChunkFiles(path.join(folder, 'chunk_' + x + '_' + z + '.dump'),
      path.join(folder, 'chunk_' + x + '_' + z + '.meta'), d)
  }

  static async saveChunkFiles (chunkDataFile, chunkMetaFile, { x, z, groundUp, bitMap, biomes, chunkData }) {
    await fs.writeFile(chunkDataFile, chunkData)
    await fs.writeFile(chunkMetaFile, JSON.stringify({
      x, z, groundUp, bitMap, biomes
    }), 'utf8')
  }

  static async saveChunkLightFilesToFolder (folder, d) {
    const { chunkX, chunkZ } = d
    await ChunkDumper.saveChunkLightFiles(path.join(folder, 'chunk_light_' + chunkX + '_' + chunkZ + '.dump'),
      path.join(folder, 'chunk_light_' + chunkX + '_' + chunkZ + '.meta'), d)
  }

  static async saveChunkLightFiles (chunkLightDataFile, chunkLightMetaFile, {
    chunkX, chunkZ,
    skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, data
  }) {
    await fs.writeFile(chunkLightDataFile, data)
    await fs.writeFile(chunkLightMetaFile, JSON.stringify({
      chunkX,
      chunkZ,
      skyLightMask,
      blockLightMask,
      emptySkyLightMask,
      emptyBlockLightMask
    }), 'utf8')
  }

  stopSavingChunks () {
    this.removeListener('chunk', this.savingChunk)
    this.removeListener('chunk_light', this.savingChunkLight)
  }
}

module.exports = ChunkDumper
