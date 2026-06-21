import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import BottomTabNav from '../../components/BottomTabNav';
import TutorialOverlay from '../../components/TutorialOverlay';
import NetInfo from '@react-native-community/netinfo';
import SkeletonLoader from '../../components/SkeletonLoader';
import ConnectionBlocker from '../../components/ConnectionBlocker';
import EmptyState from '../../components/EmptyState';

const getRelativeTime = (dateInput) => {
  if (!dateInput) return '';
  const now = new Date();
  const date = new Date(dateInput);
  const diffMs = now - date;
  
  if (diffMs < 0) return 'Just now';
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) {
    const isSameDay = now.getDate() === date.getDate() && now.getMonth() === date.getMonth() && now.getFullYear() === date.getFullYear();
    if (isSameDay) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.getDate() === date.getDate() && yesterday.getMonth() === date.getMonth() && yesterday.getFullYear() === date.getFullYear();
  if (isYesterday) return 'Yesterday';

  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function ChatMessages({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
  };

  // Monitor Network Connectivity State
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsubscribeNet();
  }, []);
  const [readFilter, setReadFilter] = useState('all'); // all | unread | read
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const checkTutorial = async () => {
        try {
          const val = await AsyncStorage.getItem('hasSeenMessagesTutorial');
          if (val !== 'true') {
            setTimeout(() => {
              setShowTutorial(true);
            }, 600);
          } else {
            setShowTutorial(false);
          }
        } catch (err) {
          console.log('Error checking messages tutorial state:', err);
        }
      };
      checkTutorial();
    });
    return unsubscribe;
  }, [navigation]);

  const handleFinishTutorial = async () => {
    try {
      await AsyncStorage.setItem('hasSeenMessagesTutorial', 'true');
    } catch (err) {
      console.log('Error saving messages tutorial state:', err);
    }
    setShowTutorial(false);
  };

  const messagesTourSteps = [
    {
      title: 'Chat Inbox Feed',
      desc: 'View all your active conversation threads. Conversation items highlighted in bold text with a blue badge contain unread updates from the Command Center.',
      top: insets.top + Math.round(H * 0.08),
      arrow: 'top'
    },
    {
      title: 'Real-time Coordination',
      desc: 'A dedicated chat thread is automatically opened for each report you submit, allowing you to easily send updates or photos directly to responders.',
      top: Math.round(H * 0.26),
      arrow: 'top'
    }
  ];

  // Filter alerts by search query and read/unread status
  const filteredAlerts = alerts.filter((alert) => {
    const serialCode = alert.id ? `INC-${alert.id.substring(0, 3).toUpperCase()}` : '';
    const matchesSearch =
      (alert.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (alert.details || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (alert.lastMessageText || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      serialCode.toLowerCase().includes(searchQuery.toLowerCase());

    const unreadCount = alert.unreadCountCitizen || 0;
    const matchesFilter =
      readFilter === 'all' ||
      (readFilter === 'unread' && unreadCount > 0) ||
      (readFilter === 'read' && unreadCount === 0);

    return matchesSearch && matchesFilter;
  });

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
          const data = doc.data();
          if (data.status === 'declined') {
            return;
          }
          list.push({
            id: doc.id,
            ...data,
          });
        });
        setAlerts(list);
        setLoading(false);
      },
      (error) => {
        console.log('Snapshot listener error on ChatMessages:', error);
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

  // Helper for status borders
  const getStatusBorderColor = (status) => {
    switch (status) {
      case 'submitted': return '#F59E0B'; // Amber
      case 'under_review': return '#3B82F6'; // Blue
      case 'dispatched': return '#10B981'; // Green
      case 'resolved':
      case 'done':
        return '#9CA3AF'; // Grey
      default: return '#D97706';
    }
  };

  // Render incident chat item card
  const renderItem = ({ item, index }) => {
    const badge = getStatusBadgeStyle(item.status);
    const catStyle = getCategoryStyle(item.category);
    const serialCode = item.id ? `#INC-${item.id.substring(0, 3).toUpperCase()}` : `#INC-00${index + 1}`;

    // Format Time of Last Message or Creation
    const timeRef = item.lastMessageAt || item.createdAt;
    const timeText = getRelativeTime(timeRef ? (timeRef.toDate ? timeRef.toDate() : new Date(timeRef)) : null);

    const previewMessageText = item.lastMessageText || item.details || 'No message or details yet.';
    const displayMessage = previewMessageText.length > 55
      ? previewMessageText.substring(0, 52) + '...'
      : previewMessageText;

    const unreadCount = item.unreadCountCitizen || 0;
    const isResolved = item.status === 'done' || item.status === 'resolved';

    return (
      <TouchableOpacity
        style={[
          styles.card, 
          unreadCount > 0 && styles.cardUnreadAccent,
          isResolved && styles.cardResolvedMuted
        ]}
        onPress={() => navigation.navigate('ChatScreen', { alertId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <View style={[
            styles.iconWrapper, 
            { 
              backgroundColor: catStyle.bg,
              borderWidth: 2,
              borderColor: getStatusBorderColor(item.status)
            }
          ]}>
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
              style={[
                styles.messagePreview, 
                unreadCount > 0 && styles.messagePreviewUnread,
                isResolved && styles.messagePreviewItalic
              ]} 
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

      {/* Search and Filter Panel */}
      {!loading && alerts.length > 0 && (
        <View style={styles.searchFilterContainer}>
          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search conversations..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={16} color="#6B7280" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Filter Pills */}
          <View style={styles.filterPills}>
            {['all', 'unread', 'read'].map((filter) => {
              const isSelected = readFilter === filter;
              const label = filter.charAt(0).toUpperCase() + filter.slice(1);
              return (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterPill, isSelected && styles.filterPillActive]}
                  onPress={() => setReadFilter(filter)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* List / Content */}
      {loading ? (
        <SkeletonLoader type="thread" count={4} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon="message-square"
          title="No Conversations Yet"
          subtitle="Tapping the floating '+' button on the home screen allows you to report an incident and start chatting."
          actionLabel="Go to Dashboard"
          onActionPress={() => navigation.navigate('CitizenHome')}
          accentColor="#0F2C59"
        />
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          icon="search"
          title="No Matches Found"
          subtitle="No conversations match your search or filter."
          actionLabel="Clear Search"
          onActionPress={() => setSearchQuery('')}
          accentColor="#0F2C59"
        />
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
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

      {/* Connection Loss Blocker for Citizens */}
      {!isOnline && <ConnectionBlocker navigation={navigation} />}

      {/* Floating Bottom Tab Nav Bar */}
      <BottomTabNav />

      {/* Tutorial Overlay App Tour */}
      {showTutorial && (
        <TutorialOverlay
          steps={messagesTourSteps}
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
  cardUnreadAccent: {
    borderLeftWidth: 4,
    borderLeftColor: '#0F2C59',
    paddingLeft: 12,
  },
  cardResolvedMuted: {
    opacity: 0.55,
  },
  messagePreviewItalic: {
    fontStyle: 'italic',
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
  searchFilterContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    height: '100%',
  },
  filterPills: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: '#0F2C59',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
});
