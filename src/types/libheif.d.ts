// מפענח HEIC (libheif-js, נטען בדינמיות רק כשמגיע קובץ HEIC — ראה src/utils/imageToPdf.ts).
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    has_alpha_channel(): boolean;
    display(target: { data: Uint8ClampedArray; width: number; height: number }, cb: (out: unknown) => void): void;
    free(): void;
  }
  export interface LibHeif {
    HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
  }
  const factory: (opts?: Record<string, unknown>) => LibHeif;
  export default factory;
}
