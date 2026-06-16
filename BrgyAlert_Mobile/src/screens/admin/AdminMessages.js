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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { db } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';

export default function AdminMessages({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [chatThreads, setChatThreads] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [readFilter, setReadFilter] = useState('all'); // all | unread | read

  // Dynamic user profiles lookup
  const [userProfiles, setUserProfiles] = useState({});
  const listenersRef = useRef({});

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
          console.error(`Error listening to user profile ${uid}:`, err);
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
          if (data.status === 'declined') {
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
        console.error('Snapshot listener error on AdminMessages:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Render chat thread row
  const renderItem = ({ item }) => {
    const userProfile = userProfiles[item.userId];
    const resolvedReporterName = userProfile?.fullName || item.reporterName;

    // Format Time of Last Activity
    let timeText = '';
    const lastActive = item.lastMessageAt || (item.alerts[0] && item.alerts[0].createdAt ? (item.alerts[0].createdAt.toDate ? item.alerts[0].createdAt.toDate() : new Date(item.alerts[0].createdAt)) : null);
    if (lastActive) {
      try {
        timeText = new Date(lastActive).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      } catch (e) {
        // Fallback
      }
    }

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
        style={styles.card}
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
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {item.alerts.length} report{item.alerts.length !== 1 ? 's' : ''}
                </Text>
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Incident Chats</Text>
        <Text style={styles.headerSubtitle}>
          {loading ? 'Loading...' : `Conversations with ${chatThreads.length} active reporter${chatThreads.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Search and Filter Panel */}
      {!loading && chatThreads.length > 0 && (
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
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0B2564" />
          <Text style={styles.loadingText}>Syncing conversations...</Text>
        </View>
      ) : chatThreads.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconWrapper}>
            <Feather name="message-square" size={40} color="#9CA3AF" />
          </View>
          <Text style={styles.emptyText}>
            No chat threads available. Citizens will appear here once they report incidents or launch direct chat support.
          </Text>
        </View>
      ) : filteredThreads.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconWrapper}>
            <Feather name="search" size={40} color="#9CA3AF" />
          </View>
          <Text style={styles.emptyText}>
            No conversations match your search or filter.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredThreads}
          keyExtractor={(item) => item.userId}
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
      <AdminBottomTabNav />
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
    marginBottom: 2,
  },
  reporterNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  badge: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4B5563',
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
