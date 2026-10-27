import type { ProfileAvatarSelection } from './profileEditing';
import { avatarPickerOptions, normalizePickedAvatar, type PickerResult } from './avatarPickerCore';

export { normalizePickedAvatar } from './avatarPickerCore';

type ImagePickerModule = {
  launchImageLibraryAsync(options: {
    allowsEditing: boolean;
    aspect: [number, number];
    base64: boolean;
    mediaTypes: string[];
    quality: number;
    selectionLimit: number;
  }): Promise<PickerResult>;
};

type ImagePickerLoader = () => Promise<ImagePickerModule>;

const moduleUnavailableMessage = '当前安装包不包含头像选择组件，请重新构建并安装最新版 DOSO App。';

async function loadImagePicker() {
  return await import('expo-image-picker') as ImagePickerModule;
}

export async function pickProfileAvatar(loadPicker: ImagePickerLoader = loadImagePicker): Promise<ProfileAvatarSelection | null> {
  let imagePicker: ImagePickerModule;
  try {
    imagePicker = await loadPicker();
  } catch {
    throw new Error(moduleUnavailableMessage);
  }

  let result: PickerResult;
  try {
    result = await imagePicker.launchImageLibraryAsync(avatarPickerOptions);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '';
    if (/native module|cannot find|not installed|unavailable/i.test(message)) {
      throw new Error(moduleUnavailableMessage);
    }
    throw error;
  }

  return normalizePickedAvatar(result);
}
