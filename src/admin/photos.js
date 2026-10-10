import { api } from '../lib/api.js';

/** Shrinks a photo in the browser (max 1920px wide, JPEG) and uploads it. Returns its URL. */
export async function uploadPhoto(file, maxSize = 1920) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Please choose a JPG, PNG or WebP photo.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const data = canvas.toDataURL('image/jpeg', 0.85);
  const { url } = await api('/admin/uploads', { method: 'POST', body: { data } });
  return url;
}
