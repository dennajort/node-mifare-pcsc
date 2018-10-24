'use strict';

const {
  byteFromTwoHex,
  DEFAULT_END_ACS,
  KEY_TYPE_A,
  KEY_TYPE_B,
} = require("./common");

const standardCallback = (cb) => (err, data) => {
  if (err) return cb(err);
  switch (data.toString("hex")) {
    case "9000":
      cb(null);
      break;
    case "6300":
      cb("failed");
      break;
    default:
      cb("undefined");
      throw new Error(`Undefined data: ${ data.toString("hex") }`);
  }
};

const readCallback = (cb) => (err, data) => {
  if (err) return cb(err);
  switch (data.slice(data.length - 2).toString("hex")) {
    case "9000":
      cb(null, data.slice(0, data.length - 2));
      break;
    case "6300":
      cb("failed");
      break;
    default:
      cb("undefined");
      throw new Error(`Undefined data: ${ data.toString("hex") }`);
  }
};

module.exports = class Card {
  constructor(reader, protocol) {
    this.reader = reader;
    this.protocol = protocol;
  }

  static packACS(c1, c2, c3) {
    if (c1 < 0 || c1 > 0xF) throw new Error('C1 is out of range');
    if (c2 < 0 || c2 > 0xF) throw new Error('C2 is out of range');
    if (c3 < 0 || c3 > 0xF) throw new Error('C3 is out of range');
    return Buffer.from([
      byteFromTwoHex(~c2, ~c1),
      byteFromTwoHex(c1, ~c3),
      byteFromTwoHex(c3, c2),
      DEFAULT_END_ACS,
    ]);
  }

  static unpackACS(data) {
    if (data.length !== 4) throw new Error("Buffer length is wrong");
    return {
      c1: (data[1] & 0xF0) >> 4,
      c2: data[2] & 0xF,
      c3: (data[2] & 0xF0) >> 4,
    };
  }

  static packTrailer(keya, keyb, c1, c2, c3) {
    if (keya.length !== 6) throw new Error("KEY A length is wrong");
    if (keyb.length !== 6) throw new Error("KEY B length is wrong");
    return Buffer.concat([
      Buffer.from(keya),
      Card.packACS(c1, c2, c3),
      Buffer.from(keyb),
    ]);
  }

  static unpackTrailer(data) {
    if (data.length !== 16) throw new Error("Buffer length is wrong");
    return {
      keya: data.slice(0, 6),
      acs: Card.unpackACS(data.slice(6, 10)),
      keyb: data.slice(10, 16),
    };
  }

  getUID(cb) {
    this.reader.transmit(Buffer.from([0xFF, 0xCA, 0, 0, 0]), 6, this.protocol, readCallback(cb));
  }

  loadAuthKey(nb, key, cb) {
    if (nb < 0 || nb > 0x20) throw new Error("Key Number is out of range");
    if (key.length !== 6) throw new Error("Key length should be 6");
    const buff = Buffer.concat([
      Buffer.from([0xFF, 0x82, (nb === 0x20) ? 0x20 : 0, nb, 6]),
      Buffer.from(key),
    ]);
    this.reader.transmit(buff, 2, this.protocol, standardCallback(cb));
  }

  authenticate(block, type, key, cb) {
    if (type !== KEY_TYPE_A && type !== KEY_TYPE_B) throw new Error("Wrong key type");
    if (block < 0 || block > 0x3F) throw new Error("Block out of range");
    if (key < 0 || key > 0x20) throw new Error("Key Number out of range");
    this.reader.transmit(
      Buffer.from([0xFF, 0x86, 0, 0, 5, 1, 0, block, type, key]),
      2, this.protocol, standardCallback(cb)
    );
  }

  readBlock(block, length, cb) {
    if (block < 0 || block > 0x3F) throw new Error("Block out of range");
    if (length !== 0x10 && length !== 0x20 && length !== 0x30) throw new Error("Bad length");
    this.reader.transmit(
      Buffer.from([0xFF, 0xB0, 0, block, length]),
      length + 2, this.protocol, readCallback(cb)
    );
  }

  updateBlock(block, data, cb) {
    if (block < 0 || block > 0x3F) throw new Error("Block out of range");
    if (data.length !== 0x10 && data.length !== 0x20 && data.length !== 0x30) {
      throw new Error("Bad length");
    }
    const buff = Buffer.concat([
      Buffer.from([0xFF, 0xD6, 0, block, data.length]),
      Buffer.from(data),
    ]);
    this.reader.transmit(buff, 2, this.protocol, standardCallback(cb));
  }

  restoreBlock(src, dest, cb) {
    if (src < 0 || src > 0x3F) throw new Error("Source block out of range");
    if (dest < 0 || dest > 0x3F) throw new Error("Destination block out of range");
    if (((src / 4) | 0) !== ((dest / 4) | 0)) throw new Error("Blocks are not in the same sector");
    this.reader.transmit(
      Buffer.from([0xFF, 0xD7, 0, src, 2, 3, dest]),
      2, this.protocol, standardCallback(cb)
    );
  }
};
