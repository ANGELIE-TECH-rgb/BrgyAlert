import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  Linking,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import BottomGradient from '../../components/BottomGradient';
import { markAsRead, markAllAsRead, cleanupOrphanedNotifications } from '../../services/notificationService';
import { notifyAllAdmins } from '../../services/adminNotifier';
import { checkPanicStatus, recordPanicTrigger } from '../../services/rateLimiter';
import { getCurrentLocation } from '../../services/locationService';
import IncidentCard from '../../components/IncidentCard';
import BottomTabNav from '../../components/BottomTabNav';
import TutorialOverlay from '../../components/TutorialOverlay';
import SkeletonLoader from '../../components/SkeletonLoader';
import ConnectionBlocker from '../../components/ConnectionBlocker';
import EmptyState from '../../components/EmptyState';
import GestureModal from '../../components/GestureModal';

// Must be declared AFTER all imports — Hermes enforces strict ES module hoisting
const AnimatedCircle = Animated.createAnimatedComponent(Circle);



export default function CitizenDashboard({ navigation }) {
  const { user, userProfile, sendVerificationEmail } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();

  const [isOnline, setIsOnline] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [hiddenNotificationIds, setHiddenNotificationIds] = useState(new Set());
  const verifiedAlertsRef = useRef({});
  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isVerificationBannerDismissed, setIsVerificationBannerDismissed] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  const handleResendVerification = async () => {
    setSendingVerification(true);
    try {
      await sendVerificationEmail();
      Alert.alert('Verification Sent', 'A secure verification link has been resent to your registered email.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not dispatch verification email. Please try again.');
    } finally {
      setSendingVerification(false);
    }
  };

  // Monitor navigation focus to trigger/replay the tour
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const checkTutorial = async () => {
        try {
          const val = await AsyncStorage.getItem('hasSeenDashboardTutorial');
          if (val !== 'true') {
            setTimeout(() => {
              setShowTutorial(true);
            }, 600);
          } else {
            setShowTutorial(false);
          }
        } catch (err) {
          console.log('Error checking dashboard tutorial state:', err);
        }
      };
      checkTutorial();
    });
    return unsubscribe;
  }, [navigation]);

  const handleFinishTutorial = async () => {
    try {
      await AsyncStorage.setItem('hasSeenDashboardTutorial', 'true');
    } catch (err) {
      console.log('Error saving dashboard tutorial state:', err);
    }
    setShowTutorial(false);
  };

  const citizenTourSteps = [
    {
      title: 'Instant Panic Dispatch',
      desc: 'Hold this button for 3 seconds in severe emergencies to notify responders and broadcast your GPS coordinates.',
      top: Math.round(H * 0.38),
      arrow: 'top'
    },
    {
      title: 'File Incident Report',
      desc: 'Tap this button to create a detailed report, select a category, and attach evidence photos.',
      bottom: Math.round(H * 0.22),
      arrow: 'bottom'
    },
    {
      title: 'Track Incident Logs',
      desc: 'Track your reported incidents, verify their statuses, and open real-time chat threads with responders.',
      bottom: Math.round(H * 0.14),
      arrow: 'bottom'
    }
  ];

  // Barangay Configuration States
  const [showHotlinesModal, setShowHotlinesModal] = useState(false);
  const [barangayConfig, setBarangayConfig] = useState({
    barangayName: 'Barangay Lepa',
    hotlinePolice: '',
    hotlineFire: '',
    hotlineAmbulance: ''
  });

  // Panic Button hold-to-press states
  const [holdTimer, setHoldTimer] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(3);
  const [isHolding, setIsHolding] = useState(false);
  const secondsRef = useRef(3);

  // ─── Animations ────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;  // idle breathing ring
  const scaleAnim = useRef(new Animated.Value(0.3)).current;  // button press & entrance scale
  const arcProgress = useRef(new Animated.Value(0)).current;  // 0→1 countdown sweep
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef(null);

  const tooltipY = useRef(new Animated.Value(0)).current;  // FAB Tooltip vertical float
  const servicesEntryAnim = useRef(new Animated.Value(0)).current; // Services slide-in
  const logsEntryAnim = useRef(new Animated.Value(0)).current; // Logs slide-in

  // Entrance and loop animations on mount
  useEffect(() => {
    // 1. Spring scale-in for Panic button
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 45,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // 2. Continuous loop for FAB Tooltip floating
    Animated.loop(
      Animated.sequence([
        Animated.timing(tooltipY, {
          toValue: -6,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(tooltipY, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 3. Staggered slide up & fade in of service and log containers
    Animated.stagger(150, [
      Animated.timing(servicesEntryAnim, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logsEntryAnim, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  // Idle pulse loop (starts on mount, stops while holding)
  useEffect(() => {
    const startPulse = () => {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.35,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current.start();
    };
    // Wait for the entrance animation to finish before starting idle pulse
    const timer = setTimeout(() => {
      startPulse();
    }, 600);
    return () => {
      clearTimeout(timer);
      if (pulseLoopRef.current) pulseLoopRef.current.stop();
    };
  }, []);


  // Monitor Network Connectivity State
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsubscribeNet();
  }, []);

  // Fetch Barangay Hotlines Configuration in Real-Time
  useEffect(() => {
    const docRef = doc(db, 'config', 'barangay');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setBarangayConfig(docSnap.data());
      }
    }, (error) => {
      console.log('Error listening to barangay config snapshot:', error);
    });
    return () => unsubscribe();
  }, []);

  // Monitor notifications in real-time
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({ id: doc.id, ...data });
      });
      setNotifications(list);
      cleanupOrphanedNotifications(user.uid, list, verifiedAlertsRef.current, (orphanId) => {
        setHiddenNotificationIds(prev => {
          const newSet = new Set(prev);
          newSet.add(orphanId);
          return newSet;
        });
      });
    }, (error) => {
      console.log('[CitizenDashboard] Notification query error:', error.code, error.message);
      // Fallback: unordered query with client-side sort
      const fallbackQ = query(collection(db, 'users', user.uid, 'notifications'));
      onSnapshot(fallbackQ, (snap) => {
        const list = [];
        snap.forEach((doc) => {
          const data = doc.data();
          list.push({ id: doc.id, ...data });
        });
        list.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
          const bTime = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
          return bTime - aTime;
        });
        setNotifications(list);
        cleanupOrphanedNotifications(user.uid, list, verifiedAlertsRef.current, (orphanId) => {
          setHiddenNotificationIds(prev => {
            const newSet = new Set(prev);
            newSet.add(orphanId);
            return newSet;
          });
        });
      }, (fallbackErr) => {
        console.log('[CitizenDashboard] Fallback notification query error:', fallbackErr.code);
      });
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Citizen's Incident Reports in Real-Time
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'alerts'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeLogs = onSnapshot(q, (snapshot) => {
      const logs = [];
      snapshot.forEach((doc) => {
        logs.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setRecentLogs(logs);
      setLoadingLogs(false);
    }, (error) => {
      console.log('Error fetching alerts snapshot:', error);
      setLoadingLogs(false);
    });

    return () => unsubscribeLogs();
  }, [user]);

  // Handle Dynamic Greeting based on current time
  const getGreeting = () => {
    const hours = new Date().getHours();
    const displayName = userProfile?.fullName ? userProfile.fullName.split(' ')[0] : 'Citizen';

    if (hours < 12) return `Good morning, ${displayName}`;
    if (hours < 18) return `Good afternoon, ${displayName}`;
    return `Good evening, ${displayName}`;
  };

  // Get Formatted Current Date
  const getFormattedDate = () => {
    return new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  // Trigger dialing client on device
  const handleDial = (number) => {
    if (!number) {
      Alert.alert('Unavailable', 'This hotline number is not set.');
      return;
    }
    Linking.openURL(`tel:${number}`).catch((err) => {
      console.warn('Error dialing number:', err);
      Alert.alert('Error', 'Could not open phone dialer.');
    });
  };

  // Start Panic Button Hold
  const handlePanicPressIn = () => {
    // Stop idle pulse, scale button up, start arc sweep
    if (pulseLoopRef.current) pulseLoopRef.current.stop();
    Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();

    Animated.spring(scaleAnim, {
      toValue: 1.08,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();

    // Subtitle fade
    Animated.timing(subtitleOpacity, { toValue: 0.4, duration: 200, useNativeDriver: true }).start();

    // Arc sweep over 3 seconds
    arcProgress.setValue(0);
    Animated.timing(arcProgress, {
      toValue: 1,
      duration: 3000,
      easing: Easing.linear,
      useNativeDriver: false, // needs JS driver for SVG path interpolation
    }).start();

    setIsHolding(true);
    setSecondsRemaining(3);
    secondsRef.current = 3;

    const intervalId = setInterval(() => {
      secondsRef.current -= 1;
      if (secondsRef.current <= 0) {
        clearInterval(intervalId);
        triggerPanicAlert();
      } else {
        setSecondsRemaining(secondsRef.current);
      }
    }, 1000);

    setHoldTimer(intervalId);
  };

  // Release Panic Button Hold
  const handlePanicPressOut = () => {
    if (holdTimer) {
      clearInterval(holdTimer);
      setHoldTimer(null);
    }

    // Reset arc and scale
    arcProgress.stopAnimation();
    arcProgress.setValue(0);
    Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    Animated.timing(subtitleOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    // Restart idle pulse
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();

    setIsHolding(false);
    setSecondsRemaining(3);
    secondsRef.current = 3;
  };

  // Trigger Panic Alert to Firestore
  const triggerPanicAlert = async () => {
    handlePanicPressOut(); // Reset button UI state

    if (!isOnline) {
      Alert.alert(
        'Offline Mode',
        'You are offline. To trigger an emergency panic dispatch, please proceed to the Report Wizard and use the SMS fallback link.'
      );
      return;
    }

    // Check panic rate limit
    const rateStatus = await checkPanicStatus();
    if (rateStatus.locked) {
      Alert.alert(
        'Emergency Cooldown',
        `An emergency alert was recently sent. Please wait ${rateStatus.secondsRemaining} seconds before triggering another panic alert.`
      );
      return;
    }

    try {
      Alert.alert('Panic Triggered', 'Sending emergency location alert to Barangay Command Center...');
      const location = await getCurrentLocation();

      const panicPayload = {
        userId: user.uid,
        reporterName: userProfile?.fullName || 'Anonymous Citizen',
        phoneNumber: userProfile?.phoneNumber || '',
        category: 'General',
        details: 'CRITICAL PANIC BUTTON TRIGGERED BY CITIZEN - IMMEDIATE THREAT REPORTED',
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          addressText: location.addressText
        },
        source: 'online_app',
        status: 'submitted',
        urgency: 'critical',
        mediaUrls: [],
        assignedResponders: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'alerts'), panicPayload);
      await recordPanicTrigger();

      // Notify all admins/responders directly — critical panic needs immediate attention
      const locationText = panicPayload.location?.addressText || 'Unknown Location';
      notifyAllAdmins(user.uid, {
        title: `🚨 CRITICAL PANIC ALERT!`,
        body: `Panic button triggered by ${panicPayload.reporterName} at ${locationText}. IMMEDIATE RESPONSE REQUIRED.`,
        type: 'emergency',
        relatedId: docRef.id,
      }).catch((e) => console.log('[CitizenDashboard] Could not notify admins of panic:', e));

      navigation.navigate('ReportSuccess', {
        reportId: docRef.id,
        estimatedTime: '5 - 10 Minutes (Panic Priority)'
      });
    } catch (err) {
      console.log('Panic trigger failed:', err);
      Alert.alert('Low Internet / Trigger Failed', 'Could not establish a connection to trigger panic alert. Please try again or dial local emergency hotlines directly.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Background Gradient Backdrop */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
          <Defs>
            <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#EEF2F6" stopOpacity={0.85} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#bgGrad)" />
        </Svg>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Email Verification Banner */}
        {user && !user.emailVerified && !isVerificationBannerDismissed && (
          <View style={styles.verificationWarningBanner}>
            <View style={styles.verificationBannerMain}>
              <Feather name="alert-triangle" size={20} color="#856404" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.verificationBannerTitle}>Verify Your Email Address</Text>
                <Text style={styles.verificationBannerDesc}>
                  Please check your inbox. Verification is required to unlock coordinates / dispatch messaging.
                </Text>
                <TouchableOpacity
                  style={styles.resendVerifyLink}
                  onPress={handleResendVerification}
                  disabled={sendingVerification}
                >
                  <Text style={styles.resendVerifyLinkText}>
                    {sendingVerification ? 'Sending link...' : 'Resend verification link'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setIsVerificationBannerDismissed(true)}>
                <Feather name="x" size={18} color="#856404" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Header Block */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>{getGreeting()}</Text>
            <Text style={styles.dateText}>{getFormattedDate()}</Text>

            {/* Online/Offline Status */}
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22C55E' : '#9CA3AF' }]} />
              <Text style={styles.statusLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>

            <TouchableOpacity
              style={styles.bellButton}
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.7}
            >
              <Feather name="bell" size={22} color="#1F2937" />
              {(() => {
                const visibleUnreadCount = notifications.filter(n => !n.read && !hiddenNotificationIds.has(n.id)).length;
                return visibleUnreadCount > 0 ? (
                  <View style={styles.badgeDot}>
                    <Text style={styles.badgeDotText}>{visibleUnreadCount > 9 ? '9+' : visibleUnreadCount}</Text>
                  </View>
                ) : null;
              })()}
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Emergency Button ─────────────────────────────────────── */}
        <View style={styles.panicContainer}>

          {/* Animated wrapper: breathing pulse ring + scale press */}
          <Animated.View style={[
            styles.panicButtonWrapper,
            { transform: [{ scale: scaleAnim }] }
          ]}>

            {/* Breathing pulse ring (behind button) */}
            <Animated.View style={[
              styles.pulseRing,
              {
                opacity: pulseAnim.interpolate({ inputRange: [1, 1.35], outputRange: [0.35, 0] }),
                transform: [{ scale: pulseAnim }],
              }
            ]} />

            {/* Second, slower pulse ring */}
            <Animated.View style={[
              styles.pulseRing,
              styles.pulseRingOuter,
              {
                opacity: pulseAnim.interpolate({ inputRange: [1, 1.35], outputRange: [0.15, 0] }),
                transform: [{ scale: pulseAnim.interpolate({ inputRange: [1, 1.35], outputRange: [1.1, 1.55] }) }],
              }
            ]} />

            {/* SVG countdown arc (shown during hold) */}
            {isHolding && (
              <View style={styles.arcOverlay} pointerEvents="none">
                <Svg width={140} height={140} viewBox="0 0 140 140">
                  {/* Background circle track */}
                  <Circle cx="70" cy="70" r="62" stroke="rgba(255,255,255,0.2)" strokeWidth="4" fill="none" />
                  {/* Sweeping progress arc */}
                  <AnimatedCircle
                    cx="70"
                    cy="70"
                    r="62"
                    stroke="#FFFFFF"
                    strokeWidth="4"
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={389.56}
                    strokeDashoffset={arcProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [389.56, 0]
                    })}
                    transform="rotate(-90 70 70)"
                  />
                </Svg>
              </View>
            )}

            {/* The actual button */}
            <TouchableOpacity
              style={[styles.panicButton, isHolding && styles.panicButtonHolding]}
              onPressIn={handlePanicPressIn}
              onPressOut={handlePanicPressOut}
              activeOpacity={1}
            >
              {isHolding ? (
                <Text style={styles.holdTimerText}>{secondsRemaining}s</Text>
              ) : (
                <Svg width={64} height={64} viewBox="0 0 64 64">
                  {/* Warning Triangle Outline */}
                  <Path
                    d="M 28 8 L 8 44 C 6.5 47 8.5 49 11 49 L 43 49 C 45.5 49 47.5 47 46 44 L 28 8 Z"
                    stroke="#FFFFFF"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  {/* Exclamation point inside warning triangle */}
                  <Path
                    d="M 28 20 L 28 33"
                    stroke="#FFFFFF"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <Circle cx="28" cy="40" r="2" fill="#FFFFFF" />
                  {/* Siren light dome and base */}
                  <Path d="M 36 44 L 56 44" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
                  <Path d="M 38 44 C 38 34 54 34 54 44 Z" fill="#FFFFFF" />
                  <Path d="M 52 32 L 57 27 M 55 40 L 61 39 M 46 28 L 48 21" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
                </Svg>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Subtitle fades slightly on hold */}
          <Animated.Text style={[styles.panicSubtitle, { opacity: subtitleOpacity }]}>
            {isHolding ? 'RELEASE TO CANCEL' : 'Press and hold in an immediate threatening emergency.'}
          </Animated.Text>
        </View>

        {/* Quick Services section */}
        <Animated.View style={[
          styles.sectionContainer,
          {
            opacity: servicesEntryAnim,
            transform: [{
              translateY: servicesEntryAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [25, 0]
              })
            }]
          }
        ]}>
          <Text style={styles.sectionTitle}>Quick Services</Text>
          <View style={styles.servicesGrid}>

            {/* Hotlines Card */}
            <TouchableOpacity
              style={styles.serviceCard}
              onPress={() => setShowHotlinesModal(true)}
            >
              <View style={styles.serviceIconWrapper}>
                <Feather name="phone-call" size={20} color="#2563EB" />
              </View>
              <Text style={styles.serviceText}>Emergency Hotlines</Text>
            </TouchableOpacity>

            {/* My Reports Card */}
            <TouchableOpacity
              style={styles.serviceCard}
              onPress={() => navigation.navigate('CitizenReports')}
            >
              <View style={styles.serviceIconWrapper}>
                <Feather name="file-text" size={20} color="#2563EB" />
              </View>
              <Text style={styles.serviceText}>My Reports</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Recent Logs Section */}
        <Animated.View style={[
          styles.sectionContainer,
          styles.logsSection,
          {
            opacity: logsEntryAnim,
            transform: [{
              translateY: logsEntryAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [25, 0]
              })
            }]
          }
        ]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent logs</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CitizenReports')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {loadingLogs ? (
            <SkeletonLoader type="card" count={2} />
          ) : recentLogs.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title="No Reports Yet"
              subtitle="Stay safe — use the '+' button below to report any incident."
              actionLabel="File a Report"
              onActionPress={() => navigation.navigate('ReportWizard')}
              accentColor="#0F2C59"
            />
          ) : (
            recentLogs.slice(0, 3).map((log) => (
              <IncidentCard
                key={log.id}
                incident={log}
                onPress={() => navigation.navigate('StatusTracker', { alertId: log.id })}
              />
            ))
          )}
        </Animated.View>

      </ScrollView>

      {/* Floating Action Button with pointer label tooltip on the left (Image 3) */}
      <View style={styles.fabContainer}>
        <Animated.View style={[
          styles.fabTooltip,
          { transform: [{ translateX: tooltipY }] }
        ]}>
          <Text style={styles.fabTooltipText}>Add a new report</Text>
          <View style={styles.fabTooltipPointer} />
        </Animated.View>
        <TouchableOpacity
          style={styles.fabCircleButton}
          onPress={() => navigation.navigate('ReportWizard')}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Bottom Smooth Gradient Background Fade (Image 4 & 5) */}
      <BottomGradient />

      {/* Emergency Hotlines Bottom Sheet Modal */}
      <GestureModal
        visible={showHotlinesModal}
        onClose={() => setShowHotlinesModal(false)}
        title={`${barangayConfig.barangayName || 'Barangay'} Hotlines`}
      >
        <View style={styles.hotlinesModalContent}>
          <Text style={styles.hotlinesSubtitle}>
            Tapping an emergency hotline will immediately launch your phone dialer app.
          </Text>

          {/* List of Hotlines */}
          <View style={styles.hotlinesList}>

            {/* Police */}
            <TouchableOpacity
              style={styles.hotlineItem}
              onPress={() => handleDial(barangayConfig.hotlinePolice)}
              activeOpacity={0.7}
            >
              <View style={styles.hotlineLeft}>
                <View style={[styles.hotlineIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                  <Feather name="shield" size={20} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.hotlineName}>Police Station</Text>
                  <Text style={styles.hotlineNum}>{barangayConfig.hotlinePolice || 'Not Configured'}</Text>
                </View>
              </View>
              <Feather name="phone" size={18} color="#2563EB" />
            </TouchableOpacity>

            {/* Fire */}
            <TouchableOpacity
              style={styles.hotlineItem}
              onPress={() => handleDial(barangayConfig.hotlineFire)}
              activeOpacity={0.7}
            >
              <View style={styles.hotlineLeft}>
                <View style={[styles.hotlineIconWrapper, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="flame" size={20} color="#EF4444" />
                </View>
                <View>
                  <Text style={styles.hotlineName}>Fire Station</Text>
                  <Text style={styles.hotlineNum}>{barangayConfig.hotlineFire || 'Not Configured'}</Text>
                </View>
              </View>
              <Feather name="phone" size={18} color="#EF4444" />
            </TouchableOpacity>

            {/* Ambulance */}
            <TouchableOpacity
              style={styles.hotlineItem}
              onPress={() => handleDial(barangayConfig.hotlineAmbulance)}
              activeOpacity={0.7}
            >
              <View style={styles.hotlineLeft}>
                <View style={[styles.hotlineIconWrapper, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="ambulance" size={20} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.hotlineName}>Ambulance & Medical</Text>
                  <Text style={styles.hotlineNum}>{barangayConfig.hotlineAmbulance || 'Not Configured'}</Text>
                </View>
              </View>
              <Feather name="phone" size={18} color="#10B981" />
            </TouchableOpacity>

          </View>

          {/* Dismiss button */}
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={() => setShowHotlinesModal(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </GestureModal>

      {/* Connection Loss Blocker for Citizens */}
      {!isOnline && <ConnectionBlocker navigation={navigation} />}

      {/* Custom Bottom Tab Pill */}
      <BottomTabNav />


      {/* Tutorial App Tour Overlay */}
      {showTutorial && (
        <TutorialOverlay
          steps={citizenTourSteps}
          onFinish={handleFinishTutorial}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 150, // Pad for floating bottom tab bar
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  headerLeft: {
    flex: 1,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '700', // Standard brand weight
    color: '#111827',
  },
  dateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  bellButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth, very faint soft shadow
    shadowColor: '#00000044',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  panicContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginBottom: 36,
  },
  panicButtonWrapper: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FF3B3F',
  },
  pulseRingOuter: {
    backgroundColor: '#FF3B3F',
  },
  arcOverlay: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
  },
  panicButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FF3B3F',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#FF3B3F',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
  panicButtonHolding: {
    backgroundColor: '#DC2626',
    borderColor: '#FECACA',
  },
  holdTimerText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  panicSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 18,
    lineHeight: 18,
    width: '75%',
    fontWeight: '500',
  },
  sectionContainer: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  serviceCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // Premium soft card shadow
    shadowColor: '#0f2d5939',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.015,
    shadowRadius: 16,
    elevation: 1,
  },
  serviceIconWrapper: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  serviceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    flex: 1,
    lineHeight: 16,
  },
  logsSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  logsLoader: {
    marginVertical: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: 20,
    backgroundColor: '#FAFAFA',
  },
  emptyIcon: {
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 124, // Clear bottom tab bar height to prevent overflow
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  fabTooltip: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginRight: 10,
    position: 'relative',
    // Smooth soft shadow for label bubble
    shadowColor: '#0000005e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04, // Faint low opacity shadow
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fabTooltipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F2C59',
  },
  fabTooltipPointer: {
    position: 'absolute',
    right: -4,
    top: 12,
    width: 8,
    height: 8,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
  },
  fabCircleButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0F2C59',
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth soft shadow for FAB button
    shadowColor: '#0f2d5965',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1, // Low opacity smooth blue shadow
    shadowRadius: 20,
    elevation: 5,
  },

  badgeDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeDotText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  dropdownContainer: {
    position: 'absolute',
    right: 24,
    width: 300,
    maxHeight: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
    zIndex: 9999,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  dropdownMarkRead: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  dropdownScroll: {
    maxHeight: 280,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemUnread: {
    backgroundColor: '#F9FCFF',
  },
  itemIconWrapper: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemTextWrapper: {
    flex: 1,
    paddingRight: 6,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  itemTitleUnread: {
    fontWeight: '700',
    color: '#111827',
  },
  itemBody: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  itemUnreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
  },
  dropdownEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  dropdownEmptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  seeAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  hotlinesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalOverlayDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  hotlinesModalContent: {
    width: '100%',
    paddingBottom: 8,
  },
  hotlinesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  hotlinesHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hotlinesModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2C59',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hotlinesSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 19,
  },
  hotlinesList: {
    marginBottom: 20,
  },
  hotlineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    // Soft card shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  hotlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hotlineIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hotlineName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  hotlineNum: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 2,
    fontWeight: '500',
  },
  dismissButton: {
    backgroundColor: '#0F2C59',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  verificationWarningBanner: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEEBA',
    borderWidth: 1,
    borderRadius: 16,
    marginHorizontal: 24,
    marginTop: 16,
    padding: 16,
    // Soft warning shadow
    shadowColor: '#856404',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  verificationBannerMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  verificationBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 4,
  },
  verificationBannerDesc: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 17,
  },
  resendVerifyLink: {
    marginTop: 8,
  },
  resendVerifyLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F2C59',
    textDecorationLine: 'underline',
  },
});
