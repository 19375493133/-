class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.chunkSamples = Math.round(sampleRate * 0.3);
    this.blocks = [];
    this.buffered = 0;
  }

  merge(count) {
    const output = new Float32Array(count);
    let offset = 0;
    while (offset < count && this.blocks.length > 0) {
      const block = this.blocks[0];
      const take = Math.min(block.length, count - offset);
      output.set(block.subarray(0, take), offset);
      offset += take;
      if (take === block.length) {
        this.blocks.shift();
      } else {
        this.blocks[0] = block.subarray(take);
      }
    }
    this.buffered -= count;
    return output;
  }

  resample(input, inputRate, outputRate) {
    if (inputRate === outputRate) {
      return input;
    }
    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const position = index * ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = position - left;
      output[index] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return output;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) {
      return true;
    }
    this.blocks.push(new Float32Array(input));
    this.buffered += input.length;

    while (this.buffered >= this.chunkSamples) {
      const merged = this.merge(this.chunkSamples);
      const resampled = this.resample(merged, sampleRate, this.targetSampleRate);
      const pcm = new Int16Array(resampled.length);
      for (let index = 0; index < resampled.length; index += 1) {
        const value = Math.max(-1, Math.min(1, resampled[index]));
        pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
