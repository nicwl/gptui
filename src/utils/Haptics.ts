import { Platform } from 'react-native';
import ReactNativeHapticFeedback, {
  HapticFeedbackTypes,
} from 'react-native-haptic-feedback';
import type { HapticOptions } from 'react-native-haptic-feedback';

const defaultOptions: HapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

function trigger(
  type?: keyof typeof HapticFeedbackTypes | HapticFeedbackTypes,
  options?: HapticOptions
): void {
  try {
    // Guard against no-op platforms (e.g., web) just in case
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    ReactNativeHapticFeedback.trigger(type, { ...defaultOptions, ...options });
  } catch {
    // Silently ignore haptic errors to keep UX smooth
  }
}

export const Haptics = {
  selection(): void {
    trigger(HapticFeedbackTypes.selection);
  },
  impactLight(): void {
    // Prefer the gentlest impact by default
    trigger(HapticFeedbackTypes.impactLight);
  },
  success(): void {
    // Use sparingly; slightly stronger than selection/impactLight
    trigger(HapticFeedbackTypes.notificationSuccess);
  },
};

export default Haptics;


