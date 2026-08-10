declare module "fonteditor-core" {
  export interface FontLike {
    write(opts: { type: string }): ArrayBuffer;
  }
  export interface FontModule {
    create(buffer?: ArrayBuffer, opts?: { type: string }): FontLike;
  }
  export interface Woff2Module {
    init(url?: string): Promise<void>;
  }
  const FontLib: { Font: FontModule; woff2: Woff2Module };
  export default FontLib;
}
