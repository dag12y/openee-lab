// Real WebAssembly IEEE-754 f64 numerical kernel for S3 Fourier synthesis and complex DFT.
// Operates directly on WebAssembly.Memory without copying intermediate vectors.

const OP = {
  UNREACHABLE: 0x00,
  BLOCK: 0x02,
  LOOP: 0x03,
  END: 0x0b,
  BR: 0x0c,
  BR_IF: 0x0d,
  CALL: 0x10,
  LOCAL_GET: 0x20,
  LOCAL_SET: 0x21,
  F64_LOAD: 0x2b,
  F64_STORE: 0x39,
  I32_CONST: 0x41,
  F64_CONST: 0x44,
  I32_GE_S: 0x4e,
  I32_GT_S: 0x4a,
  I32_ADD: 0x6a,
  I32_SUB: 0x6b,
  I32_MUL: 0x6c,
  F64_ADD: 0xa0,
  F64_SUB: 0xa1,
  F64_MUL: 0xa2,
  F64_DIV: 0xa3,
  F64_CONVERT_I32_S: 0xb7,
} as const;

const VAL = { i32: 0x7f, f64: 0x7c } as const;
const VOID = 0x40;

function uleb(value: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return out;
}

function sleb(value: number): number[] {
  const out: number[] = [];
  let v = value | 0;
  let more = true;
  while (more) {
    let byte = v & 0x7f;
    v >>= 7;
    if ((v === 0 && (byte & 0x40) === 0) || (v === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    out.push(byte);
  }
  return out;
}

function f64Bytes(value: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, true);
  return Array.from(new Uint8Array(buf));
}

function strBytes(text: string): number[] {
  const encoded = new TextEncoder().encode(text);
  return [...uleb(encoded.length), ...encoded];
}

function section(id: number, payload: number[]): number[] {
  return [id, ...uleb(payload.length), ...payload];
}

function buildWasmBinary(): Uint8Array {
  // Type 0: (f64) -> f64
  const type0 = [0x60, 1, VAL.f64, 1, VAL.f64];
  // Type 1: (outPtr:i32, tStart:f64, tStep:f64, count:i32, omega0:f64, a0:f64, aPtr:i32, bPtr:i32, harmonics:i32) -> void
  const type1 = [0x60, 9, VAL.i32, VAL.f64, VAL.f64, VAL.i32, VAL.f64, VAL.f64, VAL.i32, VAL.i32, VAL.i32, 0];
  // Type 2: (xPtr:i32, yPtr:i32, count:i32, kMin:i32, kMax:i32, outRePtr:i32, outImPtr:i32) -> void
  const type2 = [0x60, 7, VAL.i32, VAL.i32, VAL.i32, VAL.i32, VAL.i32, VAL.i32, VAL.i32, 0];

  const typeSec = section(1, [3, ...type0, ...type1, ...type2]);

  // Imports: env.cos (func 0), env.sin (func 1), env.mem (memory 0, min 16 pages = 1MB)
  const importSec = section(2, [
    3,
    ...strBytes("env"), ...strBytes("cos"), 0x00, 0,
    ...strBytes("env"), ...strBytes("sin"), 0x00, 0,
    ...strBytes("env"), ...strBytes("mem"), 0x02, 0x00, ...uleb(16),
  ]);

  // Functions: func 2 -> type 1, func 3 -> type 2
  const funcSec = section(3, [2, 1, 2]);

  // Exports: evalTrigSeries -> func 2, evalComplexDft -> func 3
  const exportSec = section(7, [
    2,
    ...strBytes("evalTrigSeries"), 0x00, 2,
    ...strBytes("evalComplexDft"), 0x00, 3,
  ]);

  // Body 2: evalTrigSeries
  // Params: 0:outPtr, 1:tStart, 2:tStep, 3:count, 4:omega0, 5:a0, 6:aPtr, 7:bPtr, 8:harmonics
  // Locals: 9:i(i32), 10:n(i32), 11:offset(i32), 12:t(f64), 13:sum(f64), 14:angle(f64)
  const body2 = [
    2, 3, VAL.i32, 3, VAL.f64,
    // i = 0
    OP.I32_CONST, ...sleb(0), OP.LOCAL_SET, 9,
    OP.BLOCK, VOID,
    OP.LOOP, VOID,
      // if (i >= count) break
      OP.LOCAL_GET, 9, OP.LOCAL_GET, 3, OP.I32_GE_S, OP.BR_IF, 1,
      // t = tStart + f64(i) * tStep
      OP.LOCAL_GET, 1,
      OP.LOCAL_GET, 9, OP.F64_CONVERT_I32_S,
      OP.LOCAL_GET, 2, OP.F64_MUL,
      OP.F64_ADD, OP.LOCAL_SET, 12,
      // sum = a0
      OP.LOCAL_GET, 5, OP.LOCAL_SET, 13,
      // n = 1
      OP.I32_CONST, ...sleb(1), OP.LOCAL_SET, 10,
      OP.BLOCK, VOID,
      OP.LOOP, VOID,
        // if (n > harmonics) break
        OP.LOCAL_GET, 10, OP.LOCAL_GET, 8, OP.I32_GT_S, OP.BR_IF, 1,
        // angle = f64(n) * omega0 * t
        OP.LOCAL_GET, 10, OP.F64_CONVERT_I32_S,
        OP.LOCAL_GET, 4, OP.F64_MUL,
        OP.LOCAL_GET, 12, OP.F64_MUL,
        OP.LOCAL_SET, 14,
        // offset = (n - 1) * 8
        OP.LOCAL_GET, 10, OP.I32_CONST, ...sleb(1), OP.I32_SUB,
        OP.I32_CONST, ...sleb(8), OP.I32_MUL,
        OP.LOCAL_SET, 11,
        // sum += a[n-1] * cos(angle) + b[n-1] * sin(angle)
        OP.LOCAL_GET, 13,
        OP.LOCAL_GET, 6, OP.LOCAL_GET, 11, OP.I32_ADD, OP.F64_LOAD, 3, 0,
        OP.LOCAL_GET, 14, OP.CALL, 0, OP.F64_MUL,
        OP.F64_ADD,
        OP.LOCAL_GET, 7, OP.LOCAL_GET, 11, OP.I32_ADD, OP.F64_LOAD, 3, 0,
        OP.LOCAL_GET, 14, OP.CALL, 1, OP.F64_MUL,
        OP.F64_ADD,
        OP.LOCAL_SET, 13,
        // n++
        OP.LOCAL_GET, 10, OP.I32_CONST, ...sleb(1), OP.I32_ADD, OP.LOCAL_SET, 10,
        OP.BR, 0,
      OP.END,
      OP.END,
      // out[i] = sum
      OP.LOCAL_GET, 0, OP.LOCAL_GET, 9, OP.I32_CONST, ...sleb(8), OP.I32_MUL, OP.I32_ADD,
      OP.LOCAL_GET, 13, OP.F64_STORE, 3, 0,
      // i++
      OP.LOCAL_GET, 9, OP.I32_CONST, ...sleb(1), OP.I32_ADD, OP.LOCAL_SET, 9,
      OP.BR, 0,
    OP.END,
    OP.END,
    OP.END,
  ];

  // Body 3: evalComplexDft
  // Params: 0:xPtr, 1:yPtr, 2:count, 3:kMin, 4:kMax, 5:outRePtr, 6:outImPtr
  // Locals: 7:k(i32), 8:m(i32), 9:outIdx(i32), 10:mOff(i32),
  //         11:accRe(f64), 12:accIm(f64), 13:angle(f64), 14:cs(f64), 15:sn(f64),
  //         16:xm(f64), 17:ym(f64), 18:tauOverM(f64)
  const body3 = [
    2, 4, VAL.i32, 8, VAL.f64,
    // tauOverM = 2*pi / f64(count)
    OP.F64_CONST, ...f64Bytes(2 * Math.PI),
    OP.LOCAL_GET, 2, OP.F64_CONVERT_I32_S, OP.F64_DIV, OP.LOCAL_SET, 18,
    // k = kMin, outIdx = 0
    OP.LOCAL_GET, 3, OP.LOCAL_SET, 7,
    OP.I32_CONST, ...sleb(0), OP.LOCAL_SET, 9,
    OP.BLOCK, VOID,
    OP.LOOP, VOID,
      // if (k > kMax) break
      OP.LOCAL_GET, 7, OP.LOCAL_GET, 4, OP.I32_GT_S, OP.BR_IF, 1,
      OP.F64_CONST, ...f64Bytes(0), OP.LOCAL_SET, 11,
      OP.F64_CONST, ...f64Bytes(0), OP.LOCAL_SET, 12,
      OP.I32_CONST, ...sleb(0), OP.LOCAL_SET, 8,
      OP.BLOCK, VOID,
      OP.LOOP, VOID,
        // if (m >= count) break
        OP.LOCAL_GET, 8, OP.LOCAL_GET, 2, OP.I32_GE_S, OP.BR_IF, 1,
        // angle = -tauOverM * f64(k * m)
        OP.F64_CONST, ...f64Bytes(0),
        OP.LOCAL_GET, 18,
        OP.LOCAL_GET, 7, OP.LOCAL_GET, 8, OP.I32_MUL, OP.F64_CONVERT_I32_S,
        OP.F64_MUL, OP.F64_SUB, OP.LOCAL_SET, 13,
        OP.LOCAL_GET, 13, OP.CALL, 0, OP.LOCAL_SET, 14,
        OP.LOCAL_GET, 13, OP.CALL, 1, OP.LOCAL_SET, 15,
        OP.LOCAL_GET, 8, OP.I32_CONST, ...sleb(8), OP.I32_MUL, OP.LOCAL_SET, 10,
        OP.LOCAL_GET, 0, OP.LOCAL_GET, 10, OP.I32_ADD, OP.F64_LOAD, 3, 0, OP.LOCAL_SET, 16,
        OP.LOCAL_GET, 1, OP.LOCAL_GET, 10, OP.I32_ADD, OP.F64_LOAD, 3, 0, OP.LOCAL_SET, 17,
        // accRe += xm * cs - ym * sn
        OP.LOCAL_GET, 11,
        OP.LOCAL_GET, 16, OP.LOCAL_GET, 14, OP.F64_MUL,
        OP.LOCAL_GET, 17, OP.LOCAL_GET, 15, OP.F64_MUL,
        OP.F64_SUB, OP.F64_ADD, OP.LOCAL_SET, 11,
        // accIm += xm * sn + ym * cs
        OP.LOCAL_GET, 12,
        OP.LOCAL_GET, 16, OP.LOCAL_GET, 15, OP.F64_MUL,
        OP.LOCAL_GET, 17, OP.LOCAL_GET, 14, OP.F64_MUL,
        OP.F64_ADD, OP.F64_ADD, OP.LOCAL_SET, 12,
        // m++
        OP.LOCAL_GET, 8, OP.I32_CONST, ...sleb(1), OP.I32_ADD, OP.LOCAL_SET, 8,
        OP.BR, 0,
      OP.END,
      OP.END,
      // outRe[outIdx] = accRe / count
      OP.LOCAL_GET, 5, OP.LOCAL_GET, 9, OP.I32_CONST, ...sleb(8), OP.I32_MUL, OP.I32_ADD,
      OP.LOCAL_GET, 11, OP.LOCAL_GET, 2, OP.F64_CONVERT_I32_S, OP.F64_DIV,
      OP.F64_STORE, 3, 0,
      // outIm[outIdx] = accIm / count
      OP.LOCAL_GET, 6, OP.LOCAL_GET, 9, OP.I32_CONST, ...sleb(8), OP.I32_MUL, OP.I32_ADD,
      OP.LOCAL_GET, 12, OP.LOCAL_GET, 2, OP.F64_CONVERT_I32_S, OP.F64_DIV,
      OP.F64_STORE, 3, 0,
      // k++, outIdx++
      OP.LOCAL_GET, 7, OP.I32_CONST, ...sleb(1), OP.I32_ADD, OP.LOCAL_SET, 7,
      OP.LOCAL_GET, 9, OP.I32_CONST, ...sleb(1), OP.I32_ADD, OP.LOCAL_SET, 9,
      OP.BR, 0,
    OP.END,
    OP.END,
    OP.END,
  ];

  const codeSec = section(10, [
    2,
    ...uleb(body2.length), ...body2,
    ...uleb(body3.length), ...body3,
  ]);

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...typeSec,
    ...importSec,
    ...funcSec,
    ...exportSec,
    ...codeSec,
  ]);
}

