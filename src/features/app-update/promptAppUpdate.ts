import { Alert, Linking } from 'react-native';
import {
  checkAndroidApkUpdate,
  DEFAULT_OTA_CHANNEL,
  formatApkSize,
  formatAppUpdateStatus,
  resolveOtaBaseUrl,
  validateApkDownloadUrl,
  type AndroidApkReleaseInfo,
} from './androidApkUpdater';
import { INSTALLED_APP_VERSION_CODE } from './appVersion';

function configuredOtaBaseUrl(): string {
  return resolveOtaBaseUrl(process.env.EXPO_PUBLIC_OTA_BASE_URL);
}

function configuredOtaChannel(): string {
  return process.env.EXPO_PUBLIC_OTA_CHANNEL?.trim() || DEFAULT_OTA_CHANNEL;
}

export async function openApkDownload(info: AndroidApkReleaseInfo): Promise<void> {
  const url = validateApkDownloadUrl(info.downloadUrl);
  await Linking.openURL(url);
}

export function promptApkUpdateDialog(
  info: AndroidApkReleaseInfo,
  onDownloadError?: () => void,
): void {
  const title = info.forceUpdate ? `需更新 v${info.versionName}` : `发现新版本 v${info.versionName}`;
  const sizeLabel = formatApkSize(info.apkSizeBytes);
  const changelog = info.changelog.trim();
  const detailParts = [changelog, sizeLabel ? `安装包 ${sizeLabel}` : ''].filter(Boolean);
  const message = detailParts.length > 0 ? detailParts.join('\n') : undefined;

  const downloadAction = {
    text: '立即下载',
    onPress: () => {
      void openApkDownload(info).catch(() => {
        onDownloadError?.();
      });
    },
  };
  const buttons = info.forceUpdate
    ? [downloadAction]
    : [{ text: '稍后', style: 'cancel' as const }, downloadAction];

  Alert.alert(title, message, buttons, { cancelable: !info.forceUpdate });
}

export async function checkAndPromptAppUpdate(options?: {
  onStatus?: (label: string) => void;
  onAvailable?: (info: AndroidApkReleaseInfo | null) => void;
  onDownloadError?: () => void;
}): Promise<AndroidApkReleaseInfo | null> {
  const info = await checkAndroidApkUpdate({
    baseUrl: configuredOtaBaseUrl(),
    channel: configuredOtaChannel(),
    currentVersionCode: INSTALLED_APP_VERSION_CODE,
  });
  const presentation = formatAppUpdateStatus(info);
  options?.onStatus?.(presentation.statusLabel);
  if (info?.updateAvailable) {
    options?.onAvailable?.(info);
    promptApkUpdateDialog(info, options?.onDownloadError);
  } else {
    options?.onAvailable?.(null);
  }
  return info;
}

