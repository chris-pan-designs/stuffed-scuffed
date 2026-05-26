const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg';

export type RemoveBackgroundResult = {
  cutoutUri: string;
};

type LocalImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
};

const getRemoveBgApiKey = () => process.env.EXPO_PUBLIC_REMOVE_BG_API_KEY;

const getUploadName = (image: LocalImage) => image.fileName || 'plush-photo.jpg';

const getUploadType = (image: LocalImage) => image.mimeType || 'image/jpeg';

const blobToDataUri = (blob: Blob, errorMessage: string) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error(errorMessage));
    };

    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsDataURL(blob);
  });

const createImageFormData = (image: LocalImage) => {
  const formData = new FormData();

  formData.append('image_file', {
    uri: image.uri,
    name: getUploadName(image),
    type: getUploadType(image),
  } as unknown as Blob);
  formData.append('size', 'auto');
  formData.append('format', 'png');

  return formData;
};

const requestRemoveBgImage = async (image: LocalImage) => {
  const apiKey = getRemoveBgApiKey();

  if (!apiKey) {
    throw new Error('Missing remove.bg API key. Add EXPO_PUBLIC_REMOVE_BG_API_KEY to your .env file.');
  }

  const response = await fetch(REMOVE_BG_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
    },
    body: createImageFormData(image),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'remove.bg could not remove the background.');
  }

  const blob = await response.blob();
  return blobToDataUri(blob, 'remove.bg returned an unreadable image.');
};

export async function removeBackground(image: LocalImage): Promise<RemoveBackgroundResult> {
  const cutoutUri = await requestRemoveBgImage(image);

  return { cutoutUri };
}
