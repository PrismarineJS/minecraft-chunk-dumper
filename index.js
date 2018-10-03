const EventEmitter = require('events').EventEmitter
const WrapServer = require('minecraft-wrap').WrapServer
const downloadServer = require('minecraft-wrap').downloadServer
const path = require('path')
const MC_SERVER_PATH = path.join(__dirname, 'server')
const MC_SERVER_JAR = path.join(__dirname, 'server.jar')
const fs = require('fs').promises
const util = require('util')
const mc = require('minecraft-protocol')
const debug = require('debug')('chunk-dumper')

class ChunkDumper extends EventEmitter {
  constructor (version) {
    super()
    this.version = version
  }

  async start () {
    debug('downloading server')
    await util.promisify(downloadServer)(this.version, MC_SERVER_JAR)
    this.server = new WrapServer(MC_SERVER_JAR, MC_SERVER_PATH)
    this.server.startServerAsync = util.promisify(this.server.startServer)
    this.server.stopServerAsync = util.promisify(this.server.stopServer)
    this.server.deleteServerDataAsync = util.promisify(this.server.deleteServerData)

    debug('starting server')
    await this.server.startServerAsync({ 'server-port': 25569, 'online-mode': 'false' })
    this.server.on('line', (line) => {
      debug(line)
    })
    debug('connecting client')
    this.client = mc.createClient({
      username: 'Player',
      version: this.version,
      port: 25569
    })
    this.client.on('map_chunk', ({ x, z, bitMap, chunkData }) => {
      this.emit('chunk', ({ x, z, bitMap, chunkData }))
    })
  }

  async stop () {
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

  async saveChunk (chunkFile, metaFile) {
    await new Promise((resolve, reject) => {
      this.once('chunk', async ({ x, z, bitMap, chunkData }) => {
        try {
          await fs.writeFile(chunkFile, chunkData)
          await fs.writeFile(metaFile, JSON.stringify({ x, z, bitMap }), 'utf8')
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    })
  }

  async saveChunks (folder, count) {

  }

  startSavingChunks (folder) {

  }

  stopSavingChunks () {

  }
}

module.exports = ChunkDumper
