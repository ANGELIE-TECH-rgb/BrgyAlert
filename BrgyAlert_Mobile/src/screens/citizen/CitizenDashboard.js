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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import NetInfo from '@react-native-community/netinfo';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import { markAsRead, markAllAsRead } from '../../services/notificationService';
import { getCurrentLocation } from '../../services/locationService';
import IncidentCard from '../../components/IncidentCard';
import BottomTabNav from '../../components/BottomTabNav';

export default function CitizenDashboard({ navigation }) {
  const { user, userProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [isOnline, setIsOnline] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownNotifications, setDropdownNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Barangay Configuration States
  const [showHotlinesModal, setShowHotlinesModal] = useState(false);
  const [barangayConfig, setBarangayConfig] = useState({
    barangayName: 'Barangay Lepa',
    hotlinePolice: '',
    hotlineFire: '',
    hotlineAmbulance: ''
  });

  // Panic Button hold-to-press states
  const [holdTimer, setHoldTimer]         = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(3);
  const [isHolding, setIsHolding]         = useState(false);
  const secondsRef = useRef(3);

  // ─── Panic button animations ────────────────────────────────────────────
  const pulseAnim   = useRef(new Animated.Value(1)).current;  // idle breathing ring
  const scaleAnim   = useRef(new Animated.Value(1)).current;  // button press scale
  const arcProgress = useRef(new Animated.Value(0)).current;  // 0→1 countdown sweep
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef(null);

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
    startPulse();
    return () => { if (pulseLoopRef.current) pulseLoopRef.current.stop(); };
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
      console.error('Error listening to barangay config snapshot:', error);
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
      let unread = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.read) unread++;
        list.push({ id: doc.id, ...data });
      });
      setDropdownNotifications(list.slice(0, 5));
      setUnreadCount(unread);
    }, (error) => {
      console.error('Error fetching dashboard notifications:', error);
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
      console.error('Error fetching alerts snapshot:', error);
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

      navigation.navigate('ReportSuccess', {
        reportId: docRef.id,
        estimatedTime: '5 - 10 Minutes (Panic Priority)'
      });
    } catch (err) {
      console.error('Panic trigger failed:', err);
      Alert.alert('Trigger Failed', 'Could not establish connection to send panic alert. Please call hotlines directly.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

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

          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => setShowDropdown(true)}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={22} color="#1F2937" />
            {unreadCount > 0 && (
              <View style={styles.badgeDot}>
                <Text style={styles.badgeDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
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
        <View style={styles.sectionContainer}>
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
        </View>

        {/* Recent Logs Section */}
        <View style={[styles.sectionContainer, styles.logsSection]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent logs</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CitizenReports')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {loadingLogs ? (
            <ActivityIndicator style={styles.logsLoader} color="#0F2C59" />
          ) : recentLogs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="folder-minus" size={36} color="#9CA3AF" style={styles.emptyIcon} />
              <Text style={styles.emptyText}>No reports filed yet. Keep our community safe by reporting incidents.</Text>
            </View>
          ) : (
            recentLogs.slice(0, 3).map((log) => (
              <IncidentCard
                key={log.id}
                incident={log}
                onPress={() => navigation.navigate('StatusTracker', { alertId: log.id })}
              />
            ))
          )}
        </View>

      </ScrollView>

      {/* Floating Action Button with pointer label tooltip on the left (Image 3) */}
      <View style={styles.fabContainer}>
        <View style={styles.fabTooltip}>
          <Text style={styles.fabTooltipText}>Add a new report</Text>
          <View style={styles.fabTooltipPointer} />
        </View>
        <TouchableOpacity
          style={styles.fabCircleButton}
          onPress={() => navigation.navigate('ReportWizard')}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Bottom Smooth Gradient Background Fade (Image 4 & 5) */}
      <View style={styles.bottomGradient} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="fadeGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.85" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#fadeGrad)" />
        </Svg>
      </View>

      {/* Notifications Dropdown Modal */}
      <Modal
        visible={showDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDropdown(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDropdown(false)}
        >
          <View style={[styles.dropdownContainer, { top: insets.top + 72 }]}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Recent Notifications</Text>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={() => markAllAsRead(user.uid)}>
                  <Text style={styles.dropdownMarkRead}>Mark all read</Text>
                </TouchableOpacity>
              )}
            </View>

            {dropdownNotifications.length === 0 ? (
              <View style={styles.dropdownEmpty}>
                <Feather name="bell" size={24} color="#9CA3AF" />
                <Text style={styles.dropdownEmptyText}>No notifications yet</Text>
              </View>
            ) : (
              <ScrollView style={styles.dropdownScroll} bounces={false} showsVerticalScrollIndicator={false}>
                {dropdownNotifications.map((item) => {
                  const isMsg = item.type === 'message';
                  const isInc = item.type === 'incident';
                  const isStatus = item.type === 'status';
                  const iconName = isInc ? 'alert-triangle' : isMsg ? 'message-square' : isStatus ? 'activity' : 'bell';
                  const iconColor = isInc ? '#EF4444' : isMsg ? '#2563EB' : isStatus ? '#D97706' : '#6B7280';
                  const iconBg = isInc ? '#FEF2F2' : isMsg ? '#EFF6FF' : isStatus ? '#FFF9E6' : '#F3F4F6';

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.dropdownItem, !item.read && styles.dropdownItemUnread]}
                      onPress={async () => {
                        setShowDropdown(false);
                        if (!item.read) {
                          await markAsRead(user.uid, item.id);
                        }
                        if (item.relatedId) {
                          if (item.type === 'message') {
                            navigation.navigate('ChatScreen', { alertId: item.relatedId });
                          } else {
                            navigation.navigate('StatusTracker', { alertId: item.relatedId });
                          }
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.itemIconWrapper, { backgroundColor: iconBg }]}>
                        <Feather name={iconName} size={14} color={iconColor} />
                      </View>
                      <View style={styles.itemTextWrapper}>
                        <Text style={[styles.itemTitle, !item.read && styles.itemTitleUnread]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.itemBody} numberOfLines={1}>
                          {item.body}
                        </Text>
                      </View>
                      {!item.read && <View style={styles.itemUnreadDot} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => {
                setShowDropdown(false);
                navigation.navigate('Notifications');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.seeAllButtonText}>See All Notifications</Text>
              <Feather name="chevron-right" size={14} color="#2563EB" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Emergency Hotlines Modal */}
      <Modal
        visible={showHotlinesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHotlinesModal(false)}
      >
        <View style={styles.hotlinesModalOverlay}>
          <TouchableOpacity
            style={styles.modalOverlayDismiss}
            activeOpacity={1}
            onPress={() => setShowHotlinesModal(false)}
          />
          <View style={styles.hotlinesModalContent}>
            
            {/* Header */}
            <View style={styles.hotlinesHeader}>
              <View style={styles.hotlinesHeaderTitleRow}>
                <Feather name="phone-call" size={22} color="#0F2C59" style={{ marginRight: 8 }} />
                <Text style={styles.hotlinesModalTitle} numberOfLines={1}>
                  {barangayConfig.barangayName || 'Barangay'} Hotlines
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowHotlinesModal(false)}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

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
                    <Feather name="flame" size={20} color="#EF4444" />
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

            {/* Back / Dismiss button */}
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={() => setShowHotlinesModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissButtonText}>Done</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* Custom Bottom Tab Pill */}
      <BottomTabNav />

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
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 10,
  },
  panicButtonHolding: {
    backgroundColor: '#DC2626',
    borderColor: '#FECACA',
    transform: [{ scale: 1.05 }],
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
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    // Smooth very faint shadow
    shadowColor: '#00000047',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.02,
    shadowRadius: 16,
    elevation: 2,
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
    color: '#9CA3AF',
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
    shadowColor: '#00000068',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.02, // Faint low opacity shadow
    shadowRadius: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.02)',
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
  },
  fabCircleButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0F2C59',
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth soft shadow for FAB button
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1, // Low opacity smooth blue shadow
    shadowRadius: 20,
    elevation: 4,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 5,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
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
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 18,
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
    borderColor: '#F3F4F6',
    marginBottom: 12,
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
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
