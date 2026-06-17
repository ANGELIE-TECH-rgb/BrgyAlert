import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen({ onFinish }) {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const textFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    textFadeAnim.setValue(0);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeIndex]);

  const slides = [
    {
      key: '1',
      title: 'Instant Panic Dispatch',
      desc: 'Trigger immediate responders and alert the Barangay Command Center in real-time during emergencies.',
      image: require('../../../assets/onboarding_panic.png'),
    },
    {
      key: '2',
      title: 'Interactive Tracking',
      desc: 'Browse local directories, view emergency hotlines, and track report status timelines dynamically.',
      image: require('../../../assets/onboarding_track.png'),
    },
    {
      key: '3',
      title: 'Direct Chat Support',
      desc: 'Exchange real-time text logs, coordinates, and media attachments directly with active emergency responders.',
      image: require('../../../assets/onboarding_chat.png'),
    },
  ];

  // Track page change on scroll
  const handleScroll = (event) => {
    const scrollOffset = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(scrollOffset / width);
    if (pageIndex !== activeIndex) {
      setActiveIndex(pageIndex);
    }
  };

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
      if (onFinish) {
        onFinish();
      }
    } catch (err) {
      console.log('Error saving onboarding preference:', err);
      // Fallback transition
      if (onFinish) onFinish();
    }
  };

  const handleContinue = () => {
    if (activeIndex < slides.length - 1) {
      scrollViewRef.current.scrollTo({
        x: (activeIndex + 1) * width,
        animated: true,
      });
    } else {
      handleComplete();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Skip Button (Top Right) */}
      {activeIndex < slides.length - 1 ? (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleComplete}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.skipPlaceholder} />
      )}

      {/* Horizontal Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
        style={styles.carousel}
      >
        {slides.map((slide, index) => {
          const isActive = index === activeIndex;
          return (
            <View key={slide.key} style={styles.slide}>
              <Animated.View style={[
                styles.imageContainer,
                isActive && {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }]
                }
              ]}>
                <Image
                  source={slide.image}
                  style={styles.image}
                  resizeMode="contain"
                />
              </Animated.View>
              <Animated.View style={[
                styles.textGroup,
                isActive && {
                  opacity: textFadeAnim
                }
              ]}>
                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.desc}>{slide.desc}</Text>
              </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      {/* Footer Area with Indicators and Button */}
      <View style={styles.footer}>
        {/* Pagination Indicator Dots */}
        <View style={styles.indicatorContainer}>
          {slides.map((_, index) => {
            const isActive = index === activeIndex;
            return (
              <View
                key={index}
                style={[
                  styles.indicatorDot,
                  isActive && styles.indicatorDotActive
                ]}
              />
            );
          })}
        </View>

        {/* Continue / Get Started Button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>
            {activeIndex === slides.length - 1 ? 'Get Started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  skipButton: {
    alignSelf: 'flex-end',
    marginRight: 24,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // Soft premium card shadow from citizen dashboard
    shadowColor: '#0f2d5943',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  skipPlaceholder: {
    height: 42,
  },
  carousel: {
    flex: 1,
  },
  slide: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  imageContainer: {
    width: width * 0.85,
    height: height * 0.40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textGroup: {
    alignItems: 'center',
    marginTop: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F2C59',
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  footer: {
    paddingHorizontal: 32,
    marginTop: 20,
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  indicatorDotActive: {
    width: 24,
    backgroundColor: '#0F2C59',
    borderRadius: 4,
  },
  actionButton: {
    backgroundColor: '#0F2C59',
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    // Match the premium card shadow from the citizen dashboard
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
