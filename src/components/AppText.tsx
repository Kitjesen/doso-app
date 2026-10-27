import { createContext, useContext, type Ref } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { FontReadyContext } from '../fonts/FontProvider';
import { getFontWeight, resolveFontStyle } from '../fonts/font-family';

const TextWeightContext = createContext<TextStyle['fontWeight']>(undefined);

// React 19 forwards ref as a regular prop. Export the instance type as well so
// existing useRef<TextInput>() callers retain the real native focus API.
export type Text = NativeText;
export function Text({ style, children, ...props }: TextProps & { ref?: Ref<NativeText> }) {
  const ready = useContext(FontReadyContext);
  const inheritedWeight = useContext(TextWeightContext);
  const flatStyle = StyleSheet.flatten(style);
  return (
    <NativeText {...props} style={[style, resolveFontStyle(flatStyle, ready, inheritedWeight)]}>
      <TextWeightContext.Provider value={getFontWeight(flatStyle, inheritedWeight)}>{children}</TextWeightContext.Provider>
    </NativeText>
  );
}

export type TextInput = NativeTextInput;
export function TextInput({ style, ...props }: TextInputProps & { ref?: Ref<NativeTextInput> }) {
  const ready = useContext(FontReadyContext);
  return <NativeTextInput {...props} style={[style, resolveFontStyle(StyleSheet.flatten(style), ready)]} />;
}
