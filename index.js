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

class ChunkDumper extends EventEmitter {
  constructor (version) {
    super()
    this.version = version.toString()
    this.mcData = require('minecraft-data')(this.version)
    this.withLightPackets = this.mcData.isNewerOrEqualTo('1.14') && this.mcData.isOlderThan('1.18')
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
    this.client.on('map_chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, heightmaps, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, trustEdges }) => {
      this.emit('chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, heightmaps, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, trustEdges }))
    })
    this.client.on('update_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data, trustEdges }) => {
      this.emit('chunk_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data, trustEdges }))
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
      await fs.mkdir(folder, { recursive: true })
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

  static async saveChunkFiles (chunkDataFile, chunkMetaFile, { x, z, groundUp, bitMap, biomes, ignoreOldData, heightmaps, chunkData, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, trustEdges }) {
    await fs.writeFile(chunkDataFile, chunkData)
    await fs.writeFile(chunkMetaFile, JSON.stringify({
      x, z, groundUp, bitMap, biomes, ignoreOldData, heightmaps, chunkData, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, trustEdges
    }), 'utf8')
  }

  static async saveChunkLightFilesToFolder (folder, d) {
    const { chunkX, chunkZ } = d
    await ChunkDumper.saveChunkLightFiles(path.join(folder, 'chunk_light_' + chunkX + '_' + chunkZ + '.dump'),
      path.join(folder, 'chunk_light_' + chunkX + '_' + chunkZ + '.meta'), d)
  }

  static async saveChunkLightFiles (chunkLightDataFile, chunkLightMetaFile, {
    chunkX, chunkZ,
    skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data, trustEdges
  }) {
    if (Buffer.isBuffer(data)) {
      await fs.writeFile(chunkLightDataFile, data)
    } else if (data !== undefined) { // 1.17 doesn't have a data property in their update_light packet
      await fs.writeFile(chunkLightDataFile, JSON.stringify(data))
    }
    await fs.writeFile(chunkLightMetaFile, JSON.stringify({
      chunkX,
      chunkZ,
      skyLightMask,
      blockLightMask,
      emptySkyLightMask,
      emptyBlockLightMask,
      skyLight,
      blockLight,
      trustEdges
    }), 'utf8')
  }

  stopSavingChunks () {
    this.removeListener('chunk', this.savingChunk)
    this.removeListener('chunk_light', this.savingChunkLight)
  }
}

module.exports = ChunkDumper
