/* eslint-env mocha */

const assert = require('assert')
const util = require('util')
const path = require('path')
const exec = util.promisify(require('child_process').exec)

const CMD_PATH = path.resolve(__dirname, '..', 'bin', 'cmd.js')
const CMD = 'node ' + CMD_PATH

describe(`chunkDumper cli`, () => {
  it('has an help', async () => {
    const { stdout, stderr } = await exec(CMD + 'help')
    assert.strictEqual(stderr, '')
    assert(stdout.toLowerCase().includes('usage'))
  })
})
