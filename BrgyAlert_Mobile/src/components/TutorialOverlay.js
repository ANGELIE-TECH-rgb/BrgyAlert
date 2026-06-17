import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * TutorialOverlay — Responsive app-tour tooltip component.
 *
 * Each step object in `steps[]` accepts:
 *   title    {string}  — Tooltip headline
 *   desc     {string}  — Body explanation text
 *   arrow    {string}  — Direction the arrow points OUT of the card toward the target:
 *                         'top'    → arrow on top edge of card   (card is BELOW the target)
 *                         'bottom' → arrow on bottom edge of card (card is ABOVE the target)
 *                         'left'   → arrow on left edge           (card is to the RIGHT)
 *                         'right'  → arrow on right edge          (card is to the LEFT)
 *                         'none'   → no arrow (centred card)
 *   targetY  {number}  — Optional. Absolute Y pixel of the UI element being highlighted.
 *                        When provided the card auto-positions itself above/below the target.
 *   top      {number}  — Explicit card top position (overrides targetY logic)
 *   bottom   {number}  — Explicit card bottom position (overrides targetY logic)
 */
export default function TutorialOverlay({ steps = [], onFinish }) {
  const { width: W, height: H } = useWindowDimensions();

  const CARD_H_ESTIMATE = 180;   // rough card height used for clamping
  const SIDE_PAD        = 24;    // horizontal padding each side
  const CARD_W          = W - SIDE_PAD * 2;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible]           = useState(true);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim   = useRef(new Animated.Value(0.88)).current;
  const floatAnim   = useRef(new Animated.Value(0)).current;

  const activeStep = steps[currentIndex] || {};

  /* ── animate card in on step change ───────────────────────────────── */
  useEffect(() => {
    opacityAnim.setValue(0);
    scaleAnim.setValue(0.88);
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(scaleAnim,   { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [currentIndex]);

  /* ── bouncing arrow ────────────────────────────────────────────────── */
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -7, duration: 650, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue:  0, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  /* ── navigation helpers ────────────────────────────────────────────── */
  const animateOut = (cb) => {
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(scaleAnim,   { toValue: 0.9, duration: 140, useNativeDriver: true }),
    ]).start(cb);
  };

  const handleNext = () => {
    if (currentIndex < steps.length - 1) {
      animateOut(() => setCurrentIndex(i => i + 1));
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      animateOut(() => setCurrentIndex(i => i - 1));
    }
  };

  const handleClose = () => {
    animateOut(() => {
      setVisible(false);
      if (onFinish) onFinish();
    });
  };

  if (!visible || steps.length === 0) return null;

  /* ─────────────────────────────────────────────────────────────────────
   *  RESPONSIVE POSITION CALCULATION
   *
   *  Priority:
   *    1. Explicit `top` / `bottom` on the step object  → use as-is but clamp
   *    2. `targetY` → compute card position relative to the highlighted element
   *    3. Fallback → centre the card vertically
   * ─────────────────────────────────────────────────────────────────────
   */
  const computeCardStyle = () => {
    const step    = activeStep;
    const arrow   = step.arrow || 'none';

    // ── explicit positioning ──────────────────────────────────────────
    if (step.top !== undefined) {
      const clampedTop = Math.min(step.top, H - CARD_H_ESTIMATE - 16);
      return { top: Math.max(clampedTop, 8), left: SIDE_PAD, right: SIDE_PAD };
    }
    if (step.bottom !== undefined) {
      const clampedBottom = Math.min(step.bottom, H - CARD_H_ESTIMATE - 8);
      return { bottom: Math.max(clampedBottom, 8), left: SIDE_PAD, right: SIDE_PAD };
    }

    // ── targetY-based auto positioning ───────────────────────────────
    if (step.targetY !== undefined) {
      const GAP = 16;
      if (arrow === 'top') {
        // card is BELOW the element → top edge of card = targetY + GAP
        const top = Math.min(step.targetY + GAP, H - CARD_H_ESTIMATE - 8);
        return { top: Math.max(top, 8), left: SIDE_PAD, right: SIDE_PAD };
      }
      if (arrow === 'bottom') {
        // card is ABOVE the element → bottom of card = targetY - GAP
        const bottom = Math.max(H - step.targetY + GAP, 8);
        return { bottom: Math.min(bottom, H - CARD_H_ESTIMATE - 8), left: SIDE_PAD, right: SIDE_PAD };
      }
    }

    // ── fallback: centre vertically ───────────────────────────────────
    return {
      top: Math.round(H / 2 - CARD_H_ESTIMATE / 2),
      left: SIDE_PAD,
      right: SIDE_PAD,
    };
  };

  /* ─────────────────────────────────────────────────────────────────────
   *  ARROW STYLE
   *  The arrow sits on the edge of the card that faces the highlighted UI.
   *  'top'    arrow → top edge, centred horizontally
   *  'bottom' arrow → bottom edge, centred horizontally
   *  'left'   arrow → left edge, centred vertically
   *  'right'  arrow → right edge, centred vertically
   * ─────────────────────────────────────────────────────────────────────
   */
  const getArrowStyle = () => {
    const arrow = activeStep.arrow || 'none';
    const ARROW_SIZE = 11;
    const base = { position: 'absolute', width: 0, height: 0 };

    switch (arrow) {
      case 'top':
        return {
          ...base,
          top: -ARROW_SIZE,
          alignSelf: 'center',
          borderLeftWidth: ARROW_SIZE,
          borderRightWidth: ARROW_SIZE,
          borderBottomWidth: ARROW_SIZE,
          borderLeftColor:   'transparent',
          borderRightColor:  'transparent',
          borderBottomColor: '#FFFFFF',
          transform: [{ translateY: floatAnim }],
        };
      case 'bottom':
        return {
          ...base,
          bottom: -ARROW_SIZE,
          alignSelf: 'center',
          borderLeftWidth:  ARROW_SIZE,
          borderRightWidth: ARROW_SIZE,
          borderTopWidth:   ARROW_SIZE,
          borderLeftColor:  'transparent',
          borderRightColor: 'transparent',
          borderTopColor:   '#FFFFFF',
          transform: [{ translateY: floatAnim }],
        };
      case 'left':
        return {
          ...base,
          left: -ARROW_SIZE,
          top: '40%',
          borderTopWidth:    ARROW_SIZE,
          borderBottomWidth: ARROW_SIZE,
          borderRightWidth:  ARROW_SIZE,
          borderTopColor:    'transparent',
          borderBottomColor: 'transparent',
          borderRightColor:  '#FFFFFF',
          transform: [{ translateX: floatAnim }],
        };
      case 'right':
        return {
          ...base,
          right: -ARROW_SIZE,
          top: '40%',
          borderTopWidth:    ARROW_SIZE,
          borderBottomWidth: ARROW_SIZE,
          borderLeftWidth:   ARROW_SIZE,
          borderTopColor:    'transparent',
          borderBottomColor: 'transparent',
          borderLeftColor:   '#FFFFFF',
          transform: [{ translateX: floatAnim }],
        };
      default:
        return { display: 'none' };
    }
  };

  const cardPositionStyle = computeCardStyle();

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      {/* Dark backdrop */}
      <View style={styles.backdrop} pointerEvents="auto" />

      {/* Animated Tooltip Card */}
      <Animated.View
        style={[
          styles.tooltipCard,
          { width: W - SIDE_PAD * 2 },
          cardPositionStyle,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Bouncing Arrow pointer */}
        <Animated.View style={getArrowStyle()} />

        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              Step {currentIndex + 1} of {steps.length}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Card Body */}
        <View style={styles.cardBody}>
          <Text style={styles.stepTitle}>{activeStep.title}</Text>
          <Text style={styles.stepDesc}>{activeStep.desc}</Text>
        </View>

        {/* Card Footer */}
        <View style={styles.cardFooter}>
          <TouchableOpacity onPress={handleClose} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip Tour</Text>
          </TouchableOpacity>

          <View style={styles.navButtons}>
            {currentIndex > 0 && (
              <TouchableOpacity onPress={handlePrev} style={styles.prevBtn}>
                <Feather name="chevron-left" size={16} color="#4B5563" />
                <Text style={styles.prevBtnText}>Back</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={handleNext} style={styles.nextBtn} activeOpacity={0.8}>
              <Text style={styles.nextBtnText}>
                {currentIndex === steps.length - 1 ? 'Finish' : 'Next'}
              </Text>
              {currentIndex < steps.length - 1 && (
                <Feather name="chevron-right" size={16} color="#FFFFFF" style={{ marginLeft: 2 }} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99999,
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',   // Deep black overlay (matches notification style)
  },
  tooltipCard: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
    zIndex: 100000,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  badgeText: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 2,
  },
  cardBody: {
    marginBottom: 18,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 13.5,
    color: '#4B5563',
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: {
    paddingVertical: 6,
  },
  skipBtnText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  navButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
  },
  prevBtnText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 2,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',   // Dark black button matching notification palette
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
