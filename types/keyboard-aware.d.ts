declare module 'react-native-keyboard-aware-scroll-view/lib/KeyboardAwareScrollView' {
  import { ComponentType } from 'react';
  import { ScrollViewProps } from 'react-native';
  const KeyboardAwareScrollView: ComponentType<
    ScrollViewProps & {
      enableOnAndroid?: boolean;
      extraScrollHeight?: number;
      keyboardOpeningTime?: number;
      keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
    }
  >;
  export default KeyboardAwareScrollView;
}


