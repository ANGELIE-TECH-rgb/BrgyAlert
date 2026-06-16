import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { useAuth } from '../context/AuthContext';

export default function BottomTabNav() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();

  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [hasUnreadReports, setHasUnreadReports] = useState(false);

  // Identify the active screen to highlight the correct tab
  const activeTab = route.name;

  useEffect(() => {
    if (!user) return;

    // 1. Subscribe to alerts where userId == user.uid for unread messages
    const alertsQ = query(
      collection(db, 'alerts'),
      where('userId', '==', user.uid)
    );
    const unsubscribeAlerts = onSnapshot(alertsQ, (snap) => {
      let unread = false;
      snap.forEach((doc) => {
        if ((doc.data().unreadCountCitizen || 0) > 0) {
          unread = true;
        }
      });
      setHasUnreadMessages(unread);
    }, (err) => {
      console.log('Error listening to alerts unread count inside tab nav:', err);
    });

    // 2. Subscribe to user notifications for unread status updates
    const notifsQ = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false)
    );
    const unsubscribeNotifs = onSnapshot(notifsQ, (snap) => {
      let hasStatusNotifs = false;
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.type === 'status' || data.type === 'incident') {
          hasStatusNotifs = true;
        }
      });
      setHasUnreadReports(hasStatusNotifs);
    }, (err) => {
      console.log('Error listening to notifications count inside tab nav:', err);
    });

    return () => {
      unsubscribeAlerts();
      unsubscribeNotifs();
    };
  }, [user]);

  const tabs = [
    { name: 'CitizenHome', label: 'Home', icon: 'home' },
    { name: 'ChatMessages', label: 'messages', icon: 'message-square' },
    { name: 'CitizenReports', label: 'Reports', icon: 'file-text' },
    { name: 'SettingsTab', label: 'Settings', icon: 'settings' }
  ];

  const handlePress = (tabName) => {
    if (tabName === 'CitizenHome' || tabName === 'CitizenReports' || tabName === 'ChatMessages') {
      navigation.navigate(tabName);
    } else {
      alert(`${tabName} module will be implemented in the next sprint.`);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {tabs.map((tab) => {
          const isSelected = activeTab === tab.name;

          return (
            <TouchableOpacity
              key={tab.name}
              style={[styles.tabButton, isSelected && styles.tabButtonSelected]}
              onPress={() => handlePress(tab.name)}
              activeOpacity={0.8}
            >
              <View style={styles.iconContainer}>
                <Feather
                  name={tab.icon}
                  size={22}
                  color={isSelected ? '#0F2C59' : '#6C757D'}
                  style={styles.tabIcon}
                />
                {tab.name === 'ChatMessages' && hasUnreadMessages && (
                  <View style={styles.redDot} />
                )}
                {tab.name === 'CitizenReports' && hasUnreadReports && (
                  <View style={styles.redDot} />
                )}
              </View>
              <View style={styles.labelWrapper}>
                <Text style={[styles.labelText, isSelected && styles.labelTextSelected]}>
                  {tab.label}
                </Text>
                {isSelected && <View style={styles.underline} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 24,
    zIndex: 20, // Ensure bottom tab is on top of linear gradient
  },
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 40,
    paddingVertical: 5,
    paddingHorizontal: 2, // Increased slightly for horizontal padding breathing room
    justifyContent: 'center', // Cluster items
    alignItems: 'center',
    // Smooth, premium soft shadow
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.03, // Low opacity smooth shadow
    shadowRadius: 24,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.03)',
  },
  tabButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 6, // Control spacing directly between items
    borderRadius: 30,
    minWidth: 64,
  },
  tabButtonSelected: {
    backgroundColor: '#E8F0FE', // Light blue selected pill highlight
  },
  tabIcon: {
    marginBottom: 2,
  },
  labelWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6C757D',
    textAlign: 'center',
  },
  labelTextSelected: {
    color: '#0F2C59',
    fontWeight: '700',
  },
  underline: {
    width: 16,
    height: 2,
    backgroundColor: '#0F2C59',
    borderRadius: 1,
    marginTop: 2,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
});


