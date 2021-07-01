const path = require('path')
module.exports = {
  makeLocalPath: (...pathElems) => path.join(__dirname, ...pathElems)
}
