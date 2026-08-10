declare module "mammoth" {
  interface MammothResult {
    value: string;
    messages: unknown[];
  }
  interface ConvertOptions {
    buffer?: unknown;
    arrayBuffer?: ArrayBuffer;
  }
  const mammoth: {
    convertToHtml(options: ConvertOptions): Promise<MammothResult>;
  };
  export default mammoth;
}
