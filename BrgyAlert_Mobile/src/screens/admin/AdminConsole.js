import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  StatusBar, 
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';

// Barangay Lepa center coordinates
const BRGY_CENTER = { latitude: 14.6000, longitude: 120.9800 };

export default function AdminConsole({ navigation }) {
  const { userProfile } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapMode, setMapMode] = useState('Satellite'); // Satellite | Terrain

  // Dynamic Metrics States
  const [totalReports, setTotalReports] = useState(0);
  const [pendingReview, setPendingReview] = useState(0);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [resolvedToday, setResolvedToday] = useState(0);

  // Fetch all alerts in real-time
  useEffect(() => {
    const q = query(
      collection(db, 'alerts'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      let total = 0;
      let pending = 0;
      let active = 0;
      let resolved = 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      snapshot.forEach((doc) => {
        total++;
        const data = doc.data();
        const alertItem = {
          id: doc.id,
          ...data
        };
        list.push(alertItem);

        // Compute metrics
        if (data.status === 'submitted') {
          pending++;
        }
        if (data.status === 'dispatched') {
          active++;
        }
        
        // Calculate resolved count
        if (data.status === 'done' || data.status === 'resolved') {
          let resolveDate = null;
          if (data.updatedAt) {
            resolveDate = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
          }
          if (resolveDate && resolveDate >= today) {
            resolved++;
          }
        }
      });

      setAllAlerts(list);
      setTotalReports(total);
      setPendingReview(pending);
      setActiveIncidents(active);
      setResolvedToday(resolved);
      setLoading(false);
    }, (error) => {
      console.error('Snapshot listener error on AdminConsole:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getGreeting = () => {
    const hours = new Date().getHours();
    const displayName = userProfile?.fullName ? userProfile.fullName.split(' ')[0] : 'Admin';
    if (hours < 12) return `Good morning, ${displayName}`;
    if (hours < 18) return `Good afternoon, ${displayName}`;
    return `Good evening, ${displayName}`;
  };

  const getFormattedDate = () => {
    return new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  // Initials for avatar
  const getInitials = () => {
    if (!userProfile?.fullName) return 'AJ';
    const parts = userProfile.fullName.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  // Color-codes marker pins by alert category
  const getPinColor = (category) => {
    if (category === 'Fire' || category === 'Medical') return '#EF4444';      // Red — critical
    if (category === 'Flooding' || category === 'Accident' || category === 'Traffic') return '#D97706'; // Amber
    return '#2563EB'; // Blue — general
  };

  // Status Badge configurations — covers every Firestore status value
  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'submitted':
        return { bg: '#FFF9E6', text: '#D97706', label: 'PENDING' };       // amber
      case 'under_review':
        return { bg: '#EFF6FF', text: '#2563EB', label: 'UNDER REVIEW' };  // blue
      case 'dispatched':
        return { bg: '#ECFDF5', text: '#10B981', label: 'DISPATCHED' };    // green
      case 'done':
      case 'resolved':
        return { bg: '#F3F4F6', text: '#4B5563', label: 'RESOLVED' };      // grey
      case 'declined':
        return { bg: '#FEF2F2', text: '#EF4444', label: 'DECLINED' };      // red
      default:
        return { bg: '#FFF9E6', text: '#D97706', label: 'PENDING' };
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Top Header (Styled like Citizen Dashboard) */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>{getGreeting()}</Text>
            <Text style={styles.dateText}>{getFormattedDate()}</Text>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
              <Text style={styles.statusLabel}>Command Console Active</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => alert('Notifications screen')}
          >
            <Feather name="bell" size={22} color="#1F2937" />
            {pendingReview > 0 && <View style={styles.badgeDot} />}
          </TouchableOpacity>
        </View>

        {/* 2x2 Metrics Grid */}
        <View style={styles.metricsGrid}>
          
          {/* Card 1: Total Reports */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricTitle}>Total Reports</Text>
              <View style={[styles.metricIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                <Feather name="file-text" size={16} color="#2563EB" />
              </View>
            </View>
            <Text style={styles.metricValue}>{totalReports}</Text>
          </View>

          {/* Card 2: Pending Review */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricTitle}>Pending Review</Text>
              <View style={[styles.metricIconWrapper, { backgroundColor: '#FFF7ED' }]}>
                <Feather name="eye" size={16} color="#EA580C" />
              </View>
            </View>
            <Text style={styles.metricValue}>{pendingReview}</Text>
            {pendingReview > 0 && (
              <View style={styles.actionRequiredBadge}>
                <Text style={styles.actionRequiredText}>ACTION REQUIRED</Text>
              </View>
            )}
          </View>

          {/* Card 3: Active Incidents */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricTitle}>Active Incidents</Text>
              <View style={[styles.metricIconWrapper, { backgroundColor: '#FEF2F2' }]}>
                <Feather name="alert-triangle" size={16} color="#EF4444" />
              </View>
            </View>
            <Text style={styles.metricValue}>{activeIncidents}</Text>
          </View>

          {/* Card 4: Resolved Today */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Text style={styles.metricTitle}>Resolved Today</Text>
              <View style={[styles.metricIconWrapper, { backgroundColor: '#ECFDF5' }]}>
                <Feather name="check-circle" size={16} color="#10B981" />
              </View>
            </View>
            <Text style={styles.metricValue}>{resolvedToday}</Text>
            {resolvedToday > 0 && <Text style={styles.trendText}>+15% from avg</Text>}
          </View>

        </View>

        {/* Live Incident Map Card */}
        <View style={styles.mapCard}>
          <View style={styles.mapHeaderRow}>
            <View style={styles.mapTitleWrapper}>
              <Feather name="map" size={18} color="#0B2564" style={{ marginRight: 8 }} />
              <Text style={styles.mapTitle}>Live Incident Map</Text>
            </View>
            <View style={styles.mapToggles}>
              {['Standard', 'Satellite', 'Terrain'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.toggleBtn, mapMode === mode && styles.toggleBtnActive]}
                  onPress={() => setMapMode(mode)}
                >
                  <Text style={[styles.toggleBtnText, mapMode === mode && styles.toggleBtnTextActive]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Real Google Maps Tile ─────────────────────────────────── */}
          <View style={styles.realMapCanvas}>
            <MapView
              style={styles.mapView}
              provider={PROVIDER_GOOGLE}
              mapType={
                mapMode === 'Satellite' ? 'satellite'
                : mapMode === 'Terrain'  ? 'terrain'
                : 'standard'
              }
              initialRegion={{
                latitude: BRGY_CENTER.latitude,
                longitude: BRGY_CENTER.longitude,
                latitudeDelta: 0.025,
                longitudeDelta: 0.025,
              }}
            >
              {allAlerts
                .filter(a => a.status !== 'done' && a.status !== 'resolved' && a.status !== 'declined')
                .map((alert) => (
                  <Marker
                    key={alert.id}
                    coordinate={{
                      latitude:  alert.location?.latitude  ?? BRGY_CENTER.latitude,
                      longitude: alert.location?.longitude ?? BRGY_CENTER.longitude,
                    }}
                    pinColor={getPinColor(alert.category)}
                    title={alert.category || 'Incident'}
                    description={alert.location?.addressText || 'Tap for details'}
                    onCalloutPress={() => navigation.navigate('IncidentDetail', { alertId: alert.id })}
                  />
                ))
              }
            </MapView>

            {/* Map Legend Overlay */}
            <View style={styles.legendOverlay} pointerEvents="none">
              <Text style={styles.legendTitle}>MAP LEGEND</Text>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.legendText}>Fire / Medical</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#D97706' }]} />
                <Text style={styles.legendText}>Traffic / Flooding</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                <Text style={styles.legendText}>General</Text>
              </View>
            </View>
          </View>

          {/* Expand to Full-Screen Map */}
          <TouchableOpacity
            style={styles.expandMapBtn}
            onPress={() => navigation.navigate('AdminMapScreen')}
            activeOpacity={0.8}
          >
            <Feather name="maximize-2" size={14} color="#0B2564" style={{ marginRight: 6 }} />
            <Text style={styles.expandMapText}>Expand Full Map</Text>
          </TouchableOpacity>

        </View>

        {/* Recent Logs Section */}
        <View style={styles.logsSection}>
          <View style={styles.logsHeaderRow}>
            <Text style={styles.logsTitle}>Recent logs</Text>
            <TouchableOpacity onPress={() => alert('See all Incidents logs')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={styles.loader} color="#0B2564" />
          ) : allAlerts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No logs found.</Text>
            </View>
          ) : (
            allAlerts.slice(0, 5).map((alert, idx) => {
              const badge = getStatusBadgeStyle(alert.status);
              
              // Sequence code matching mockup style e.g. #INC-451
              const serialCode = alert.id ? `#INC-${alert.id.substring(0, 3).toUpperCase()}` : `#INC-00${idx + 1}`;
              const time = alert.createdAt ? (alert.createdAt.toDate ? alert.createdAt.toDate() : new Date(alert.createdAt)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '00:00';
              const locationText = alert.location?.addressText ? (alert.location.addressText.split(',')[0]) : 'Purok 1';

              return (
                <TouchableOpacity 
                  key={alert.id}
                  style={styles.logCard}
                  onPress={() => navigation.navigate('IncidentDetail', { alertId: alert.id })}
                  activeOpacity={0.7}
                >
                  <View style={styles.logCardLeft}>
                    <Text style={styles.logCode}>{serialCode}</Text>
                    <Text style={styles.logSubText}>{locationText} • {time}</Text>
                  </View>
                  <View style={[styles.statusTag, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.statusTagText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

      </ScrollView>

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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  dateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  bellButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth, very faint soft shadow
    shadowColor: '#00000044',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 150, // space for bottom nav
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 16,
    // Smooth soft shadow matching citizen cards
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.02,
    shadowRadius: 16,
    elevation: 2,
    position: 'relative',
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    flex: 1,
    marginRight: 4,
  },
  metricIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0B2564',
  },
  actionRequiredBadge: {
    backgroundColor: '#FFF0F2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  actionRequiredText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '700',
  },
  trendText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '700',
    marginTop: 8,
  },
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    padding: 16,
    marginHorizontal: 24,
    marginBottom: 24,
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.02,
    shadowRadius: 16,
    elevation: 2,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  mapTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  mapToggles: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  toggleBtnActive: {
    backgroundColor: '#0B2564',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  realMapCanvas: {
    height: 230,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    position: 'relative',
  },
  mapView: {
    width: '100%',
    height: '100%',
  },
  expandMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  expandMapText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0B2564',
  },
  legendOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    width: 140,
  },
  legendTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  legendText: {
    fontSize: 8,
    color: '#6B7280',
    fontWeight: '500',
  },
  logsSection: {
    marginHorizontal: 24,
    marginBottom: 28,
  },
  logsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  logCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    // Smooth soft shadow matching citizen cards
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  logCardLeft: {
    flex: 1,
  },
  logCode: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  logSubText: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusTag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loader: {
    marginVertical: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
});
