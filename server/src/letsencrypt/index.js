'use strict'

const LE = require('greenlock')
const storeCertbot = require('le-store-certbot')
const DnsChallenge = require('./dnsChallenge')
const sniChallenge = require('./fakeSni')

const debug = require('debug')
const log = debug('nodetrust:letsencrypt')
const path = require('path')
const _FAKECERT = path.join(__dirname, '..', '..')
const fs = require('fs')
const read = (...f) => fs.readFileSync(path.join(_FAKECERT, ...f)).toString()
const multihashing = require('multihashing-async')
const domainBase = require('base-x')('abcdefghijklmnopqrstuvwxyz0123456789-')

function leAgree (opts, agreeCb) {
  console.log('Agreeing to tos %s with email %s to obtain certificate for %s', opts.tosUrl, opts.email, opts.domains.join(', '))
  // opts = { email, domains, tosUrl }
  agreeCb(null, opts.tosUrl)
}

function idToCN (id, zone, cb) { // TODO: maybe refactor this method as it could be attacked
  let pref = 'id0'
  let suf = '.' + zone
  multihashing(Buffer.from(id), 'sha3-224', (err, digest) => {
    if (err) return cb(err)
    id = domainBase.encode(digest).substr(0, 64 - pref.length - suf.length)
    cb(null, pref + id + suf)
  })
}

class Letsencrypt {
  constructor (opt) {
    if (opt.stub) {
      this.pem = { cert: read('cert.pem'), key: read('key.pem') }
    }

    const debug = log.enabled
    const leStore = storeCertbot.create({
      configDir: opt.storageDir,
      debug,
      log
    })

    this.email = opt.email

    const dns = new DnsChallenge(opt)
    const sni = sniChallenge.create({})

    this.le = LE.create({
      server: LE[(opt.env || 'staging') + 'ServerUrl'] || opt.env,
      store: leStore,
      challenges: {
        'dns-01': dns,
        'tls-sni-01': sni
      },
      challengeType: 'dns-01',
      aggreeToTerms: leAgree,
      debug,
      log,
      version: 'v02'
    })
    this.le.challenges['dns-01'] = dns // workarround
    this.le.challenges['tls-sni-01'] = sni // added this so it STFU about tls-sni-01.loopback
  }
  handleRequest (id, zone, domains, cb) {
    if (this.pem) {
      const params = {
        error: false,
        privkey: this.pem.key,
        cert: this.pem.cert,
        chain: this.pem.cert
      }
      return cb(null, params)
    }
    if (!domains.length) return cb(new Error('No domains specified!'))
    idToCN(id, zone, (err, cn) => {
      if (err) return cb(err)
      domains = [cn].concat(domains)
      log('issue: %s as %s', domains[0], domains.slice(1).join(', '))
      this.le.register({
        domains,
        email: this.email,
        agreeTos: true, // yolo
        rsaKeySize: 2048,
        challengeType: 'dns-01'
      }).then(res => cb(null, res), cb)
    })
  }
}

module.exports = Letsencrypt
