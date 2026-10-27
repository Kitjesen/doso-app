import { launchImageLibraryAsync } from 'expo-image-picker';
import type { ProfileAvatarSelection } from './profileEditing';
import { avatarPickerOptions, normalizePickedAvatar } from './avatarPickerCore';

// Keep the browser file dialog in the click's user-activation turn. Lazy loading
// here also asks static development exports to connect to a missing Metro HMR server.
export async function pickProfileAvatar(): Promise<ProfileAvatarSelection | null> {
  return normalizePickedAvatar(await launchImageLibraryAsync(avatarPickerOptions));
}
