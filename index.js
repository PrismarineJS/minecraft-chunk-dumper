const EventEmitter = require('events').EventEmitter
const WrapServer = require('minecraft-wrap').WrapServer
const downloadServer = require('minecraft-wrap').downloadServer
const path = require('path')
const os = require('os')
const { Vec3 } = require('vec3')
const MC_SERVER_PATH = path.join(os.tmpdir(), 'server')
const MC_SERVER_JAR = path.join(os.tmpdir(), 'server.jar')
const fs = require('fs').promises
const util = require('util')
const mc = require('minecraft-protocol')
const debug = require('debug')('chunk-dumper')

class ChunkDumper extends EventEmitter {
  constructor (version) {
    super()
    this.version = version
    this.mcData = require('minecraft-data')(version)
    this.withLightPackets = this.mcData.isNewerOrEqualTo('1.14')
    this.withTileEntities = true
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
      if (line.includes('logged in')) {
        const [, xStr, yStr, zStr] = line.match(/(?:.+)\[(?:.+)\] logged in with entity id \d+ at \((-?\d+.\d), (-?\d+.\d), (-?\d+.\d)\)/)
        const vec = new Vec3(+xStr, +yStr, +zStr)
        const { x, y, z } = vec.floored().add(new Vec3(1, 0, 0))
        this.server.writeServer(`/setblock ${x} ${y} ${z} ${this.mcData.blocksByName.white_bed ? 'white_bed' : 'bed'}\n`)
      }
      debug(line)
    })
    await this.server.startServerAsync({ 'server-port': 25569, 'online-mode': 'false', gamemode: 'creative' })
    this.server.on('line', line => console.log('server: ' + line))
    debug('connecting client')
    this.client = mc.createClient({
      username: 'Player',
      version: this.version,
      port: 25569
    })
    this.client.on('map_chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, blockEntities }) => {
      this.emit('chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, blockEntities }))
    })
    this.client.on('update_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, data }) => {
      this.emit('chunk_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, data }))
    })
    this.client.on('tile_entity_data', ({ location, action, nbtData }) => {
      console.log('fadshjafdjhfdb')
      this.emit('tile_entity', ({ location, action, nbtData }))
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

  async saveChunk (chunkFile, metaFile, chunkLightFile, lightMetaFile, metaEntityFile) {
    await this.saveChunks('', 1, {
      chunkFile,
      metaFile,
      chunkLightFile,
      lightMetaFile,
      metaEntityFile
    })
  }

  async saveChunks (folder, count, forcedFileNames = undefined) {
    try {
      await fs.mkdir(folder)
    } catch (err) {

    }
    const lightsSaved = new Set()
    const chunksSaved = new Set()
    const tileEntitiesSaved = new Set()
    // tileEntitiesSaved.add(null)
    await new Promise((resolve, reject) => {
      let saveChunkLight, saveTileEntities
      const saveChunk = async d => {
        const { x, z } = d
        chunksSaved.add(`${x},${z}`)
        let finished = false

        if (
          (!this.withLightPackets && !this.withTileEntities && chunksSaved.size === count) || // no light or tile ent's
          (this.withLightPackets && !this.withTileEntities && ([...lightsSaved].filter(x => chunksSaved.has(x))).length >= count) || // only light
          (!this.withLightPackets && this.withTileEntities && tileEntitiesSaved.size >= 1) || // only tile entities
          (this.withTileEntities && this.withLightPackets && ([...lightsSaved].filter(x => chunksSaved.has(x))).length >= count && tileEntitiesSaved.size >= 1) // both tile and light
        ) {
          this.removeListener('chunk', saveChunk)
          if (this.withLightPackets) this.removeListener('chunk_light', saveChunkLight)
          if (this.withTileEntities) this.removeListener('tile_entity', saveTileEntities)
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
          if (
            (!this.withTileEntities && ([...lightsSaved].filter(x => chunksSaved.has(x))).length >= count) ||
            (this.withTileEntities && ([...lightsSaved].filter(x => chunksSaved.has(x))).length >= count && tileEntitiesSaved.size >= 1)
          ) {
            this.removeListener('chunk', saveChunk)
            this.removeListener('chunk_light', saveChunkLight)
            if (this.saveTileEntities) this.removeListener('tile_entity', saveTileEntities)
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

      if (this.withTileEntities) {
        saveTileEntities = async d => {
          const { location: { x, y, z } } = d
          tileEntitiesSaved.add(`${x},${y},${z}`)
          let finished = false
          if (
            (!this.withLightPackets && tileEntitiesSaved.size >= 1) ||
            (this.withLightPackets && ([...lightsSaved].filter(x => chunksSaved.has(x))).length >= count && tileEntitiesSaved.size >= 1)
          ) {
            this.removeListener('chunk', saveChunk)
            this.removeListener('tile_entity', saveTileEntities)
            if (this.withLightPackets) this.removeListener('chunk_light', saveChunkLight)
            finished = true
          }
          try {
            if (forcedFileNames !== undefined) {
              await ChunkDumper.saveTileEntityFiles(forcedFileNames.metaEntityFile, d)
            } else {
              await ChunkDumper.saveTileEntitiesToFolder(folder, d)
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
        this.on('tile_entity', saveTileEntities)
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
    if (this.withTileEntities) {
      this.savingTileEntity = async d => {
        try {
          await ChunkDumper.saveTileEntitiesToFolder(folder, d)
        } catch (err) {
          this.stopSavingChunks()
          throw err
        }
      }
      this.on('tile_entity', this.savingTileEntity)
    }
  }

  static async saveChunkFilesToFolder (folder, d) {
    const { x, z } = d
    await ChunkDumper.saveChunkFiles(path.join(folder, 'chunk_' + x + '_' + z + '.dump'),
      path.join(folder, 'chunk_' + x + '_' + z + '.meta'), d)
  }

  static async saveChunkFiles (chunkDataFile, chunkMetaFile, { x, z, groundUp, bitMap, biomes, chunkData, blockEntities }) {
    await fs.writeFile(chunkDataFile, chunkData)
    await fs.writeFile(chunkMetaFile, JSON.stringify({
      x, z, groundUp, bitMap, biomes, blockEntities
    }), 'utf8')
  }

  static async saveChunkLightFilesToFolder (folder, d) {
    const { chunkX, chunkZ } = d
    await ChunkDumper.saveChunkLightFiles(path.join(folder, 'chunk_light_' + chunkX + '_' + chunkZ + '.dump'),
      path.join(folder, 'chunk_light_' + chunkX + '_' + chunkZ + '.meta'), d)
  }

  static async saveTileEntitiesToFolder (folder, d) {
    const { location: { x, y, z } } = d
    await ChunkDumper.saveTileEntityFiles(path.join(folder, `tile_entity_${x}_${y}_${z}.meta`), d)
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

  static async saveTileEntityFiles (tileEntityMetaFile, { location, action, nbtData }) {
    await fs.writeFile(tileEntityMetaFile, JSON.stringify({
      location,
      action,
      nbtData
    }), 'utf8')
  }

  stopSavingChunks () {
    this.removeListener('chunk', this.savingChunk)
    this.removeListener('chunk_light', this.savingChunkLight)
    this.removeListener('tile_entity', this.savingTileEntity)
  }
}

module.exports = ChunkDumper
