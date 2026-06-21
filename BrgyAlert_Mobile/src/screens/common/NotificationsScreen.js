import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
  SafeAreaView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import { markAsRead, markAllAsRead } from '../../services/notificationService';
import NetInfo from '@react-native-community/netinfo';
import SkeletonLoader from '../../components/SkeletonLoader';
import ConnectionBlocker from '../../components/ConnectionBlocker';

export default function NotificationsScreen({ navigation }) {
  const { user, userProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'responder';

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  // Monitor Network Connectivity State
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsubscribeNet();
  }, []);

  // Subscribe to user notifications in real-time
  useEffect(() => {
    if (!user) return;

    // Primary query: ordered by createdAt descending (requires Firestore index)
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setNotifications(list);
      setLoading(false);
    }, (error) => {
      console.log('[Notifications] Snapshot error code:', error.code);
      console.log('[Notifications] Snapshot error message:', error.message);

      if (error.code === 'permission-denied') {
        // Rules may not allow the ordered query — try without orderBy
        console.log('[Notifications] Permission denied on ordered query. Trying unordered fallback...');
      }

      // Fallback: try unordered query and sort client-side
      const fallbackQ = query(collection(db, 'users', user.uid, 'notifications'));
      onSnapshot(fallbackQ, (snap) => {
        const list = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        // Sort client-side by createdAt descending
        list.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
          const bTime = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
          return bTime - aTime;
        });
        setNotifications(list);
        setLoading(false);
      }, (fallbackErr) => {
        console.log('[Notifications] Fallback query error:', fallbackErr.code, fallbackErr.message);
        setLoading(false);
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Format timestamp into relative or clean short string
  const formatTime = (createdAt) => {
    if (!createdAt) return '';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  // Get configuration (colors and icons) for each notification type
  const getTypeConfig = (type) => {
    switch (type) {
      case 'incident':
        return {
          icon: 'alert-triangle',
          color: '#EF4444',
          bg: '#FEF2F2'
        };
      case 'message':
        return {
          icon: 'message-square',
          color: '#2563EB',
          bg: '#EFF6FF'
        };
      case 'status':
        return {
          icon: 'activity',
          color: '#D97706',
          bg: '#FFF9E6'
        };
      default:
        return {
          icon: 'bell',
          color: '#6B7280',
          bg: '#F3F4F6'
        };
    }
  };

  const handleNotificationPress = async (item) => {
    // 1. Mark as read in Firestore
    if (!item.read) {
      await markAsRead(user.uid, item.id);
    }

    // 2. Navigate depending on type and role
    if (!item.relatedId) return;

    if (item.type === 'message') {
      navigation.navigate('ChatScreen', { alertId: item.relatedId });
    } else if (item.type === 'incident') {
      if (isAdmin) {
        navigation.navigate('IncidentDetail', { alertId: item.relatedId });
      } else {
        navigation.navigate('StatusTracker', { alertId: item.relatedId });
      }
    } else if (item.type === 'status') {
      if (isAdmin) {
        navigation.navigate('IncidentDetail', { alertId: item.relatedId });
      } else {
        navigation.navigate('StatusTracker', { alertId: item.relatedId });
      }
    }
  };

  const hasUnread = notifications.some(n => !n.read);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

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

      {/* Header Panel */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={22} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>

        {hasUnread && (
          <TouchableOpacity
            onPress={() => markAllAsRead(user.uid)}
            activeOpacity={0.7}
            style={styles.markReadBtn}
          >
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content Area */}
      {loading ? (
        <SkeletonLoader type="notification" count={5} />
      ) : notifications.length === 0 ? (
        <View style={styles.centered}>
          <View style={styles.emptyIconWrapper}>
            <Feather name="bell-off" size={48} color="#9CA3AF" />
          </View>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySubtitle}>No new notifications to show here.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const config = getTypeConfig(item.type);
            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  !item.read && styles.unreadCard
                ]}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrapper, { backgroundColor: config.bg }]}>
                  <Feather name={config.icon} size={20} color={config.color} />
                </View>

                <View style={styles.cardTextContent}>
                  <View style={styles.cardHeaderRow}>
                    <Text
                      style={[
                        styles.cardTitle,
                        !item.read && styles.unreadText
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.cardBody} numberOfLines={2}>
                    {item.body}
                  </Text>
                </View>

                {!item.read && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Connection Loss Blocker for Citizens */}
      {!isAdmin && !isOnline && <ConnectionBlocker navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEEF1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  markReadBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 12,
    position: 'relative',
    // Faint elegant shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  unreadCard: {
    backgroundColor: '#F9FCFF',
    borderColor: '#E0EEFF',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardTextContent: {
    flex: 1,
    paddingRight: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
    marginRight: 8,
  },
  unreadText: {
    fontWeight: '700',
    color: '#111827',
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  cardBody: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -4,
  }
});
