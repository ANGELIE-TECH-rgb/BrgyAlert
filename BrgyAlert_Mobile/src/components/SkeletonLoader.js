import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated } from 'react-native';

export default function SkeletonLoader({ type = 'card', count = 1, style }) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  const renderSingleSkeleton = (index) => {
    switch (type) {
      case 'card':
        return (
          <View key={index} style={[styles.card, style]}>
            <View style={styles.topRow}>
              <Animated.View style={[styles.skeletonTextShort, { opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonBadge, { opacity: pulseAnim }]} />
            </View>
            <View style={styles.middleRow}>
              <View style={{ flex: 1 }}>
                <Animated.View style={[styles.skeletonTextLarge, { opacity: pulseAnim }]} />
                <Animated.View style={[styles.skeletonTextMedium, { opacity: pulseAnim, marginTop: 8 }]} />
              </View>
              <Animated.View style={[styles.skeletonChevron, { opacity: pulseAnim }]} />
            </View>
            <Animated.View style={[styles.skeletonTextShort, { opacity: pulseAnim, marginTop: 4 }]} />
          </View>
        );
      case 'thread':
      case 'list':
        return (
          <View key={index} style={[styles.threadRow, style]}>
            <Animated.View style={[styles.skeletonAvatar, { opacity: pulseAnim }]} />
            <View style={styles.threadTextColumn}>
              <Animated.View style={[styles.skeletonTextMedium, { opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonTextShort, { opacity: pulseAnim, marginTop: 8 }]} />
            </View>
            <Animated.View style={[styles.skeletonBadgeSmall, { opacity: pulseAnim }]} />
          </View>
        );
      case 'notification':
        return (
          <View key={index} style={[styles.notificationRow, style]}>
            <Animated.View style={[styles.skeletonNotifIcon, { opacity: pulseAnim }]} />
            <View style={styles.notificationTextColumn}>
              <Animated.View style={[styles.skeletonTextMedium, { opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonTextLarge, { opacity: pulseAnim, marginTop: 6 }]} />
            </View>
          </View>
        );
      case 'analytics':
        return (
          <View key={index} style={[styles.analyticsContainer, style]}>
            <View style={styles.analyticsRow}>
              <Animated.View style={[styles.analyticsCard, { opacity: pulseAnim }]} />
              <Animated.View style={[styles.analyticsCard, { opacity: pulseAnim }]} />
            </View>
            <View style={styles.analyticsRow}>
              <Animated.View style={[styles.analyticsCard, { opacity: pulseAnim }]} />
              <Animated.View style={[styles.analyticsCard, { opacity: pulseAnim }]} />
            </View>
            <Animated.View style={[styles.analyticsLargeBox, { opacity: pulseAnim }]} />
          </View>
        );
      case 'detail':
        return (
          <View key={index} style={[styles.detailContainer, style]}>
            <View style={styles.detailHeaderPlaceholder}>
              <Animated.View style={[styles.skeletonTextMedium, { opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonTextShort, { opacity: pulseAnim, marginTop: 8 }]} />
            </View>
            <Animated.View style={[styles.detailMapBox, { opacity: pulseAnim }]} />
            <View style={styles.detailBodyPlaceholder}>
              <Animated.View style={[styles.skeletonTextLarge, { opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonTextLarge, { opacity: pulseAnim, marginTop: 8 }]} />
              <Animated.View style={[styles.skeletonTextMedium, { opacity: pulseAnim, marginTop: 8 }]} />
            </View>
          </View>
        );
      case 'tracker':
        return (
          <View key={index} style={[styles.trackerContainer, style]}>
            {[1, 2, 3, 4].map((step) => (
              <View key={step} style={styles.trackerStepRow}>
                <View style={styles.trackerLeftCol}>
                  <Animated.View style={[styles.trackerCircle, { opacity: pulseAnim }]} />
                  {step < 4 && <View style={styles.trackerLine} />}
                </View>
                <View style={styles.trackerRightCol}>
                  <Animated.View style={[styles.skeletonTextMedium, { opacity: pulseAnim }]} />
                  <Animated.View style={[styles.skeletonTextShort, { opacity: pulseAnim, marginTop: 6 }]} />
                </View>
              </View>
            ))}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={{ width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => renderSingleSkeleton(i))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonTextShort: {
    height: 12,
    width: '35%',
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
  },
  skeletonTextMedium: {
    height: 14,
    width: '60%',
    backgroundColor: '#E5E7EB',
    borderRadius: 7,
  },
  skeletonTextLarge: {
    height: 16,
    width: '85%',
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  skeletonBadge: {
    height: 20,
    width: 80,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  skeletonBadgeSmall: {
    height: 16,
    width: 28,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  skeletonChevron: {
    height: 20,
    width: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
  },
  skeletonAvatar: {
    height: 48,
    width: 48,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
  },
  skeletonNotifIcon: {
    height: 32,
    width: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  middleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  threadTextColumn: {
    flex: 1,
    marginLeft: 12,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notificationTextColumn: {
    flex: 1,
    marginLeft: 12,
  },
  analyticsContainer: {
    width: '100%',
  },
  analyticsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  analyticsCard: {
    width: '48%',
    height: 90,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
  },
  analyticsLargeBox: {
    width: '100%',
    height: 200,
    backgroundColor: '#E5E7EB',
    borderRadius: 20,
    marginTop: 12,
  },
  detailContainer: {
    width: '100%',
    paddingVertical: 16,
  },
  detailHeaderPlaceholder: {
    marginBottom: 20,
  },
  detailMapBox: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    marginBottom: 20,
  },
  detailBodyPlaceholder: {
    marginTop: 10,
  },
  trackerContainer: {
    width: '100%',
    paddingVertical: 16,
  },
  trackerStepRow: {
    flexDirection: 'row',
    height: 70,
  },
  trackerLeftCol: {
    alignItems: 'center',
    width: 30,
    marginRight: 12,
  },
  trackerCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    zIndex: 2,
  },
  trackerLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E7EB',
    position: 'absolute',
    top: 20,
    bottom: 0,
    zIndex: 1,
  },
  trackerRightCol: {
    flex: 1,
    paddingTop: 2,
  },
});
