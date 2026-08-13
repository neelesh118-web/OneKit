/**
 * HEIC/HEIF decoding — the `libheif-js/wasm-bundle` module embeds the libheif
 * WASM binary as a base64 blob, so nothing is fetched at runtime and the
 * whole decode happens on-device (the same privacy rule as every converter).
 * The 1.4 MB module is lazy-loaded through a dynamic import, so it only
 * touches memory when someone actually converts an iPhone photo.
 */
interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(
    data: { data: Uint8ClampedArray; width: number; height: number },
    callback: (displayData: unknown) => void
  ): void;
}

interface HeifDecoderCtor {
  new (): { decode(data: Uint8Array): HeifImage[] };
}

export interface HeicBitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Guards against decompression bombs — 80 MP is beyond any phone photo. */
const MAX_PIXELS = 80_000_000;

/**
 * Decodes HEIC/HEIF bytes to raw RGBA pixels. Works in any host that can run
 * the WASM bundle (browser extension page, worker, or Node).
 */
export async function decodeHeic(bytes: Uint8Array): Promise<HeicBitmap> {
  const mod = (await import("libheif-js/wasm-bundle")) as unknown as {
    HeifDecoder: HeifDecoderCtor;
  };
  if (!mod.HeifDecoder) throw new Error("The HEIC decoder failed to load.");
  const decoder = new mod.HeifDecoder();
  let images: HeifImage[];
  try {
    images = decoder.decode(bytes);
  } catch (error) {
    throw new Error(
      `Couldn't decode this HEIC photo (${error instanceof Error ? error.message : "unknown error"}).`
    );
  }
  const image = images?.[0];
  if (!image) throw new Error("No image found in this HEIC/HEIF file.");
  const width = image.get_width();
  const height = image.get_height();
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("This HEIC image has no readable dimensions.");
  }
  if (width * height > MAX_PIXELS) {
    throw new Error("This HEIC image is too large to decode locally.");
  }
  const data = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data, width, height }, (displayData: unknown) => {
      if (!displayData) {
        reject(new Error("HEIF processing error — the photo may be corrupt."));
      } else {
        resolve();
      }
    });
  });
  return { width, height, data };
}

/**
 * Decodes a HEIC/HEIF photo to a JPEG on a canvas (the browser path the
 * converter uses — same as every other raster source). The canvas factory is
 * injectable for tests; the extension popup passes the shared one.
 */
export async function heicToJpeg(
  bytes: Uint8Array,
  canvasFactory?: () => HTMLCanvasElement
): Promise<Uint8Array> {
  const { width, height, data } = await decodeHeic(bytes);
  const canvas = canvasFactory?.() ?? document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable — cannot encode this HEIC photo.");
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(data);
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Could not encode the decoded HEIC photo to JPEG.");
  return new Uint8Array(await blob.arrayBuffer());
}
