import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  FlatList,
  TextInput,
  ScrollView,
  ActivityIndicator,
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

export default function CitizenReports({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();

  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | submitted | under_review | dispatched | resolved | declined
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const checkTutorial = async () => {
        try {
          const val = await AsyncStorage.getItem('hasSeenReportsTutorial');
          if (val !== 'true') {
            setTimeout(() => {
              setShowTutorial(true);
            }, 600);
          } else {
            setShowTutorial(false);
          }
        } catch (err) {
          console.log('Error checking reports tutorial state:', err);
        }
      };
      checkTutorial();
    });
    return unsubscribe;
  }, [navigation]);

  const handleFinishTutorial = async () => {
    try {
      await AsyncStorage.setItem('hasSeenReportsTutorial', 'true');
    } catch (err) {
      console.log('Error saving reports tutorial state:', err);
    }
    setShowTutorial(false);
  };

  const reportsTourSteps = [
    {
      title: 'Search Incidents',
      desc: 'Search your reports list instantly by category, description text, or reporter name.',
      top: insets.top + Math.round(H * 0.06),
      arrow: 'top'
    },
    {
      title: 'Filter Status Tabs',
      desc: 'Filter your list by specific incident statuses (All, Pending, Under Review, Dispatched, Resolved, Declined).',
      top: insets.top + Math.round(H * 0.12),
      arrow: 'top'
    },
    {
      title: 'Incident Record Cards',
      desc: 'Tap on any report card to track its live timeline progress and message responders.',
      top: Math.round(H * 0.32),
      arrow: 'top'
    }
  ];

  // Fetch only this citizen's incident reports in real-time
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
        setAllAlerts(list);
        setLoading(false);
      },
      (error) => {
        console.log('Snapshot listener error on CitizenReports:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Filter chips configuration
  const statusFilters = [
    { key: 'all', label: 'All' },
    { key: 'submitted', label: 'Pending' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'dispatched', label: 'Dispatched' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'declined', label: 'Declined' },
  ];

  // Helper for Status Badge colors and text
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

  // Helper for category-based icons and colors
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

  // Filter and search computation
  const filteredAlerts = allAlerts.filter((alert) => {
    // 1. Filter by Status Chip
    if (statusFilter === 'all') {
      if (alert.status === 'declined') return false;
    } else if (statusFilter === 'resolved') {
      if (alert.status !== 'done' && alert.status !== 'resolved') return false;
    } else {
      if (alert.status !== statusFilter) return false;
    }

    // 2. Filter by Search Query
    if (searchQuery.trim().length > 0) {
      const queryLower = searchQuery.toLowerCase();
      const category = (alert.category || '').toLowerCase();
      const details = (alert.details || '').toLowerCase();
      const address = (alert.location?.addressText || '').toLowerCase();
      const serial = alert.id ? `#inc-${alert.id.substring(0, 3).toLowerCase()}` : '';

      return (
        category.includes(queryLower) ||
        details.includes(queryLower) ||
        address.includes(queryLower) ||
        serial.includes(queryLower)
      );
    }

    return true;
  });

  // Render incident item card
  const renderItem = ({ item, index }) => {
    const badge = getStatusBadgeStyle(item.status);
    const catStyle = getCategoryStyle(item.category);
    const serialCode = item.id ? `#INC-${item.id.substring(0, 3).toUpperCase()}` : `#INC-00${index + 1}`;

    // Format Time
    let timeText = '00:00';
    if (item.createdAt) {
      try {
        const date = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        timeText = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      } catch (e) {
        // Fallback
      }
    }

    // Format Location Segment
    const locationSegment = item.location?.addressText
      ? item.location.addressText.split(',')[0].trim()
      : 'Unknown Area';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('StatusTracker', { alertId: item.id })}
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
            </View>
            <Text style={styles.locationTimeText}>
              {locationSegment} • {timeText}
            </Text>
            {item.details ? (
              <Text style={styles.detailsPreview} numberOfLines={1}>
                {item.details}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.statusTag, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusTagText, { color: badge.text }]}>
              {badge.label}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color="#9CA3AF" style={styles.chevron} />
        </View>
      </TouchableOpacity>
    );
  };

  const getEmptyStateText = () => {
    if (searchQuery.trim().length > 0) {
      return `No matches found for "${searchQuery}"`;
    }
    if (statusFilter === 'all') {
      return "You haven't filed any reports yet.";
    }
    return `No ${statusFilter.replace('_', ' ')} reports found.`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>My Reports</Text>
            <Text style={styles.headerSubtitle}>
              {loading ? 'Syncing...' : `${filteredAlerts.length} total`}
            </Text>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search reports..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Feather name="x" size={16} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {statusFilters.map((filter) => {
            const isSelected = statusFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.chip,
                  isSelected && styles.chipActive,
                ]}
                onPress={() => setStatusFilter(filter.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* List / Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0F2C59" />
          <Text style={styles.loadingText}>Loading reports...</Text>
        </View>
      ) : filteredAlerts.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconWrapper}>
            <Feather
              name={searchQuery.trim().length > 0 ? 'search' : 'folder'}
              size={40}
              color="#9CA3AF"
            />
          </View>
          <Text style={styles.emptyText}>{getEmptyStateText()}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAlerts}
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

      {/* Tutorial Overlay App Tour */}
      {showTutorial && (
        <TutorialOverlay
          steps={reportsTourSteps}
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
    marginBottom: 16,
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
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginRight: 16,
  },
  headerTitles: {
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  searchContainer: {
    paddingHorizontal: 24,
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
  },
  filterContainer: {
    marginBottom: 16,
  },
  filterScroll: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#0F2C59',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextActive: {
    color: '#0F2C59',
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 155, // space for bottom nav gradient
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
    marginBottom: 2,
  },
  serialText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    marginRight: 6,
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  locationTimeText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  detailsPreview: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  statusTag: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginRight: 4,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chevron: {
    marginLeft: 4,
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
    fontSize: 16,
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
