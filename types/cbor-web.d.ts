declare module 'cbor-web' {
  export function decodeFirst(data: ArrayBuffer | Uint8Array): Promise<any>;
  export function decodeAll(data: ArrayBuffer | Uint8Array): Promise<any[]>;
  export function encode(data: any): ArrayBuffer;
  export function encodeOne(data: any): ArrayBuffer;

  export class Decoder {
    constructor(data: ArrayBuffer | Uint8Array);
    decodeFirst(): Promise<any>;
    decodeAll(): Promise<any[]>;
  }

  export class Tagged {
    tag: number;
    value: any;
    constructor(tag: number, value: any);
  }

  export class Map extends globalThis.Map {
    get(key: any): any;
    set(key: any, value: any): this;
  }
}