type WasmMemory = { readonly buffer: ArrayBuffer; grow(delta: number): number };
type WasmNamespace = {
  Memory: new (desc: { initial: number }) => WasmMemory;
  Module: new (bytes: ArrayBuffer) => object;
  Instance: new (mod: object, imports: Record<string, Record<string, unknown>>) => { exports: Record<string, unknown> };
};
const Wasm = (globalThis as unknown as { WebAssembly: WasmNamespace }).WebAssembly;

type WasmExports = {
  evalTrigSeries: (
    outPtr: number, tStart: number, tStep: number, count: number,
    omega0: number, a0: number, aPtr: number, bPtr: number, harmonics: number,
  ) => void;
  evalComplexDft: (
    xPtr: number, yPtr: number, count: number, kMin: number, kMax: number,
    outRePtr: number, outImPtr: number,
  ) => void;
};

class FourierWasmKernel {
  readonly memory: WasmMemory;
  readonly exports: WasmExports;
  readonly active: boolean;

  constructor() {
    this.memory = new Wasm.Memory({ initial: 16 });
    const bytes = buildWasmBinary();
    const mod = new Wasm.Module(bytes.buffer as ArrayBuffer);
    const instance = new Wasm.Instance(mod, {
      env: { cos: Math.cos, sin: Math.sin, mem: this.memory },
    });
    this.exports = instance.exports as unknown as WasmExports;
    this.active = true;
  }

