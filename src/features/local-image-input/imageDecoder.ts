import type { DecodedImageResource, ImageDimensions } from './types';

export type HtmlImageElementFactory = () => HTMLImageElement;

export async function decodeImageFromObjectUrl(
  objectUrl: string,
  createImage: HtmlImageElementFactory = () => new Image(),
): Promise<ImageDimensions> {
  const resource = await decodeImageResourceFromObjectUrl(objectUrl, createImage);
  return Object.freeze({ width: resource.width, height: resource.height });
}

export function decodeImageResourceFromObjectUrl(
  objectUrl: string,
  createImage: HtmlImageElementFactory = () => new Image(),
): Promise<DecodedImageResource> {
  return new Promise((resolve, reject) => {
    const image = createImage();

    const cleanup = (): void => {
      image.onload = null;
      image.onerror = null;
    };

    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      cleanup();

      if (width <= 0 || height <= 0) {
        reject(new Error('Decoded image did not report valid dimensions.'));
        return;
      }

      resolve(Object.freeze({ width, height, image }));
    };

    image.onerror = () => {
      cleanup();
      reject(new Error('The selected file could not be decoded as an image.'));
    };

    image.decoding = 'async';
    image.src = objectUrl;
  });
}
