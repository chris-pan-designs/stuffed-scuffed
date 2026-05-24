const PHOTOROOM_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment';

export type RemoveBackgroundResult = {
  cutoutUri: string;
  maskUri: string;
};

type LocalImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
};

const getPhotoRoomApiKey = () => process.env.EXPO_PUBLIC_PHOTOROOM_API_KEY;

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

const createImageFormData = (image: LocalImage, mode: 'cutout' | 'mask') => {
  const formData = new FormData();

  formData.append('image_file', {
    uri: image.uri,
    name: getUploadName(image),
    type: getUploadType(image),
  } as unknown as Blob);
  formData.append('format', 'png');

  if (mode === 'mask') {
    formData.append('channels', 'alpha');
  }

  return formData;
};

const requestPhotoroomImage = async (image: LocalImage, mode: 'cutout' | 'mask') => {
  const apiKey = getPhotoRoomApiKey();

  if (!apiKey) {
    throw new Error('Missing Photoroom API key. Add EXPO_PUBLIC_PHOTOROOM_API_KEY to your .env file.');
  }

  const response = await fetch(PHOTOROOM_SEGMENT_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
    },
    body: createImageFormData(image, mode),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Photoroom could not remove the background.');
  }

  const blob = await response.blob();
  return blobToDataUri(blob, 'Photoroom returned an unreadable image.');
};

export async function removeBackground(image: LocalImage): Promise<RemoveBackgroundResult> {
  const [cutoutUri, maskUri] = await Promise.all([
    requestPhotoroomImage(image, 'cutout'),
    requestPhotoroomImage(image, 'mask'),
  ]);

  return { cutoutUri, maskUri };
}
