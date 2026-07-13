import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Text, Linking, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, query, where, onSnapshot, getDocs, writeBatch, limit } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { registerForNotificationsAsync, sendAndSaveNotification, getActiveChat } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';
import NetInfo from '@react-native-community/netinfo';
import { Feather } from '@expo/vector-icons';
import { getCurrentLocation } from '../services/locationService';

// Import Splash & Welcome Screens
import SplashScreen from '../screens/common/SplashScreen';
import WelcomeScreen from '../screens/common/WelcomeScreen';

// Import Screens
import LoginScreen from '../screens/common/LoginScreen';
import RegisterScreen from '../screens/common/RegisterScreen';
import ForgotPasswordScreen from '../screens/common/ForgotPasswordScreen';
import CitizenDashboard from '../screens/citizen/CitizenDashboard';
import AdminConsole from '../screens/admin/AdminConsole';
import IncidentDetail from '../screens/admin/IncidentDetail';
import AdminMapScreen from '../screens/admin/AdminMapScreen';
import AdminQueue from '../screens/admin/AdminQueue';
import ReportWizard from '../screens/citizen/ReportWizard';
import ReportSuccess from '../screens/citizen/ReportSuccess';
import StatusTracker from '../screens/citizen/StatusTracker';
import CitizenReports from '../screens/citizen/CitizenReports';
import ChatMessages from '../screens/citizen/ChatMessages';
import AdminMessages from '../screens/admin/AdminMessages';
import AdminAnalytics from '../screens/admin/AdminAnalytics';
import ChatScreen from '../screens/common/ChatScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import CitizenSettings from '../screens/citizen/CitizenSettings';
import AdminSettings from '../screens/admin/AdminSettings';
import LocationRequiredModal from '../components/LocationRequiredModal';
import AdminAddRecord from '../screens/admin/AdminAddRecord';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, userProfile, loading } = useAuth();

  const [showSplash, setShowSplash] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  const triggerGlobalOfflinePanicSms = async () => {
    try {
      let lat = 0;
      let lng = 0;
      let addr = 'Barangay Lepa (Offline SOS)';
      try {
        const location = await getCurrentLocation();
        lat = location.latitude;
        lng = location.longitude;
        addr = location.addressText;
      } catch (locErr) {
        console.log('[Global SOS] Could not retrieve coordinates offline:', locErr);
      }

      let gateways = ['+639090000000'];
      try {
        const cached = await AsyncStorage.getItem('cached_sms_gateways');
        if (cached) {
          gateways = JSON.parse(cached);
        }
      } catch (e) {
        console.log('[Global SOS] Error reading cached gateways:', e);
      }

      // Format location: 15.92604,120.43501 (https://maps.google.com/?q=15.92604,120.43501)
      const coordStr = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      const mapsUrl = `https://maps.google.com/?q=${coordStr}`;
      const cleanedLoc = `${coordStr} (${mapsUrl})`;
      const details = 'EMERGENCY PANIC DISPATCH TRIGGERED OFFLINE';
      const smsPayload = `BA!G!${cleanedLoc}!${details}`;

      const gatewayRecipients = gateways.join(',');
      const smsUrl = `sms:${gatewayRecipients}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(smsPayload)}`;

      const supported = await Linking.canOpenURL(smsUrl);
      if (supported) {
        const localReport = {
          id: `offline_${Date.now()}`,
          userId: user ? user.uid : 'guest',
          reporterName: userProfile?.fullName || 'Anonymous Citizen',
          phoneNumber: userProfile?.phoneNumber || '',
          category: 'General',
          details: 'EMERGENCY PANIC DISPATCH TRIGGERED OFFLINE',
          witnessName: 'None',
          location: {
            addressText: addr,
            latitude: lat,
            longitude: lng
          },
          source: 'offline_sms',
          status: 'offline_pending',
          urgency: 'critical',
          mediaUrls: [],
          createdAt: new Date().toISOString(),
          isOffline: true
        };

        const storeKey = `offline_reports_${user?.uid || 'guest'}`;
        let localList = [];
        try {
          const rawLocalList = await AsyncStorage.getItem(storeKey);
          if (rawLocalList) {
            localList = JSON.parse(rawLocalList);
          }
        } catch (e) {
          console.log('[Global SOS] Error reading local offline reports:', e);
        }

        localList.push(localReport);
        await AsyncStorage.setItem(storeKey, JSON.stringify(localList));

        await Linking.openURL(smsUrl);
      } else {
        Alert.alert('SMS Error', 'Could not open native SMS client.');
      }
    } catch (err) {
      console.log('[Global SOS] Offline panic SMS dispatch failed:', err);
      Alert.alert('Error', 'Could not compile and launch SMS dispatch.');
    }
  };

  const handleGlobalSosPress = () => {
    Alert.alert(
      'Offline Emergency SOS',
      'You are currently offline. Would you like to compile and send a direct Emergency Panic SMS, or call Emergency Hotlines directly?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Call Hotlines', 
          onPress: () => {
            Linking.openURL('tel:911').catch((err) => {
              console.log('Error launching dialer:', err);
              Alert.alert('Error', 'Could not dial emergency hotlines.');
            });
          } 
        },
        { text: 'Send via SMS', onPress: () => triggerGlobalOfflinePanicSms() }
      ]
    );
  };
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Check Onboarding state on mount
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const val = await AsyncStorage.getItem('hasSeenOnboarding');
        setHasSeenOnboarding(val === 'true');
      } catch (err) {
        console.log('Error checking onboarding state:', err);
        setHasSeenOnboarding(true); // Fallback to true if read error to avoid lockout
      }
    };
    checkOnboarding();
  }, []);

  // Force splash screen to show for at least 3 seconds on app startup
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Complete initial loading sequence once splash timer, auth states, and onboarding checks settle
  useEffect(() => {
    if (!showSplash && !loading && hasSeenOnboarding !== null) {
      setIsInitialLoad(false);
    }
  }, [showSplash, loading, hasSeenOnboarding]);

  // App-wide Notification and Firestore Event Sync Listener
  useEffect(() => {
    if (!user || !userProfile) return;

    // Request OS local notification permissions
    registerForNotificationsAsync();

    // Cache the previous alerts/reports state locally
    const previousAlerts = {};
    let isFirstLoad = true;

    const isAdmin = userProfile.role === 'admin' || userProfile.role === 'responder';
    let unsubscribeAlerts = () => { };

    const setupListener = async () => {
      const activeUnreadNotifs = {};

      // ── Seed notifications for citizens with existing reports ──────────────
      // This runs ONCE per login session for citizens.
      // If a citizen has active reports but no notifications in their feed,
      // we create a summary notification so the screen is never empty.
      if (!isAdmin) {
        const seedKey = `notifSeeded_${user.uid}`;
        const alreadySeeded = await AsyncStorage.getItem(seedKey);
        if (!alreadySeeded) {
          try {
            // Check if they have any existing notifications
            const existingNotifsSnap = await getDocs(
              query(collection(db, 'users', user.uid, 'notifications'), limit(1))
            );
            if (existingNotifsSnap.empty) {
              // No notifications yet — seed one for each active/pending report
              const reportsSnap = await getDocs(
                query(
                  collection(db, 'alerts'),
                  where('userId', '==', user.uid)
                )
              );
              const ACTIVE_STATUSES = ['submitted', 'under_review', 'in_progress'];
              for (const reportDoc of reportsSnap.docs) {
                const rData = reportDoc.data();
                const reportStatus = rData.status || 'submitted';
                if (!ACTIVE_STATUSES.includes(reportStatus)) continue; // skip resolved reports
                await sendAndSaveNotification(user.uid, {
                  title: `📋 Report Status: ${reportStatus.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
                  body: `Your ${rData.category || 'Incident'} report is currently ${reportStatus.replace('_', ' ')}. We'll notify you of any updates.`,
                  type: 'status',
                  relatedId: reportDoc.id,
                }, true /* skipLocalNotification — seed is silent, user already knows about these reports */);
              }
            }
            await AsyncStorage.setItem(seedKey, 'true');
          } catch (seedErr) {
            console.log('[AppNavigator] Notification seed error:', seedErr.message);
          }
        }
      }

      try {
        const notifsQ = query(
          collection(db, 'users', user.uid, 'notifications'),
          where('read', '==', false)
        );
        const snap = await getDocs(notifsQ);
        snap.forEach((d) => {
          const data = d.data();
          activeUnreadNotifs[`${data.type}_${data.relatedId}`] = true;
        });
      } catch (err) {
        console.log('Error pre-fetching notifications in AppNavigator:', err);
      }

      let q;
      if (isAdmin) {
        q = query(collection(db, 'alerts'));
      } else {
        q = query(collection(db, 'alerts'), where('userId', '==', user.uid));
      }

      const getMillis = (ts) => {
        if (!ts) return 0;
        if (ts.toMillis) return ts.toMillis();
        return new Date(ts).getTime();
      };

      unsubscribeAlerts = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const alertId = change.doc.id;
            const data = change.doc.data();

            if (change.type === 'added') {
              previousAlerts[alertId] = {
                status: data.status,
                unreadCountAdmin: data.unreadCountAdmin || 0,
                unreadCountCitizen: data.unreadCountCitizen || 0,
                lastMessageAt: data.lastMessageAt,
              };

              // previousAlerts is tracked for changes in modifications

              // 2. Real-time Trigger for brand new reports (Only Admin/Responder gets notified)
              if (isAdmin && !isFirstLoad) {
                const locationText = data.location?.addressText || 'Unknown Location';
                const isPanic = data.urgency === 'critical' || (data.details && data.details.includes('PANIC BUTTON'));
                const notifType = isPanic ? 'emergency' : 'incident';

                sendAndSaveNotification(user.uid, {
                  title: isPanic ? `🚨 CRITICAL PANIC ALERT!` : `🚨 NEW INCIDENT: ${data.category || 'General'}`,
                  body: isPanic
                    ? `Panic button triggered by ${data.reporterName || 'Citizen'} at ${locationText}.`
                    : `Reported at ${locationText}. Urgency: ${(data.urgency || 'medium').toUpperCase()}.`,
                  type: notifType,
                  relatedId: alertId
                });
              }
            } else if (change.type === 'modified') {
              const prev = previousAlerts[alertId] || {
                status: data.status,
                unreadCountAdmin: 0,
                unreadCountCitizen: 0,
                lastMessageAt: null,
              };

              // 1. Check for Status Change Notifications (Citizen only)
              if (!isAdmin && data.status !== prev.status) {
                let friendlyStatus = (data.status || 'submitted').replace('_', ' ').toUpperCase();
                sendAndSaveNotification(user.uid, {
                  title: `📋 Report Update: ${data.category || 'Incident'}`,
                  body: `Your report #${alertId.substring(0, 5).toUpperCase()} is now ${friendlyStatus}.`,
                  type: 'status',
                  relatedId: alertId
                });
              }

              // 2. Check for New Message Notifications
              const activeChatId = getActiveChat();
              if (activeChatId !== alertId) {
                if (isAdmin) {
                  const isNewMessage =
                    (data.unreadCountAdmin || 0) > (prev.unreadCountAdmin || 0) ||
                    (data.lastMessageAt && (getMillis(data.lastMessageAt) > getMillis(prev.lastMessageAt)) && data.lastMessageSenderId !== user.uid);

                  if (isNewMessage) {
                    sendAndSaveNotification(user.uid, {
                      title: `💬 Message from ${data.reporterName || 'Citizen'}`,
                      body: data.lastMessageText || 'New message received.',
                      type: 'message',
                      relatedId: alertId
                    });
                  }
                } else {
                  const isNewMessage =
                    (data.unreadCountCitizen || 0) > (prev.unreadCountCitizen || 0) ||
                    (data.lastMessageAt && (getMillis(data.lastMessageAt) > getMillis(prev.lastMessageAt)) && data.lastMessageSenderId !== user.uid);

                  if (isNewMessage) {
                    sendAndSaveNotification(user.uid, {
                      title: `💬 Message from Barangay Command Center`,
                      body: data.lastMessageText || 'New message received.',
                      type: 'message',
                      relatedId: alertId
                    });
                  }
                }
              }

              // Update cache
              previousAlerts[alertId] = {
                status: data.status,
                unreadCountAdmin: data.unreadCountAdmin || 0,
                unreadCountCitizen: data.unreadCountCitizen || 0,
                lastMessageAt: data.lastMessageAt,
              };
            } else if (change.type === 'removed') {
              // Delete cache entry
              delete previousAlerts[alertId];

              // Clean up any Firestore notifications pointing to this deleted alert ID
              const cleanupNotifs = async () => {
                try {
                  const notifsRef = collection(db, 'users', user.uid, 'notifications');
                  const notifsQ = query(notifsRef, where('relatedId', '==', alertId));
                  const snap = await getDocs(notifsQ);
                  if (!snap.empty) {
                    const batch = writeBatch(db);
                    snap.forEach((docSnap) => {
                      batch.delete(docSnap.ref);
                    });
                    await batch.commit();
                  }
                } catch (err) {
                  console.log('Error cleaning up notifications for deleted alert:', err);
                }
              };
              cleanupNotifs();
            }
          });

          isFirstLoad = false;
        },
        (error) => {
          console.log('Error in app-wide notification listener:', error);
        }
      );
    };

    setupListener();

    return () => unsubscribeAlerts();
  }, [user, userProfile]);

  // Render animated Splash Screen only during initial app startup
  if (isInitialLoad) {
    return <SplashScreen />;
  }

  // Render Onboarding Welcome Screen for strictly new app installations
  if (!hasSeenOnboarding) {
    return <WelcomeScreen onFinish={() => setHasSeenOnboarding(true)} />;
  }

  // Prevent routing transitions while user is authenticated but profile is still loading
  if (user && !userProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0B2564" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!user ? (
            // Auth Stack (Unauthenticated) — no protected routes
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
              <Stack.Screen name="ReportWizard" component={ReportWizard} />
              <Stack.Screen name="ReportSuccess" component={ReportSuccess} />
            </>
          ) : userProfile?.role === 'responder' || userProfile?.role === 'admin' ? (
            // ── Admin / Responder stack ─────────────────────────────────────────
            // SECURITY: Only renders when the Firestore-verified role is 'admin'
            // or 'responder'. Citizens cannot access these screens because their
            // routes are simply not registered in the navigator for their session.
            // This stack-based isolation is the client-side navigation guard.
            <>
              <Stack.Screen name="AdminHome" component={AdminConsole} />
              <Stack.Screen name="AdminQueue" component={AdminQueue} />
              <Stack.Screen name="AdminMessages" component={AdminMessages} />
              <Stack.Screen name="AdminAnalytics" component={AdminAnalytics} />
              <Stack.Screen name="IncidentDetail" component={IncidentDetail} />
              <Stack.Screen name="AdminMapScreen" component={AdminMapScreen} />
              <Stack.Screen name="ChatScreen" component={ChatScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="AdminSettings" component={AdminSettings} />
              <Stack.Screen name="AdminAddRecord" component={AdminAddRecord} />
            </>
          ) : (
            // ── Citizen Stack ───────────────────────────────────────────────────
            // SECURITY: Admin screens are not registered here — citizens have no
            // route to navigate to any admin screen even via deep links or state
            // manipulation. Firestore rules provide the server-side enforcement.
            <>
              <Stack.Screen name="CitizenHome" component={CitizenDashboard} />
              <Stack.Screen name="CitizenReports" component={CitizenReports} />
              <Stack.Screen name="ChatMessages" component={ChatMessages} />
              <Stack.Screen name="ReportWizard" component={ReportWizard} />
              <Stack.Screen name="ReportSuccess" component={ReportSuccess} />
              <Stack.Screen name="StatusTracker" component={StatusTracker} />
              <Stack.Screen name="ChatScreen" component={ChatScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="SettingsTab" component={CitizenSettings} />
            </>
          )}
        </Stack.Navigator>
        <LocationRequiredModal />
      </NavigationContainer>

      {!isOnline && (
        <TouchableOpacity 
          style={styles.globalSosButton}
          onPress={handleGlobalSosPress}
          activeOpacity={0.8}
        >
          <Feather name="alert-octagon" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.globalSosText}>OFFLINE SOS</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  globalSosButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 55 : 45,
    right: 16,
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  globalSosText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
