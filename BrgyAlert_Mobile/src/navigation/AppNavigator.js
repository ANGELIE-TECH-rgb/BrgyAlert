import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { registerForNotificationsAsync, sendAndSaveNotification, getActiveChat } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';

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

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, userProfile, loading } = useAuth();

  const [showSplash, setShowSplash] = useState(true);
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

              // 1. Startup Sync: notify on unread messages/pending alerts if notifications don't exist
              if (isFirstLoad) {
                if (isAdmin) {
                  // Admin unread messages sync
                  if ((data.unreadCountAdmin || 0) > 0 && !activeUnreadNotifs[`message_${alertId}`]) {
                    sendAndSaveNotification(user.uid, {
                      title: `💬 Message from ${data.reporterName || 'Citizen'}`,
                      body: data.lastMessageText || 'New message received.',
                      type: 'message',
                      relatedId: alertId
                    });
                    activeUnreadNotifs[`message_${alertId}`] = true;
                  }
                  // Admin pending reports sync
                  if (data.status === 'submitted' && !activeUnreadNotifs[`incident_${alertId}`]) {
                    const locationText = data.location?.addressText || 'Unknown Location';
                    sendAndSaveNotification(user.uid, {
                      title: `🚨 NEW INCIDENT: ${data.category || 'General'}`,
                      body: `Reported at ${locationText}. Urgency: ${(data.urgency || 'medium').toUpperCase()}.`,
                      type: 'incident',
                      relatedId: alertId
                    });
                    activeUnreadNotifs[`incident_${alertId}`] = true;
                  }
                } else {
                  // Citizen unread messages sync
                  if ((data.unreadCountCitizen || 0) > 0 && !activeUnreadNotifs[`message_${alertId}`]) {
                    sendAndSaveNotification(user.uid, {
                      title: `💬 Message from Barangay Command Center`,
                      body: data.lastMessageText || 'New message received.',
                      type: 'message',
                      relatedId: alertId
                    });
                    activeUnreadNotifs[`message_${alertId}`] = true;
                  }
                }
              }

              // 2. Real-time Trigger for brand new reports (Only Admin/Responder gets notified)
              if (isAdmin && !isFirstLoad) {
                const locationText = data.location?.addressText || 'Unknown Location';
                sendAndSaveNotification(user.uid, {
                  title: `🚨 NEW INCIDENT: ${data.category || 'General'}`,
                  body: `Reported at ${locationText}. Urgency: ${(data.urgency || 'medium').toUpperCase()}.`,
                  type: 'incident',
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

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Auth Stack (Unauthenticated)
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ReportWizard" component={ReportWizard} />
            <Stack.Screen name="ReportSuccess" component={ReportSuccess} />
          </>
        ) : userProfile?.role === 'responder' || userProfile?.role === 'admin' ? (
          // Admin / Responder stack
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
          </>
        ) : (
          // Citizen Stack (Default)
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
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
});
