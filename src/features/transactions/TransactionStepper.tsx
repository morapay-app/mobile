import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Blocks, ArrowLeftRight, Landmark, Check, LoaderCircle } from 'lucide-react-native';

import { swapColors, swapFonts } from '../swap/theme';
import { PIPELINE_STEP_ORDER, pipelineStepIndex, pipelineStepLabel, type PipelineStepStatus, type TransactionStatus } from './types';

type IconComponent = typeof Blocks;

const STEP_ICONS: Record<PipelineStepStatus, IconComponent> = {
  ON_CHAIN_CONFIRMING: Blocks,
  SWAP_PROCESSING: ArrowLeftRight,
  MOMO_SETTLEMENT: Landmark,
};

type StepState = 'done' | 'active' | 'upcoming';

/** The active step's spinner — a continuous 360° rotation, independent of
 * the circle's own breathing scale below so the two read as two distinct
 * signs of life rather than one blurred motion. */
function SpinningIcon({ color }: { color: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <LoaderCircle size={16} color={color} />
    </Animated.View>
  );
}

function StepCircle({ state, icon: Icon }: { state: StepState; icon: IconComponent }) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'active') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, breathe]);

  if (state === 'done') {
    return (
      <View style={[styles.circle, styles.circleDone]}>
        <Check size={16} color={swapColors.textOnDark} />
      </View>
    );
  }

  if (state === 'active') {
    const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
    return (
      <Animated.View style={[styles.circle, styles.circleActive, { transform: [{ scale }] }]}>
        <SpinningIcon color={swapColors.pillActive} />
      </Animated.View>
    );
  }

  return (
    <View style={[styles.circle, styles.circleUpcoming]}>
      <Icon size={16} color={swapColors.textMuted} />
    </View>
  );
}

export type TransactionStepperProps = {
  status: TransactionStatus;
  fiatType: string;
};

/**
 * Vertical 3-step pipeline: On-Chain Confirmation -> Converting to
 * {fiatType} -> Mobile Money Settlement. Only meaningful for a status still
 * in that pipeline — a terminal status has no step index (see
 * `pipelineStepIndex`), so this renders nothing for `COMPLETED`/`FAILED`;
 * TransactionProgressSheet shows those in its own "recent" summary instead
 * rather than through this stepper.
 */
export function TransactionStepper({ status, fiatType }: TransactionStepperProps) {
  const currentIndex = pipelineStepIndex(status);
  if (currentIndex < 0) return null;

  return (
    <View testID="transaction-stepper">
      {PIPELINE_STEP_ORDER.map((step, index) => {
        const state: StepState = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'upcoming';
        const isLast = index === PIPELINE_STEP_ORDER.length - 1;
        return (
          <View key={step} style={styles.row} testID={`transaction-step-${step}`}>
            <View style={styles.rail}>
              <StepCircle state={state} icon={STEP_ICONS[step]} />
              {!isLast && <View style={[styles.line, state === 'done' && styles.lineDone]} />}
            </View>
            <View style={[styles.textColumn, !isLast && styles.textColumnSpaced]}>
              <Text style={[styles.stepLabel, state === 'upcoming' && styles.stepLabelUpcoming]}>
                {pipelineStepLabel(step, fiatType)}
              </Text>
              <Text style={styles.stepSublabel}>
                {state === 'done' ? 'Completed' : state === 'active' ? 'In progress…' : 'Up next'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const CIRCLE_SIZE = 32;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rail: {
    alignItems: 'center',
    width: CIRCLE_SIZE,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: {
    backgroundColor: swapColors.successGreen,
  },
  circleActive: {
    backgroundColor: swapColors.card,
    borderWidth: 2,
    borderColor: swapColors.pillActive,
  },
  circleUpcoming: {
    backgroundColor: swapColors.subcard,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: swapColors.divider,
  },
  lineDone: {
    backgroundColor: swapColors.successGreen,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 12,
    paddingTop: 4,
  },
  textColumnSpaced: {
    paddingBottom: 16,
  },
  stepLabel: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 14,
    color: swapColors.textPrimary,
  },
  stepLabelUpcoming: {
    color: swapColors.textMuted,
  },
  stepSublabel: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
    marginTop: 2,
  },
});