  evalTrigSeries(
    tStart: number, tStep: number, count: number,
    omega0: number, a0: number, an: Float64Array, bn: Float64Array, harmonics: number,
  ): Float64Array {
    const nUsed = Math.min(harmonics, an.length, bn.length);
    const neededBytes = (count + 2 * nUsed) * 8;
    if (neededBytes > this.memory.buffer.byteLength) {
      this.memory.grow(Math.ceil((neededBytes - this.memory.buffer.byteLength) / 65536));
    }
    const f64 = new Float64Array(this.memory.buffer);
    const outPtr = 0;
    const aPtr = count * 8;
    const bPtr = (count + nUsed) * 8;
    f64.set(an.subarray(0, nUsed), count);
    f64.set(bn.subarray(0, nUsed), count + nUsed);
    this.exports.evalTrigSeries(outPtr, tStart, tStep, count, omega0, a0, aPtr, bPtr, nUsed);
    return new Float64Array(this.memory.buffer.slice(0, count * 8));
  }

  evalComplexDft(
    xs: Float64Array, ys: Float64Array, kMin: number, kMax: number,
  ): { re: Float64Array; im: Float64Array } {
    const count = xs.length;
    const kCount = kMax - kMin + 1;
    const neededBytes = (2 * count + 2 * kCount) * 8;
    if (neededBytes > this.memory.buffer.byteLength) {
      this.memory.grow(Math.ceil((neededBytes - this.memory.buffer.byteLength) / 65536));
    }
    const f64 = new Float64Array(this.memory.buffer);
    const xPtr = 0;
    const yPtr = count * 8;
    const rePtr = 2 * count * 8;
    const imPtr = (2 * count + kCount) * 8;
    f64.set(xs, 0);
    f64.set(ys, count);
    this.exports.evalComplexDft(xPtr, yPtr, count, kMin, kMax, rePtr, imPtr);
    const outView = new Float64Array(this.memory.buffer);
    return {
      re: new Float64Array(outView.subarray(2 * count, 2 * count + kCount)),
      im: new Float64Array(outView.subarray(2 * count + kCount, 2 * count + 2 * kCount)),
    };
  }
}

export const wasmKernel = new FourierWasmKernel();
