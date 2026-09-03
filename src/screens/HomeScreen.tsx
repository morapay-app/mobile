import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '../components';
import { useTheme } from '../theme';

/**
 * Design-language demo screen: dark base surface, lowercase Manrope display
 * heading, Instrument Sans body copy, a hairline divider, and a primary pill
 * CTA — the same building blocks munckins-web's hero section uses.
 */
export function HomeScreen() {
  const theme = useTheme();

  return (
    <Screen surface="base">
      <View style={styles.content}>
        <Text variant="label" color={theme.colors.text.subtle}>
          morapay
        </Text>

        <Text variant="displayMd" style={{ marginTop: theme.spacing.md }}>
          your money, in control
        </Text>

        <Text
          variant="body"
          color={theme.colors.text.muted}
          style={{ marginTop: theme.spacing.sm, maxWidth: 320 }}
        >
          A starting point for the Morapay mobile app, themed after munckins&rsquo; dark,
          lowercase, hairline-bordered design language.
        </Text>

        <View
          style={[
            styles.divider,
            {
              borderTopColor: theme.colors.border.hairline,
              marginVertical: theme.spacing.xl,
            },
          ]}
        />

        <Button label="get started" onPress={() => {}} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
});
