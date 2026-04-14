const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      t[n] = c
    }
    return t
  })()
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function makeChunk(type, data) {
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(data.length, 0)
  const typeB = Buffer.from(type, 'ascii')
  const crcVal = crc32(Buffer.concat([typeB, data]))
  const crcB = Buffer.allocUnsafe(4)
  crcB.writeUInt32BE(crcVal, 0)
  return Buffer.concat([len, typeB, data, crcB])
}

function createPNG(size, r, g, b) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const row = Buffer.allocUnsafe(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r
    row[1 + x * 3 + 1] = g
    row[1 + x * 3 + 2] = b
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const compressed = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))])
}

const publicDir = path.join(__dirname, '..', 'public')
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPNG(192, 15, 23, 42))
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPNG(512, 15, 23, 42))
console.log('✓ icon-192.png y icon-512.png generados')
