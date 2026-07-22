export interface ObjectUrlStore {
  readonly create: (file: File) => string;
  readonly revoke: (objectUrl: string) => void;
  readonly revokeAll: () => void;
}

export function createObjectUrlStore(): ObjectUrlStore {
  const activeUrls = new Set<string>();

  return {
    create(file) {
      const objectUrl = URL.createObjectURL(file);
      activeUrls.add(objectUrl);
      return objectUrl;
    },

    revoke(objectUrl) {
      if (activeUrls.delete(objectUrl)) {
        URL.revokeObjectURL(objectUrl);
      }
    },

    revokeAll() {
      for (const objectUrl of activeUrls) {
        URL.revokeObjectURL(objectUrl);
      }

      activeUrls.clear();
    },
  };
}
