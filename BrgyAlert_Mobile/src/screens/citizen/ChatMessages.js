import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import BottomTabNav from '../../components/BottomTabNav';

export default function ChatMessages({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch only this citizen's incident reports
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'alerts'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push({
            id: doc.id,
            ...doc.data(),
          });
        });
        setAlerts(list);
        setLoading(false);
      },
      (error) => {
        console.error('Snapshot listener error on ChatMessages:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Helper for Status Badge colors
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'submitted':
        return { bg: '#FFF9E6', text: '#D97706', label: 'PENDING' };
      case 'under_review':
        return { bg: '#EFF6FF', text: '#2563EB', label: 'UNDER REVIEW' };
      case 'dispatched':
        return { bg: '#ECFDF5', text: '#10B981', label: 'DISPATCHED' };
      case 'done':
      case 'resolved':
        return { bg: '#F3F4F6', text: '#4B5563', label: 'RESOLVED' };
      case 'declined':
        return { bg: '#FEF2F2', text: '#EF4444', label: 'DECLINED' };
      default:
        return { bg: '#FFF9E6', text: '#D97706', label: 'PENDING' };
    }
  };

  // Helper for category-based icons
  const getCategoryStyle = (category) => {
    switch (category) {
      case 'Physical Abuse':
      case 'Crime':
        return { icon: 'shield', color: '#EF4444', bg: '#FEF2F2' };
      case 'Fire':
        return { icon: 'alert-triangle', color: '#EF4444', bg: '#FEF2F2' };
      case 'Medical':
        return { icon: 'activity', color: '#EF4444', bg: '#FEF2F2' };
      case 'Flooding':
        return { icon: 'droplet', color: '#3B82F6', bg: '#EFF6FF' };
      case 'Accident':
        return { icon: 'alert-octagon', color: '#D97706', bg: '#FFF7ED' };
      case 'Traffic':
        return { icon: 'truck', color: '#D97706', bg: '#FFF7ED' };
      default:
        return { icon: 'info', color: '#2563EB', bg: '#EFF6FF' };
    }
  };

  // Render incident chat item card
  const renderItem = ({ item, index }) => {
    const badge = getStatusBadgeStyle(item.status);
    const catStyle = getCategoryStyle(item.category);
    const serialCode = item.id ? `#INC-${item.id.substring(0, 3).toUpperCase()}` : `#INC-00${index + 1}`;

    // Format Time of Last Message or Creation
    let timeText = '';
    const timeRef = item.lastMessageAt || item.createdAt;
    if (timeRef) {
      try {
        const date = timeRef.toDate ? timeRef.toDate() : new Date(timeRef);
        timeText = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      } catch (e) {
        // Fallback
      }
    }

    const previewMessageText = item.lastMessageText || item.details || 'No message or details yet.';
    const displayMessage = previewMessageText.length > 55
      ? previewMessageText.substring(0, 52) + '...'
      : previewMessageText;

    const unreadCount = item.unreadCountCitizen || 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ChatScreen', { alertId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: catStyle.bg }]}>
            <Feather name={catStyle.icon} size={20} color={catStyle.color} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.serialText}>{serialCode}</Text>
              <Text style={styles.categoryText}>{item.category || 'General'}</Text>
              <View style={[styles.statusTag, { backgroundColor: badge.bg, marginLeft: 8 }]}>
                <Text style={[styles.statusTagText, { color: badge.text }]}>
                  {badge.label}
                </Text>
              </View>
            </View>
            <Text 
              style={[styles.messagePreview, unreadCount > 0 && styles.messagePreviewUnread]} 
              numberOfLines={1}
            >
              {displayMessage}
            </Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={[styles.timeText, unreadCount > 0 && styles.timeTextUnread]}>{timeText}</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <Feather name="chevron-right" size={16} color="#9CA3AF" style={styles.chevron} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <Text style={styles.headerSubtitle}>
          {loading ? 'Connecting...' : 'Direct chat with Command Center responders'}
        </Text>
      </View>

      {/* List / Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0F2C59" />
          <Text style={styles.loadingText}>Syncing message threads...</Text>
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconWrapper}>
            <Feather name="message-square" size={40} color="#9CA3AF" />
          </View>
          <Text style={styles.emptyText}>
            No reports filed yet. Tapping the floating '+' button on the home screen allows you to report an incident and start chatting.
          </Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom Smooth Gradient Background Fade */}
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

      {/* Floating Bottom Tab Nav Bar */}
      <BottomTabNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 155,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 2,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  serialText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    marginRight: 6,
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  statusTag: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 8,
    fontWeight: '700',
  },
  messagePreview: {
    fontSize: 13,
    color: '#6B7280',
  },
  cardRight: {
    alignItems: 'center',
    marginLeft: 12,
    flexDirection: 'row',
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginRight: 4,
  },
  chevron: {
    marginLeft: 2,
  },
  unreadBadge: {
    backgroundColor: '#0F2C59',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
    marginRight: 4,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  timeTextUnread: {
    color: '#0F2C59',
    fontWeight: '700',
  },
  messagePreviewUnread: {
    fontWeight: '700',
    color: '#111827',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 14,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
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
