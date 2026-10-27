import type { ProfileAvatarSelection } from './profileEditing';

export type PickerResult = {
  assets: { base64?: string | null; mimeType?: string | null; uri: string }[] | null;
  canceled: boolean;
};

export const avatarPickerOptions = {
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  base64: true,
  mediaTypes: ['images'] as ['images'],
  quality: 0.82,
  selectionLimit: 1,
};

export function normalizePickedAvatar(result: PickerResult): ProfileAvatarSelection | null {
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri || !asset.base64) {
    throw new Error('未能读取所选图片，请换一张 JPEG 或 PNG 图片重试。');
  }
  const normalizedBase64 = asset.base64.replace(/\s+/g, '');
  const estimatedBytes = Math.floor((normalizedBase64.length * 3) / 4)
    - (normalizedBase64.endsWith('==') ? 2 : normalizedBase64.endsWith('=') ? 1 : 0);
  if (estimatedBytes <= 0 || estimatedBytes > 3 * 1024 * 1024) {
    throw new Error('头像文件需小于或等于 3 MiB，请裁剪或换一张图片。');
  }
  const mimeType: ProfileAvatarSelection['mimeType'] = /^\/9j\//.test(normalizedBase64)
    ? 'image/jpeg'
    : /^iVBORw0KGgo/.test(normalizedBase64)
      ? 'image/png'
      : (() => { throw new Error('头像内容不是有效的 JPEG 或 PNG 图片，请重新选择。'); })();
  return { uri: asset.uri, base64: normalizedBase64, mimeType };
}
