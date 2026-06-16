import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import NetInfo from '@react-native-community/netinfo';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import { getCurrentLocation } from '../../services/locationService';
import IncidentCard from '../../components/IncidentCard';
import BottomTabNav from '../../components/BottomTabNav';

export default function CitizenDashboard({ navigation }) {
  const { user, userProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [isOnline, setIsOnline] = useState(true);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Panic Button hold-to-press states
  const [holdTimer, setHoldTimer] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(3);
  const [isHolding, setIsHolding] = useState(false);
  const secondsRef = useRef(3);

  // Monitor Network Connectivity State
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribeNet();
  }, []);

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

  // Start Panic Button Hold
  const handlePanicPressIn = () => {
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
            onPress={() => alert('Notifications feature is coming in Sprint 4!')}
          >
            <Feather name="bell" size={22} color="#1F2937" />
          </TouchableOpacity>
        </View>

        {/* Hold-to-Panic Circular Button Block (Custom Mockup Emergency Icon - No concentric rings, shadow-based) */}
        <View style={styles.panicContainer}>
          <TouchableOpacity
            style={[
              styles.panicButton,
              isHolding && styles.panicButtonHolding
            ]}
            onPressIn={handlePanicPressIn}
            onPressOut={handlePanicPressOut}
            activeOpacity={0.9}
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

                {/* Siren light dome and base overlapping bottom-right corner */}
                <Path
                  d="M 36 44 L 56 44"
                  stroke="#FFFFFF"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <Path
                  d="M 38 44 C 38 34 54 34 54 44 Z"
                  fill="#FFFFFF"
                />
                <Path
                  d="M 52 32 L 57 27 M 55 40 L 61 39 M 46 28 L 48 21"
                  stroke="#FFFFFF"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </Svg>
            )}
          </TouchableOpacity>
          <Text style={styles.panicSubtitle}>
            {isHolding ? 'RELEASE TO CANCEL' : 'Press and hold in an immediate threatening emergency.'}
          </Text>
        </View>

        {/* Quick Services section */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Quick Services</Text>
          <View style={styles.servicesGrid}>

            {/* Hotlines Card */}
            <TouchableOpacity
              style={styles.serviceCard}
              onPress={() => alert('Emergency Hotlines directory is coming soon!')}
            >
              <View style={styles.serviceIconWrapper}>
                <Feather name="phone-call" size={20} color="#2563EB" />
              </View>
              <Text style={styles.serviceText}>Emergency Hotlines</Text>
            </TouchableOpacity>

            {/* My Reports Card */}
            <TouchableOpacity
              style={styles.serviceCard}
              onPress={() => alert(`You have submitted ${recentLogs.length} reports.`)}
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
            <TouchableOpacity onPress={() => alert('Historical logs view coming in Sprint 3!')}>
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
  panicButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FF3B3F', // Mockup red color
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFEBEB',
    // Smooth glowing red shadow
    shadowColor: '#FF3B3F',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15, // Low opacity soft red shadow
    shadowRadius: 28,
    elevation: 6,
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
});
