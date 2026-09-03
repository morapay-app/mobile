import { StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

export type ScreenProps = ViewProps & {
  surface?: 'base' | 'panel' | 'light';
};

/** Full-bleed screen background matching one of munckins-web's surface layers. */
export function Screen({ surface = 'base', style, children, ...rest }: ScreenProps) {
  const theme = useTheme();
  const backgroundColor =
    surface === 'light' ? theme.colors.background.light : theme.colors.background[surface];

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor }]}>
      <View style={[styles.flex, { padding: theme.spacing.lg }, style]} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
