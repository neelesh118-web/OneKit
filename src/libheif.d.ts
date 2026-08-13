/**
 * Minimal declarations for `libheif-js/wasm-bundle` — the package only ships
 * raw Emscripten bindings (no HeifDecoder types), so the tiny surface the
 * converter uses is declared here instead.
 */
declare module "libheif-js/wasm-bundle" {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      data: { data: Uint8ClampedArray; width: number; height: number },
      callback: (displayData: unknown) => void
    ): void;
  }

  export interface HeifDecoder {
    decode(data: Uint8Array): HeifImage[];
  }

  export interface HeifDecoderCtor {
    new (): HeifDecoder;
  }

  export const HeifDecoder: HeifDecoderCtor;
}
