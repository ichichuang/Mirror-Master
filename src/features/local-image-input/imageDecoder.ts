import type { ImageDimensions } from './types';

export function decodeImageFromObjectUrl(objectUrl: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();

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

      resolve({ width, height });
    };

    image.onerror = () => {
      cleanup();
      reject(new Error('The selected file could not be decoded as an image.'));
    };

    image.decoding = 'async';
    image.src = objectUrl;
  });
}
