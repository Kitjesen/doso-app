import { useContext, type ComponentProps } from 'react';
import { ProductFontContext, productFont } from '../fonts/home';
import { Text as AppText, TextInput as AppInput } from './AppText';

export function Text({ style, ...props }: ComponentProps<typeof AppText>) {
  const ready = useContext(ProductFontContext);
  return <AppText {...props} style={[style, ready && productFont(style)]} />;
}

export function TextInput({ style, ...props }: ComponentProps<typeof AppInput>) {
  const ready = useContext(ProductFontContext);
  return <AppInput {...props} style={[style, ready && productFont(style)]} />;
}
