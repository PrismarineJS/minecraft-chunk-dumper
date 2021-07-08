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
const wait = util.promisify(setTimeout)

class ChunkDumper extends EventEmitter {
  constructor (version) {
    super()
    this.version = version.toString()
    this.mcData = require('minecraft-data')(this.version)
    this.withLightPackets = this.mcData.isNewerOrEqualTo('1.14')
  }

  async start () {
    await fs.rm(MC_SERVER_PATH, { force: true, recursive: true })
    debug('downloading server')
    await new Promise((resolve, reject) => {
      downloadServer(this.version, MC_SERVER_JAR, (err, data) => {
        if (err) reject(err)
        resolve(data)
      })
    })
    debug('done downloading server')
    this.server = new WrapServer(MC_SERVER_JAR, MC_SERVER_PATH)
    this.server.startServerAsync = util.promisify(this.server.startServer)
    this.server.stopServerAsync = util.promisify(this.server.stopServer)
    this.server.deleteServerDataAsync = util.promisify(this.server.deleteServerData)

    debug('starting server')
    this.server.on('line', (line) => {
      debug(line)
    })
    await this.server.startServerAsync({ 'server-port': 25569, 'online-mode': 'false', gamemode: 'creative' })
    debug('connecting client')
    this.client = mc.createClient({
      username: 'Player',
      version: this.version,
      port: 25569
    })
    this.client.on('map_chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, blockEntities }) => {
      this.emit('chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, blockEntities }))
    })
    this.client.on('update_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data }) => {
      this.emit('chunk_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data }))
    })
  }

  async logBackIn () {
    this.client = mc.createClient({
      username: 'Player',
      version: this.version,
      port: 25569
    })
    this.client.on('map_chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, blockEntities }) => {
      this.emit('chunk', ({ x, z, groundUp, bitMap, biomes, chunkData, blockEntities }))
    })
    this.client.on('update_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data }) => {
      this.emit('chunk_light', ({ chunkX, chunkZ, skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data }))
    })
  }

  async stop () {
    this.client.end()
    debug('stopping server')
    await this.server.stopServerAsync()
    debug('deleting server')
    await fs.rm(this.server.MC_SERVER_PATH, { force: true, recursive: true })
    debug('deleting data')
    await fs.rm('versions', { force: true, recursive: true })
    debug('done deleting data')
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
    let stillRunning = true // needed so we dont send the chat message after the client is .end'ed
    count = parseInt(count)
    const isDoneCollecting = () => {
      let isDoneCollecting = true
      // const lightArray = Array.from(lightsSaved)
      /*
      if (this.withLightPackets) { // has enough light & chunk packets
        console.log(`${(lightArray.filter(x => chunksSaved.has(x))).length}/${count}`)
        isDoneCollecting = isDoneCollecting && (lightArray.filter(x => chunksSaved.has(x))).length >= count + 1
      } else { // has enough chunk packets
        isDoneCollecting = isDoneCollecting && chunksSaved.size >= count
      }
      */
      console.log('chunksSaved.size', chunksSaved.size, 'lightsSaved.size', lightsSaved.size, 'count', count)
      isDoneCollecting = isDoneCollecting && (chunksSaved.size === count && lightsSaved.size === count)
      isDoneCollecting = isDoneCollecting && chunkTileEntitiesSaved
      return isDoneCollecting
    }
    const removeListeners = () => {
      this.removeListener('chunk', saveChunk)
      if (this.withLightPackets) this.removeListener('chunk_light', saveChunkLight)
    }
    const generateTileEntity = async () => {
      await wait(2000)
      if (!chunkTileEntitiesSaved && stillRunning) {
        this.server.writeServer(`/op ${this.client.username}\n`)
        await wait(100)
        if (stillRunning) this.client.write('chat', { message: '/setblock ~ ~ ~1 beacon' })
      }
    }
    try { await fs.mkdir(folder, { recursive: true }) } catch (err) {}
    const lightsSaved = new Set()
    const chunksSaved = new Set()
    const commonChunks = new Set()
    let chunkTileEntitiesSaved = false // has recieved chunk packet w/ tile entities
    let saveChunk, saveChunkLight
    await new Promise((resolve, reject) => {
      const savePacket = async (packetType, d) => {
        const positionString = packetType === 'chunk' ? `${d.x},${d.z}` : `${d.chunkX},${d.chunkZ}` // type ? 'chunk' : 'light'
        if (!commonChunks.has(positionString) && commonChunks.size <= (chunkTileEntitiesSaved ? count : count - 1)) {
          commonChunks.add(positionString)
        } else if (!commonChunks.has(positionString)) return // only want chunks that match their light chunk data
        try {
          switch (packetType) {
            case 'chunk':
              if (!chunkTileEntitiesSaved && chunksSaved.size >= count) break // leave the last chunk packet for if we dont have a blockEntity packet
              else if (chunkTileEntitiesSaved && chunksSaved.size >= count) break
              chunksSaved.add(positionString)
              if (forcedFileNames !== undefined) await ChunkDumper.saveChunkFiles(forcedFileNames.chunkFile, forcedFileNames.metaFile, d)
              else await ChunkDumper.saveChunkFilesToFolder(folder, d)
              break
            case 'light':
              lightsSaved.add(positionString)
              if (lightsSaved.size > count) break
              if (forcedFileNames !== undefined) await ChunkDumper.saveChunkLightFiles(forcedFileNames.chunkLightFile, forcedFileNames.lightMetaFile, d)
              else await ChunkDumper.saveChunkLightFilesToFolder(folder, d)
              break
          }
          if (isDoneCollecting()) {
            removeListeners()
            stillRunning = false
            resolve()
          }
        } catch (err) {
          removeListeners()
          stillRunning = false
          reject(err)
        }
      }
      saveChunk = async d => {
        if (!chunkTileEntitiesSaved && d.blockEntities?.length !== 0) chunkTileEntitiesSaved = true
        await savePacket('chunk', d)
      }
      this.on('chunk', saveChunk)
      if (this.withLightPackets) {
        saveChunkLight = async d => savePacket('light', d)
        this.on('chunk_light', saveChunkLight)
      }

      generateTileEntity()
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

  static async saveChunkLightFiles (chunkLightDataFile, chunkLightMetaFile, {
    chunkX, chunkZ,
    skyLightMask, blockLightMask, emptySkyLightMask, emptyBlockLightMask, skyLight, blockLight, data
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
      blockLight
    }), 'utf8')
  }

  stopSavingChunks () {
    this.removeListener('chunk', this.savingChunk)
    this.removeListener('chunk_light', this.savingChunkLight)
  }
}

module.exports = ChunkDumper
