import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, onSnapshot, doc, writeBatch, getDocs, where } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { db } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';
import SkeletonLoader from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import BottomGradient from '../../components/BottomGradient';

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

export default function AdminMessages({ navigation }) {
  const insets = useSafeAreaInsets();

  // Smooth entrance animations
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    });
    return unsubscribe;
  }, [navigation]);

  const [loading, setLoading] = useState(true);
  const [chatThreads, setChatThreads] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [readFilter, setReadFilter] = useState('all'); // all | unread | read
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 800);
  };

  // Dynamic user profiles lookup
  const [userProfiles, setUserProfiles] = useState({});
  const listenersRef = useRef({});
  const searchInputRef = useRef(null);

  useEffect(() => {
    const newUids = chatThreads
      .map((t) => t.userId)
      .filter((uid) => uid && uid !== 'anonymous' && !uid.startsWith('+') && !listenersRef.current[uid]);

    if (newUids.length > 0) {
      newUids.forEach((uid) => {
        const unsub = onSnapshot(doc(db, 'users', uid), (userSnap) => {
          if (userSnap.exists()) {
            setUserProfiles((prev) => ({
              ...prev,
              [uid]: userSnap.data()
            }));
          }
        }, (err) => {
          console.log(`Error listening to user profile ${uid}:`, err);
        });
        listenersRef.current[uid] = unsub;
      });
    }
  }, [chatThreads]);

  useEffect(() => {
    return () => {
      Object.values(listenersRef.current).forEach((unsub) => unsub());
    };
  }, []);

  // Filter threads by search query and read/unread status
  const filteredThreads = chatThreads.filter((thread) => {
    const profile = userProfiles[thread.userId];
    const resolvedReporterName = profile?.fullName || thread.reporterName || '';

    const matchesSearch =
      resolvedReporterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (thread.lastMessageText || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (thread.phoneNumber || '').includes(searchQuery) ||
      thread.alerts.some(a => a.category.toLowerCase().includes(searchQuery.toLowerCase()));

    const unreadCount = thread.unreadCountAdmin || 0;
    const matchesFilter =
      readFilter === 'all' ||
      (readFilter === 'unread' && unreadCount > 0) ||
      (readFilter === 'read' && unreadCount === 0);

    return matchesSearch && matchesFilter;
  });

  // Fetch all alerts to aggregate and group by reporter (userId)
  useEffect(() => {
    const q = query(
      collection(db, 'alerts'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const userGroups = {};

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.status === 'declined' || data.source === 'admin_manual' || data.userId === 'walk_in') {
            return;
          }
          const alertId = doc.id;
          
          let groupKey = data.userId;
          let reporterName = data.reporterName || data.witnessName || 'Anonymous Citizen';

          if (!groupKey || groupKey === 'anonymous') {
            if (data.phoneNumber) {
              groupKey = data.phoneNumber;
              reporterName = `SMS: ${data.phoneNumber}`;
            } else {
              groupKey = alertId;
              reporterName = `Anonymous (${alertId.substring(0, 5).toUpperCase()})`;
            }
          }

          if (!userGroups[groupKey]) {
            userGroups[groupKey] = {
              userId: groupKey,
              reporterName,
              phoneNumber: data.phoneNumber || '',
              alerts: [],
              lastMessageText: '',
              lastMessageAt: null,
              unreadCountAdmin: 0,
            };
          }

          // Gather alert details
          userGroups[groupKey].alerts.push({
            id: alertId,
            category: data.category || 'General',
            status: data.status || 'submitted',
            createdAt: data.createdAt,
            details: data.details || '',
            unreadCountAdmin: data.unreadCountAdmin || 0,
          });

          // Aggregate unreadCountAdmin across this user's alerts
          userGroups[groupKey].unreadCountAdmin += (data.unreadCountAdmin || 0);

          // Track the latest message across this user's alerts
          const alertLastMsgAt = data.lastMessageAt ? (data.lastMessageAt.toDate ? data.lastMessageAt.toDate() : new Date(data.lastMessageAt)) : null;
          const currentGroupLastMsgAt = userGroups[groupKey].lastMessageAt ? new Date(userGroups[groupKey].lastMessageAt) : null;

          if (alertLastMsgAt && (!currentGroupLastMsgAt || alertLastMsgAt > currentGroupLastMsgAt)) {
            userGroups[groupKey].lastMessageText = data.lastMessageText || '';
            userGroups[groupKey].lastMessageAt = alertLastMsgAt;
          }
        });

        // Convert grouped object to array and sort by latest activity
        const threadsArray = Object.values(userGroups).sort((a, b) => {
          const timeA = a.lastMessageAt || (a.alerts[0] && a.alerts[0].createdAt ? (a.alerts[0].createdAt.toDate ? a.alerts[0].createdAt.toDate() : new Date(a.alerts[0].createdAt)) : new Date(0));
          const timeB = b.lastMessageAt || (b.alerts[0] && b.alerts[0].createdAt ? (b.alerts[0].createdAt.toDate ? b.alerts[0].createdAt.toDate() : new Date(b.alerts[0].createdAt)) : new Date(0));
          return timeB - timeA;
        });

        setChatThreads(threadsArray);
        setLoading(false);
      },
      (error) => {
        console.log('Snapshot listener error on AdminMessages:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Get status dot color
  const getStatusDotColor = (status) => {
    switch (status) {
      case 'submitted': return '#D97706'; // Pending (Amber)
      case 'under_review': return '#2563EB'; // Under Review (Blue)
      case 'dispatched': return '#10B981'; // Dispatched (Green)
      case 'resolved':
      case 'done':
        return '#9CA3AF'; // Resolved (Grey)
      default: return '#9CA3AF';
    }
  };

  const totalUnreadCount = chatThreads.reduce((sum, t) => sum + (t.unreadCountAdmin || 0), 0);

  const handleMarkAllRead = async () => {
    Alert.alert(
      'Mark All as Read',
      'Are you sure you want to mark all messages as read?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Read',
          style: 'default',
          onPress: async () => {
            try {
              const batch = writeBatch(db);
              const unreadAlertsQuery = query(
                collection(db, 'alerts'),
                where('unreadCountAdmin', '>', 0)
              );
              const snapshot = await getDocs(unreadAlertsQuery);
              if (snapshot.empty) return;

              snapshot.forEach((alertDoc) => {
                batch.update(doc(db, 'alerts', alertDoc.id), {
                  unreadCountAdmin: 0
                });
              });

              await batch.commit();
            } catch (err) {
              console.log('Error marking all as read:', err);
            }
          }
        }
      ]
    );
  };

  // Render chat thread row
  const renderItem = ({ item }) => {
    const userProfile = userProfiles[item.userId];
    const resolvedReporterName = userProfile?.fullName || item.reporterName;

    // Format Time of Last Activity
    const lastActive = item.lastMessageAt || (item.alerts[0] && item.alerts[0].createdAt ? (item.alerts[0].createdAt.toDate ? item.alerts[0].createdAt.toDate() : new Date(item.alerts[0].createdAt)) : null);
    const timeText = getRelativeTime(lastActive);

    // Reports Categories Summary (e.g. "Reports: Fire, Crime")
    const reportCategories = item.alerts.map(a => a.category).filter((val, id, self) => self.indexOf(val) === id).join(', ');
    const displayCategories = reportCategories.length > 30
      ? reportCategories.substring(0, 27) + '...'
      : reportCategories;

    const lastMessageSnippet = item.lastMessageText || (item.alerts[0] ? item.alerts[0].details : 'No messages yet');
    const displayMessage = lastMessageSnippet.length > 50
      ? lastMessageSnippet.substring(0, 47) + '...'
      : lastMessageSnippet;

    const unreadCount = item.unreadCountAdmin || 0;

    const initials = resolvedReporterName
      ? resolvedReporterName.split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase()
      : 'C';

    return (
      <TouchableOpacity
        style={[styles.card, unreadCount > 0 && styles.cardUnreadAccent]}
        onPress={() =>
          navigation.navigate('ChatScreen', {
            userId: item.userId,
            userName: resolvedReporterName,
            alertId: item.alerts[0]?.id,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <View style={styles.avatarWrapper}>
            <Text style={styles.avatarText}>
              {initials}
            </Text>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.reporterNameText}>{resolvedReporterName}</Text>
              
              {/* Dynamic Status Mini Dots Stack */}
              <View style={styles.statusDotRow}>
                {item.alerts.map((alertItem) => (
                  <View 
                    key={alertItem.id} 
                    style={[styles.statusDot, { backgroundColor: getStatusDotColor(alertItem.status) }]} 
                    title={alertItem.category}
                  />
                ))}
              </View>
            </View>
            <Text style={styles.categoriesText}>
              Types: {displayCategories || 'General'}
            </Text>
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
    <View style={styles.container}>
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

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTitleContainer}>
          <View style={styles.headerMainRow}>
            <Text style={styles.headerTitle}>Incident Chats</Text>
            {!loading && totalUnreadCount > 0 && (
              <TouchableOpacity style={styles.markReadBtn} onPress={handleMarkAllRead} activeOpacity={0.8}>
                <Feather name="check-square" size={14} color="#0B2564" style={{ marginRight: 4 }} />
                <Text style={styles.markReadBtnText}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerSubtitle}>
            {loading ? 'Loading...' : `Conversations with ${chatThreads.length} active reporter${chatThreads.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
      </View>

      {/* Search and Filter Panel */}
      {!loading && chatThreads.length > 0 && (
        <View style={styles.searchFilterContainer}>
          {/* Search Bar */}
          <TouchableOpacity 
            style={[styles.searchBar, searchFocused && styles.searchBarFocused]}
            activeOpacity={1}
            onPress={() => searchInputRef.current?.focus()}
          >
            <Feather 
              name="search" 
              size={18} 
              color={searchFocused ? '#0B2564' : '#9CA3AF'} 
              style={styles.searchIcon} 
            />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search conversations..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <Feather name="x" size={16} color="#6B7280" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>

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
      ) : chatThreads.length === 0 ? (
        <EmptyState
          icon="message-square"
          title="No Active Chats"
          subtitle="Citizens will appear here once they report incidents or launch direct chat support."
          accentColor="#0B2564"
        />
      ) : filteredThreads.length === 0 ? (
        <EmptyState
          icon="search"
          title="No Matches Found"
          subtitle="No conversations match your search or filter."
          actionLabel="Clear Search"
          onActionPress={() => {
            setSearchQuery('');
            setReadFilter('all');
          }}
          accentColor="#0B2564"
        />
      ) : (
        <FlatList
          data={filteredThreads}
          keyExtractor={(item) => item.userId}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}
      </Animated.View>

      {/* Bottom Smooth Gradient Background Fade */}
      <BottomGradient />

      {/* Floating Bottom Tab Nav Bar */}
      <AdminBottomTabNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  headerTitleContainer: {
    width: '100%',
  },
  headerMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
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
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  markReadBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0B2564',
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
    borderLeftColor: '#0B2564',
    paddingLeft: 12, // offset for border width
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B2564',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
    marginBottom: 2,
  },
  reporterNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    flexShrink: 1,
    marginRight: 8,
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
  categoriesText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    marginBottom: 2,
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
    backgroundColor: '#0B2564',
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
    color: '#0B2564',
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

  searchFilterContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  searchBarFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(11, 37, 100, 0.8)',
    shadowColor: '#0B2564',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  clearButton: {
    padding: 4,
    marginRight: -4,
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
    backgroundColor: '#0B2564',
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
