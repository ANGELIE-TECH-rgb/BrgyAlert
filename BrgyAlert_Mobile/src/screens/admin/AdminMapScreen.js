import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';

// Barangay Lepa center coordinates (same as AdminConsole)
const BRGY_CENTER = { latitude: 14.6000, longitude: 120.9800 };

// Active statuses to show on the map
const ACTIVE_STATUSES = ['submitted', 'under_review', 'dispatched'];

export default function AdminMapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapMode, setMapMode] = useState('Standard');

  // ── Real-time Firestore listener ────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAllAlerts(list);
      setLoading(false);
    }, (err) => {
      console.log('AdminMapScreen snapshot error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────
  const activeAlerts = allAlerts.filter(a => ACTIVE_STATUSES.includes(a.status));

  const getPinColor = (category) => {
    if (category === 'Fire' || category === 'Medical') return '#EF4444';
    if (category === 'Flooding' || category === 'Accident' || category === 'Traffic') return '#D97706';
    return '#2563EB';
  };

  const getMapType = () => {
    if (mapMode === 'Satellite') return 'satellite';
    if (mapMode === 'Terrain')   return 'terrain';
    return 'standard';
  };

  const recenterMap = () => {
    mapRef.current?.animateToRegion({
      latitude: BRGY_CENTER.latitude,
      longitude: BRGY_CENTER.longitude,
      latitudeDelta: 0.025,
      longitudeDelta: 0.025,
    }, 600);
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── Full-Screen Map ─────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0B2564" />
          <Text style={styles.loadingText}>Loading map data…</Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          mapType={getMapType()}
          initialRegion={{
            latitude: BRGY_CENTER.latitude,
            longitude: BRGY_CENTER.longitude,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={true}
          toolbarEnabled={false}
        >
          {activeAlerts.map((alert) => (
            <Marker
              key={alert.id}
              coordinate={{
                latitude:  alert.location?.latitude  ?? BRGY_CENTER.latitude,
                longitude: alert.location?.longitude ?? BRGY_CENTER.longitude,
              }}
              pinColor={getPinColor(alert.category)}
              title={alert.category || 'Incident'}
              description={`${alert.location?.addressText || 'Unknown location'} — Tap to view details`}
              onCalloutPress={() =>
                navigation.navigate('IncidentDetail', { alertId: alert.id })
              }
            />
          ))}
        </MapView>
      )}

      {/* ── Top Bar Overlay ──────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Feather name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>

        {/* Title + Live Count */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleText}>Incident Map</Text>
          {activeAlerts.length > 0 && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>
                {activeAlerts.length} active
              </Text>
            </View>
          )}
        </View>

        {/* Map Type Toggle */}
        <View style={styles.mapToggles}>
          {['Standard', 'Satellite', 'Terrain'].map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.toggleBtn, mapMode === mode && styles.toggleBtnActive]}
              onPress={() => setMapMode(mode)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, mapMode === mode && styles.toggleTextActive]}>
                {mode}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Legend Overlay (bottom-left) ─────────────────────────── */}
      <View style={[styles.legendBox, { bottom: insets.bottom + 24 }]} pointerEvents="none">
        <Text style={styles.legendTitle}>MAP LEGEND</Text>
        {[
          { color: '#EF4444', label: 'Fire / Medical' },
          { color: '#D97706', label: 'Traffic / Flooding' },
          { color: '#2563EB', label: 'General' },
        ].map(({ color, label }) => (
          <View key={label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Re-center Button (bottom-right) ──────────────────────── */}
      <TouchableOpacity
        style={[styles.recenterBtn, { bottom: insets.bottom + 24 }]}
        onPress={recenterMap}
        activeOpacity={0.8}
      >
        <Feather name="crosshair" size={20} color="#0B2564" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  // ── Top Bar ────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleBlock: {
    flex: 1,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 5,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  mapToggles: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
  },
  toggleBtnActive: {
    backgroundColor: '#0B2564',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },

  // ── Legend Box ─────────────────────────────────────────────────────
  legendBox: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  legendTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '500',
  },

  // ── Re-center Button ───────────────────────────────────────────────
  recenterBtn: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
});
