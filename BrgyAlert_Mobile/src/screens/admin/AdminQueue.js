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
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';
import TutorialOverlay from '../../components/TutorialOverlay';
import SkeletonLoader from '../../components/SkeletonLoader';
import GestureModal from '../../components/GestureModal';
import EmptyState from '../../components/EmptyState';

const INCIDENT_TYPES = [
  'Crime',
  'Fire',
  'Medical',
  'Flooding',
  'Accident',
  'Traffic',
  'Physical Abuse',
  'General',
];

const URGENCY_LEVELS = [
  { key: 'low', label: 'Low', color: '#10B981', bg: '#ECFDF5' },
  { key: 'medium', label: 'Medium', color: '#F59E0B', bg: '#FFF7ED' },
  { key: 'high', label: 'High', color: '#EF4444', bg: '#FEF2F2' },
  { key: 'critical', label: 'Critical', color: '#7F1D1D', bg: '#FEE2E2' },
];

const STATUS_OPTS = [
  { key: 'submitted', label: 'Pending' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'resolved', label: 'Resolved' },
];

export default function AdminQueue({ route, navigation }) {
  const { user, userProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();

  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | submitted | under_review | dispatched | resolved | declined
  const [showTutorial, setShowTutorial] = useState(false);

  // New filters and sort state
  const [categoryFilter, setCategoryFilter] = useState('all'); // all | INCIDENT_TYPES
  const [urgencyFilter, setUrgencyFilter] = useState('all'); // all | low | medium | high | critical
  const [sortOption, setSortOption] = useState('newest'); // newest | oldest | urgency_high | urgency_low
  const [showFiltersSection, setShowFiltersSection] = useState(false);

  // Manual entry modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formCategory, setFormCategory] = useState('General');
  const [formReporterName, setFormReporterName] = useState('');
  const [formPhoneNumber, setFormPhoneNumber] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formUrgency, setFormUrgency] = useState('medium');
  const [formStatus, setFormStatus] = useState('submitted');
  const [formAdminNotes, setFormAdminNotes] = useState('');
  const [formIncidentDate, setFormIncidentDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Apply deep-linked filter or search from dashboard/analytics
  useEffect(() => {
    if (route.params?.initialFilter) {
      setStatusFilter(route.params.initialFilter);
      navigation.setParams({ initialFilter: undefined });
    }
    if (route.params?.initialSearch) {
      setSearchQuery(route.params.initialSearch);
      navigation.setParams({ initialSearch: undefined });
    }
  }, [route.params?.initialFilter, route.params?.initialSearch]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const checkTutorial = async () => {
        try {
          const val = await AsyncStorage.getItem('hasSeenAdminQueueTutorial');
          if (val !== 'true') {
            setTimeout(() => {
              setShowTutorial(true);
            }, 600);
          } else {
            setShowTutorial(false);
          }
        } catch (err) {
          console.log('Error checking admin queue tutorial state:', err);
        }
      };
      checkTutorial();
    });
    return unsubscribe;
  }, [navigation]);

  const handleFinishTutorial = async () => {
    try {
      await AsyncStorage.setItem('hasSeenAdminQueueTutorial', 'true');
    } catch (err) {
      console.log('Error saving admin queue tutorial state:', err);
    }
    setShowTutorial(false);
  };

  const adminQueueTourSteps = [
    {
      title: 'Search Database logs',
      desc: 'Search all barangay incidents by code, description, witness, category, or address.',
      top: insets.top + Math.round(H * 0.06),
      arrow: 'top'
    },
    {
      title: 'Status Filters',
      desc: 'Isolate alerts by status to review pending, under review, dispatched, or resolved cases.',
      top: insets.top + Math.round(H * 0.12),
      arrow: 'top'
    },
    {
      title: 'Incident Records List',
      desc: 'View incident codes, times, locations, and status tags. Tap on any log card to triage and manage details.',
      top: Math.round(H * 0.32),
      arrow: 'top'
    }
  ];

  // Fetch alerts in real-time
  useEffect(() => {
    const q = query(
      collection(db, 'alerts'),
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
        console.log('Snapshot listener error on AdminQueue:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

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
  const getFilteredAndSortedAlerts = () => {
    let result = allAlerts.filter((alert) => {
      // 1. Filter by Status Chip
      if (statusFilter === 'all') {
        if (alert.status === 'declined') return false;
      } else if (statusFilter === 'resolved') {
        if (alert.status !== 'done' && alert.status !== 'resolved') return false;
      } else {
        if (alert.status !== statusFilter) return false;
      }

      // 2. Filter by Category
      if (categoryFilter !== 'all') {
        if (alert.category !== categoryFilter) return false;
      }

      // 3. Filter by Urgency
      if (urgencyFilter !== 'all') {
        if (alert.urgency !== urgencyFilter) return false;
      }

      // 4. Filter by Search Query
      if (searchQuery.trim().length > 0) {
        const queryLower = searchQuery.toLowerCase();
        const category = (alert.category || '').toLowerCase();
        const details = (alert.details || '').toLowerCase();
        const reporter = (alert.reporterName || '').toLowerCase();
        const address = (alert.location?.addressText || '').toLowerCase();
        const serial = alert.id ? `#inc-${alert.id.substring(0, 3).toLowerCase()}` : '';

        return (
          category.includes(queryLower) ||
          details.includes(queryLower) ||
          reporter.includes(queryLower) ||
          address.includes(queryLower) ||
          serial.includes(queryLower)
        );
      }

      return true;
    });

    // Urgency weight helper
    const getUrgencyWeight = (urgency) => {
      switch (urgency) {
        case 'critical': return 4;
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 0;
      }
    };

    // Sort result
    result.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);

      if (sortOption === 'newest') {
        return dateB - dateA;
      } else if (sortOption === 'oldest') {
        return dateA - dateB;
      } else if (sortOption === 'urgency_high') {
        const weightDiff = getUrgencyWeight(b.urgency) - getUrgencyWeight(a.urgency);
        if (weightDiff !== 0) return weightDiff;
        return dateB - dateA; // Fallback to newest
      } else if (sortOption === 'urgency_low') {
        const weightDiff = getUrgencyWeight(a.urgency) - getUrgencyWeight(b.urgency);
        if (weightDiff !== 0) return weightDiff;
        return dateB - dateA; // Fallback to newest
      }
      return 0;
    });

    return result;
  };

  const filteredAlerts = getFilteredAndSortedAlerts();

  // Render incident item card
  const renderItem = ({ item, index }) => {
    const badge = getStatusBadgeStyle(item.status);
    const catStyle = getCategoryStyle(item.category);
    const serialCode = item.id ? `#INC-${item.id.substring(0, 3).toUpperCase()}` : `#INC-00${index + 1}`;
    
    // Format Date & Time
    let dateText = '';
    if (item.createdAt) {
      try {
        const date = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        const datePart = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timePart = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        dateText = `${datePart} • ${timePart}`;
      } catch (e) {
        // Fallback
      }
    }

    // Format Location Segment
    const locationSegment = item.location?.addressText
      ? item.location.addressText.split(',')[0].trim()
      : 'Unknown Area';

    // Get urgency color dot helper
    const getUrgencyDotColor = (urgency) => {
      switch (urgency) {
        case 'critical': return '#7F1D1D';
        case 'high': return '#EF4444';
        case 'medium': return '#F59E0B';
        case 'low': return '#10B981';
        default: return '#9CA3AF';
      }
    };

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('IncidentDetail', { alertId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.iconWrapper, { backgroundColor: catStyle.bg }]}>
            <Feather name={catStyle.icon} size={20} color={catStyle.color} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <View style={[styles.urgencyDot, { backgroundColor: getUrgencyDotColor(item.urgency) }]} />
              <Text style={styles.serialText}>{serialCode}</Text>
              <Text style={styles.categoryText}>{item.category || 'General'}</Text>
            </View>
            <Text style={styles.locationTimeText}>
              {locationSegment} • {dateText}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
              {item.source === 'admin_manual' && (
                <View style={styles.manualEntryBadge}>
                  <Text style={styles.manualEntryBadgeText}>Manual Entry</Text>
                </View>
              )}
              {item.details ? (
                <Text style={styles.detailsPreview} numberOfLines={1}>
                  {item.details}
                </Text>
              ) : null}
            </View>
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
    if (statusFilter === 'submitted') {
      return 'No pending reports 🎉 — All clear!';
    }
    return 'No incidents found in this list.';
  };

  // Submit manual report entry
  const handleAddSubmit = async () => {
    if (!formCategory) {
      Alert.alert('Required Field', 'Please select an incident type.');
      return;
    }
    if (!formDetails.trim()) {
      Alert.alert('Required Field', 'Please provide description details.');
      return;
    }
    if (!formAddress.trim()) {
      Alert.alert('Required Field', 'Please enter a location/address.');
      return;
    }

    setAdding(true);
    try {
      const payload = {
        userId: 'walk_in',
        source: 'admin_manual',
        addedBy: user?.uid || 'unknown',
        reporterName: formReporterName.trim() || 'Offline Reporter',
        phoneNumber: formPhoneNumber.trim() || '',
        category: formCategory,
        details: formDetails.trim(),
        adminNotes: formAdminNotes.trim(),
        location: {
          latitude: null,
          longitude: null,
          addressText: formAddress.trim(),
        },
        urgency: formUrgency,
        status: formStatus,
        mediaUrls: [],
        assignedResponders: [],
        aiSummary: '',
        aiFlaggedFake: false,
        aiFakeReason: '',
        aiValidityConfidence: 'High',
        incidentAt: formIncidentDate || new Date(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'alerts'), payload);

      Alert.alert('Success', 'Incident record has been manually logged successfully.');
      
      // Reset form
      setFormCategory('General');
      setFormReporterName('');
      setFormPhoneNumber('');
      setFormDetails('');
      setFormAddress('');
      setFormUrgency('medium');
      setFormStatus('submitted');
      setFormAdminNotes('');
      setFormIncidentDate(new Date());
      setShowAddModal(false);
    } catch (err) {
      console.log('Error adding manual alert:', err);
      Alert.alert('Error', 'Failed to save incident record. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Incident Records</Text>
          <Text style={styles.headerSubtitle}>
            {loading ? 'Loading incidents...' : `${filteredAlerts.length} report${filteredAlerts.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={20} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.addButtonText}>Add Record</Text>
        </TouchableOpacity>
      </View>

      {/* Search & Actions Bar */}
      <View style={[styles.searchContainer, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={[styles.searchBar, { flex: 1 }]}>
          <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search category, location..."
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
        
        {/* Toggle Filter Panel */}
        <TouchableOpacity 
          style={[styles.actionIconButton, showFiltersSection && styles.actionIconButtonActive]}
          onPress={() => setShowFiltersSection(!showFiltersSection)}
          activeOpacity={0.7}
        >
          <Feather name="filter" size={18} color={showFiltersSection ? '#0F2C59' : '#4B5563'} />
        </TouchableOpacity>

        {/* Toggle Sort Options */}
        <TouchableOpacity 
          style={styles.actionIconButton}
          onPress={() => {
            Alert.alert(
              'Sort Incident Records',
              'Choose how you want to sort the list:',
              [
                { text: 'Newest First', onPress: () => setSortOption('newest') },
                { text: 'Oldest First', onPress: () => setSortOption('oldest') },
                { text: 'Highest Urgency', onPress: () => setSortOption('urgency_high') },
                { text: 'Lowest Urgency', onPress: () => setSortOption('urgency_low') },
                { text: 'Cancel', style: 'cancel' }
              ]
            );
          }}
          activeOpacity={0.7}
        >
          <Feather name="bar-chart-2" size={18} color="#4B5563" style={{ transform: [{ rotate: '90deg' }] }} />
        </TouchableOpacity>
      </View>

      {/* Advanced Filters Panel (Collapsible) */}
      {showFiltersSection && (
        <View style={styles.advancedFiltersPanel}>
          {/* Category Filters */}
          <Text style={styles.advancedFilterLabel}>Category Filter</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.advancedFilterScroll}>
            <TouchableOpacity 
              style={[styles.smallChip, categoryFilter === 'all' && styles.smallChipActive]} 
              onPress={() => setCategoryFilter('all')}
            >
              <Text style={[styles.smallChipText, categoryFilter === 'all' && styles.smallChipTextActive]}>All Categories</Text>
            </TouchableOpacity>
            {INCIDENT_TYPES.map((cat) => (
              <TouchableOpacity 
                key={cat} 
                style={[styles.smallChip, categoryFilter === cat && styles.smallChipActive]} 
                onPress={() => setCategoryFilter(cat)}
              >
                <Text style={[styles.smallChipText, categoryFilter === cat && styles.smallChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Urgency Filters */}
          <Text style={[styles.advancedFilterLabel, { marginTop: 10 }]}>Urgency Filter</Text>
          <View style={styles.advancedFilterUrgencyRow}>
            <TouchableOpacity 
              style={[styles.smallChip, urgencyFilter === 'all' && styles.smallChipActive]} 
              onPress={() => setUrgencyFilter('all')}
            >
              <Text style={[styles.smallChipText, urgencyFilter === 'all' && styles.smallChipTextActive]}>All Urgencies</Text>
            </TouchableOpacity>
            {['low', 'medium', 'high', 'critical'].map((urg) => (
              <TouchableOpacity 
                key={urg} 
                style={[styles.smallChip, urgencyFilter === urg && styles.smallChipActive]} 
                onPress={() => setUrgencyFilter(urg)}
              >
                <Text style={[styles.smallChipText, urgencyFilter === urg && styles.smallChipTextActive, { textTransform: 'capitalize' }]}>{urg}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Active Sort Label Indicator */}
      {sortOption !== 'newest' && (
        <View style={styles.sortIndicatorContainer}>
          <Text style={styles.sortIndicatorText}>
            Sorted by:{' '}
            <Text style={{ fontWeight: '700' }}>
              {sortOption === 'oldest' && 'Oldest First'}
              {sortOption === 'urgency_high' && 'Highest Urgency'}
              {sortOption === 'urgency_low' && 'Lowest Urgency'}
            </Text>
          </Text>
          <TouchableOpacity onPress={() => setSortOption('newest')}>
            <Feather name="x" size={14} color="#6B7280" />
          </TouchableOpacity>
        </View>
      )}

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
        <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
          <SkeletonLoader type="card" count={3} />
        </View>
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          icon={searchQuery.trim().length > 0 ? 'search' : 'check-square'}
          title={searchQuery.trim().length > 0 ? 'No Matches Found' : 'Queue is Clear'}
          subtitle={getEmptyStateText()}
          actionLabel={searchQuery.trim().length > 0 || selectedCategory || selectedUrgency || selectedStatus !== 'all' ? 'Reset Filters' : undefined}
          onActionPress={() => {
            setSearchQuery('');
            setSelectedCategory(null);
            setSelectedUrgency(null);
            setSelectedStatus('all');
          }}
          accentColor="#0B2564"
        />
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

      {/* MANUAL ENTRY BOTTOM SHEET MODAL */}
      <GestureModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        contentStyle={styles.addModalSheet}
        keyboardAvoiding
      >
        <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.modalTitle}>Manual Incident Record</Text>
          <Text style={styles.modalSubtitle}>Add offline walk-ins, phone calls, or texts to records database.</Text>

          {/* Incident Type Chips */}
          <Text style={styles.fieldLabel}>Incident Type / Category *</Text>
          <View style={styles.categoryChipsRow}>
            {INCIDENT_TYPES.map((cat) => {
              const active = formCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setFormCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Reporter Name */}
          <Text style={styles.fieldLabel}>Reporter Name</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. Juan dela Cruz (Walk-in)"
            placeholderTextColor="#9CA3AF"
            value={formReporterName}
            onChangeText={setFormReporterName}
          />

          {/* Phone Number */}
          <Text style={styles.fieldLabel}>Contact Number</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. 09171234567"
            placeholderTextColor="#9CA3AF"
            value={formPhoneNumber}
            onChangeText={setFormPhoneNumber}
            keyboardType="phone-pad"
          />

          {/* Incident Description */}
          <Text style={styles.fieldLabel}>Incident Details / Description *</Text>
          <TextInput
            style={[styles.formInput, styles.multilineInput]}
            placeholder="Describe the incident (what happened, witness statements, etc.)"
            placeholderTextColor="#9CA3AF"
            value={formDetails}
            onChangeText={setFormDetails}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* Location / Address */}
          <Text style={styles.fieldLabel}>Incident Location Address *</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. Zone 4, Corner Lepa St."
            placeholderTextColor="#9CA3AF"
            value={formAddress}
            onChangeText={setFormAddress}
          />

          {/* Urgency Level */}
          <Text style={styles.fieldLabel}>Urgency Level *</Text>
          <View style={styles.urgencyRow}>
            {URGENCY_LEVELS.map((level) => {
              const active = formUrgency === level.key;
              return (
                <TouchableOpacity
                  key={level.key}
                  style={[
                    styles.urgencyChip,
                    active && { backgroundColor: level.bg, borderColor: level.color, borderWidth: 1.5 },
                  ]}
                  onPress={() => setFormUrgency(level.key)}
                >
                  <Text style={[styles.urgencyChipText, { color: level.color, fontWeight: active ? '700' : '500' }]}>
                    {level.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Date & Time Reported */}
          <Text style={styles.fieldLabel}>Incident Date & Time *</Text>
          <TouchableOpacity
            style={styles.datePickerTrigger}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Feather name="calendar" size={16} color="#0F2C59" style={{ marginRight: 8 }} />
            <Text style={styles.datePickerTriggerText}>
              {formIncidentDate.toLocaleString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <RNDateTimePicker
              value={formIncidentDate}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  setFormIncidentDate(selectedDate);
                  // Automatically trigger time picker after selecting date
                  setTimeout(() => setShowTimePicker(true), 200);
                }
              }}
            />
          )}

          {showTimePicker && (
            <RNDateTimePicker
              value={formIncidentDate}
              mode="time"
              display="default"
              onChange={(event, selectedTime) => {
                setShowTimePicker(false);
                if (selectedTime) {
                  const combinedDate = new Date(formIncidentDate);
                  combinedDate.setHours(selectedTime.getHours());
                  combinedDate.setMinutes(selectedTime.getMinutes());
                  setFormIncidentDate(combinedDate);
                }
              }}
            />
          )}

          {/* Initial Status */}
          <Text style={styles.fieldLabel}>Initial Status *</Text>
          <View style={styles.statusChipsRow}>
            {STATUS_OPTS.map((opt) => {
              const active = formStatus === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.statusChip, active && styles.statusChipActive]}
                  onPress={() => setFormStatus(opt.key)}
                >
                  <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Admin Notes */}
          <Text style={styles.fieldLabel}>Internal Admin Notes (Only visible to admins)</Text>
          <TextInput
            style={[styles.formInput, styles.multilineInput]}
            placeholder="Add internal notes, responder dispatches, follow-up instructions..."
            placeholderTextColor="#9CA3AF"
            value={formAdminNotes}
            onChangeText={setFormAdminNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Buttons */}
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowAddModal(false)}
              disabled={adding}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleAddSubmit}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalSaveBtnText}>Save Record</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </GestureModal>

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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 16,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F2C59',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  actionIconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionIconButtonActive: {
    backgroundColor: '#E8F0FE',
  },
  advancedFiltersPanel: {
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  advancedFilterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  advancedFilterScroll: {
    paddingVertical: 4,
  },
  advancedFilterUrgencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  smallChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  smallChipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#0F2C59',
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  smallChipTextActive: {
    color: '#0F2C59',
  },
  sortIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 24,
    marginBottom: 12,
  },
  sortIndicatorText: {
    fontSize: 12,
    color: '#4B5563',
  },
  urgencyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  manualEntryBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
  },
  manualEntryBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369A1',
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
  // Modal Styles
  addModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: '90%',
  },
  modalScroll: {
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 20,
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    fontSize: 14,
    color: '#1F2937',
  },
  multilineInput: {
    minHeight: 80,
  },
  categoryChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#0F2C59',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  categoryChipTextActive: {
    color: '#0F2C59',
  },
  urgencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  urgencyChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  urgencyChipText: {
    fontSize: 12,
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  statusChipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#0F2C59',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  statusChipTextActive: {
    color: '#0F2C59',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
  },
  modalCancelBtn: {
    flex: 1,
    marginRight: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },
  modalSaveBtn: {
    flex: 1.5,
    backgroundColor: '#0F2C59',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
  modalSaveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  datePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  datePickerTriggerText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
});
