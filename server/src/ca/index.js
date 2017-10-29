const protos = require('../protos')

const debug = require('debug')
const log = debug('nodetrust:ca')

module.exports = (swarm, config) => {
  let ca
  try {
    ca = require("./" + config.provider)
    ca = new ca(swarm, config)
  } catch (e) {
    e.stack = "Failed to load CA provider " + config.provider + ": " + e.stack
    throw e
  }

  swarm.handle('/nodetrust/ca/1.0.0', (protocol, conn) => {
    protos.server(conn, protos.ca, (data, respond) => {
      const cb = err => {
        if (err) log(err)
        respond({
          success: false
        })
      }
      conn.getPeerInfo((err, pi) => {
        if (err) return cb(err)
        const id = pi.id
        id.verify(data.certRequest, data.signature, (err, ok) => {
          if (err || !ok) return cb(err)
          ca.doCertRequest(data.certRequest, data.signature, (err, certificate) => {
            if (err) return cb(err)
            return respond({
              success: true,
              certificate
            })
          })
        })
      })
    })
  })
}
