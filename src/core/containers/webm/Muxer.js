const { Transform } = require('stream');
const { Tag } = require('../../ebml');
const OpusHead = require('../../../opus/OpusHead');

class Muxer extends Transform {
  constructor(options) {
    options = {
      opusHead: new OpusHead(),
      clusterSize: 100,
      ...options,
    };
    super({ ...options, writableObjectMode: true });
    this.options = options;
    this.document = new Tag('EBML', [
      new Tag('EBMLVersion', 1),
      new Tag('EBMLReadVersion', 1),
      new Tag('EBMLMaxIDLength', 4),
      new Tag('EBMLMaxSizeLength', 8),
      new Tag('DocType', 'webm'),
      new Tag('DocTypeVersion', 4),
      new Tag('DocTypeReadVersion', 2),
    ]);
    this.segment = new Tag('Segment', [
      new Tag('Info', [
        new Tag('TimecodeScale', 1000000),
        new Tag('MuxingApp', 'amishshah/prism-media'),
        new Tag('WritingApp', 'amishshah/prism-media'),
      ]),
      new Tag('Tracks', [
        new Tag('TrackEntry', [
          new Tag('TrackNumber', 1),
          new Tag('TrackUID', 1),
          new Tag('FlagLacing', 0),
          new Tag('CodecDelay', 6500000),
          new Tag('SeekPreRoll', 80000000),
          new Tag('CodecID', 'A_OPUS'),
          new Tag('TrackType', 2),
          new Tag('Audio', [
            new Tag('Channels', this.options.opusHead.outputChannelCount),
            new Tag('SamplingFrequency', this.options.opusHead.inputSampleRate),
            new Tag('BitDepth', 16000),
          ]),
          new Tag('CodecPrivate', this.options.opusHead.encode()),
        ]),
      ]),
    ], { liveStream: true });
    this.push(Buffer.concat([this.document.encode(), this.segment.encode()]));
    this.frameCount = 0;
    this.frameDuration = 20;
    this.cluster = null;
    this._makeCluster();
  }

  _makeCluster() {
    if (this.cluster) {
      this.push(this.cluster.encode());
    }
    this.cluster = new Tag('Cluster', [
      new Tag('Timecode', this.frameCount * this.frameDuration),
    ]);
  }

  _flush(done) {
    this.push(this.cluster.encode());
    done();
  }

  _transform(chunk, encoding, done) {
    const buffer = Buffer.alloc(chunk.length + 4);
    buffer[0] = 0x81;
    buffer.writeUInt16BE((this.frameCount % this.options.clusterSize) * this.frameDuration, 1);
    buffer[3] = 1 << 7;
    chunk.copy(buffer, 4);
    const tag = new Tag('SimpleBlock', buffer);
    this.cluster.add(tag);
    if (this.frameCount % this.options.clusterSize === 0) {
      this._makeCluster();
    }
    this.frameCount++;
    done();
  }
}

module.exports = Muxer;
