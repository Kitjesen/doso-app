import { useContext, type Ref } from 'react';
import {
  Platform, StyleSheet, Text as NativeText, TextInput as NativeTextInput,
  type TextProps, type TextInputProps, type TextStyle,
} from 'react-native';
import { ProductFontContext, productFont } from '../fonts/home';

const webFont: TextStyle = {
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
};

function systemFont(style: TextProps['style']) {
  // Native text inherits platform fonts; explicit icon and monospace faces stay intact.
  return Platform.OS === 'web' && !StyleSheet.flatten(style)?.fontFamily ? webFont : undefined;
}

export type Text = NativeText;
export function Text({ style, ...props }: TextProps & { ref?: Ref<NativeText> }) {
  const productReady = useContext(ProductFontContext);
  return <NativeText {...props} style={[productReady ? productFont(style) : systemFont(style), style]} />;
}

export type TextInput = NativeTextInput;
export function TextInput({ style, ...props }: TextInputProps & { ref?: Ref<NativeTextInput> }) {
  const productReady = useContext(ProductFontContext);
  return <NativeTextInput {...props} style={[productReady ? productFont(style) : systemFont(style), style]} />;
}
