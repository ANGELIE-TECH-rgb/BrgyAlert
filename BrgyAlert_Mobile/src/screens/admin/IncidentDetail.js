import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  StatusBar, 
  ScrollView, 
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { doc, onSnapshot, updateDoc, serverTimestamp, query, collection, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import GestureModal from '../../components/GestureModal';
import SkeletonLoader from '../../components/SkeletonLoader';
import { generateIncidentSummary, analyzeIncidentValidity } from '../../services/aiService';

const STATUS_STEPS = [
  { key: 'submitted', label: 'Report Submitted', desc: 'Report has been successfully recorded in the system.' },
  { key: 'under_review', label: 'Under Review', desc: 'Command center is currently reviewing the details.' },
  { key: 'dispatched', label: 'Dispatched', desc: 'Responder units have been deployed to the scene.' },
  { key: 'done', label: 'Resolved', desc: 'The incident has been resolved and closed.' }
];

// All status options including Decline
const STATUS_OPTIONS = [
  { key: 'submitted',   label: 'Submitted',    themeColor: '#D97706', bgSelected: '#FFF9E6' },
  { key: 'under_review',label: 'Under Review', themeColor: '#2563EB', bgSelected: '#EFF6FF' },
  { key: 'dispatched',  label: 'Dispatched',   themeColor: '#10B981', bgSelected: '#ECFDF5' },
  { key: 'done',        label: 'Resolved',     themeColor: '#4B5563', bgSelected: '#F3F4F6' },
  { key: 'declined',    label: 'Decline',      themeColor: '#EF4444', bgSelected: '#FEF2F2' },
];

export default function IncidentDetail({ route, navigation }) {
  const { alertId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Decline modal state
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineSubmitting, setDeclineSubmitting] = useState(false);

  // Status modal state
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  
  // Dynamic reporter profile lookup
  const [reporterProfile, setReporterProfile] = useState(null);

  // Safety ref to prevent duplicate background AI runs
  const generatingSummaryRef = useRef(false);

  // Subscribe to real-time updates for this alert
  useEffect(() => {
    if (!alertId) {
      setErrorMsg('No Report ID provided.');
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'alerts', alertId);
    
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIncident(data);

        // Auto-heal missing AI summaries and validity checks (e.g., offline SMS reports)
        if (data.details && (!data.aiSummary || data.aiFlaggedFake === undefined) && !generatingSummaryRef.current) {
          generatingSummaryRef.current = true;
          try {
            console.log('[IncidentDetail] Auto-healing missing AI fields via Gemini...');
            
            // Run validation and summary checks concurrently
            const [summary, validity] = await Promise.all([
              !data.aiSummary ? generateIncidentSummary(data.details) : Promise.resolve(data.aiSummary),
              data.aiFlaggedFake === undefined ? analyzeIncidentValidity(data.details) : Promise.resolve(null)
            ]);

            const updatePayload = {};
            if (!data.aiSummary && summary) {
              updatePayload.aiSummary = summary;
            }
            if (data.aiFlaggedFake === undefined && validity) {
              updatePayload.aiFlaggedFake = !!validity.isFake;
              updatePayload.aiFakeReason = validity.reasoning || '';
              updatePayload.aiValidityConfidence = validity.confidence || 'Low';
            }

            if (Object.keys(updatePayload).length > 0) {
              await updateDoc(docRef, updatePayload);
            }
          } catch (sumErr) {
            console.log('[IncidentDetail] Background AI healing failed:', sumErr);
          } finally {
            generatingSummaryRef.current = false;
          }
        }
      } else {
        setErrorMsg('Report not found in database.');
      }
      setLoading(false);
    }, (err) => {
      console.log('Error listening to alert:', err);
      setErrorMsg('Could not establish real-time listener. Please check your internet connection.');
      setLoading(false);
    });

    // Mark incident notifications for this report as read
    const markIncidentNotifsAsRead = async () => {
      if (!user) return;
      try {
        const notifQuery = query(
          collection(db, 'users', user.uid, 'notifications'),
          where('relatedId', '==', alertId),
          where('type', '==', 'incident'),
          where('read', '==', false)
        );
        const notifSnap = await getDocs(notifQuery);
        if (!notifSnap.empty) {
          const batch = writeBatch(db);
          notifSnap.forEach((d) => {
            const ref = doc(db, 'users', user.uid, 'notifications', d.id);
            batch.update(ref, { read: true });
          });
          await batch.commit();
        }
      } catch (err) {
        console.log('Error marking incident notifications as read:', err);
      }
    };
    markIncidentNotifsAsRead();

    return () => unsubscribe();
  }, [alertId, user]);

  useEffect(() => {
    if (!incident?.userId) {
      setReporterProfile(null);
      return;
    }
    const userDocRef = doc(db, 'users', incident.userId);
    const unsubscribeUser = onSnapshot(userDocRef, (userSnap) => {
      if (userSnap.exists()) {
        setReporterProfile(userSnap.data());
      }
    }, (err) => {
      console.log('Error listening to reporter profile:', err);
    });

    return () => unsubscribeUser();
  }, [incident?.userId]);

  // Determine current active step index for timeline
  const getCurrentStepIndex = () => {
    if (!incident) return 0;
    const currentStatus = incident.status || 'submitted';
    if (currentStatus === 'resolved') return 3;
    if (currentStatus === 'declined') return 0; // Declined stays at step 0 visually
    const index = STATUS_STEPS.findIndex(step => step.key === currentStatus);
    return index !== -1 ? index : 0;
  };

  const activeIndex = getCurrentStepIndex();

  // Status style map for header pill
  const getStatusStyle = (status) => {
    if (status === 'under_review') return { statusText: 'Under Review', tagBg: '#EFF6FF', tagColor: '#2563EB' };
    if (status === 'dispatched')   return { statusText: 'Dispatched',   tagBg: '#ECFDF5', tagColor: '#10B981' };
    if (status === 'done' || status === 'resolved') return { statusText: 'Resolved', tagBg: '#F3F4F6', tagColor: '#4B5563' };
    if (status === 'declined')     return { statusText: 'Declined',     tagBg: '#FEF2F2', tagColor: '#EF4444' };
    return { statusText: 'Pending', tagBg: '#FFF9E6', tagColor: '#D97706' };
  };

  // Format Date and Time helper
  const formatStepTime = (ts) => {
    if (!ts) return '';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
        + ', '
        + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { return ''; }
  };

  // Normal status update (non-decline)
  const handleStatusSelection = (newStatus) => {
    const selectedOpt = STATUS_OPTIONS.find(opt => opt.key === newStatus);
    const label = selectedOpt ? selectedOpt.label : newStatus;

    if (newStatus === 'declined') {
      Alert.alert(
        'Decline Report',
        'Are you sure you want to decline this report? This will mark it as invalid/fake.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Yes, Decline', 
            onPress: () => {
              setStatusModalVisible(false);
              setDeclineReason('');
              setDeclineModalVisible(true);
            }
          }
        ]
      );
      return;
    }

    Alert.alert(
      'Change Status',
      `Are you sure you want to change the status of this report to "${label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          onPress: async () => {
            setStatusModalVisible(false);
            await performStatusUpdate(newStatus);
          }
        }
      ]
    );
  };

  const performStatusUpdate = async (newStatus) => {
    if (updating || !alertId) return;
    setUpdating(true);
    try {
      const docRef = doc(db, 'alerts', alertId);
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      Alert.alert('Success', `Incident status updated to "${newStatus.replace('_', ' ').toUpperCase()}".`);
    } catch (error) {
      console.log('Error updating status:', error);
      Alert.alert('Error', 'Failed to update status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  // Submit decline with reason
  const submitDecline = async () => {
    if (!declineReason.trim()) {
      Alert.alert('Reason Required', 'Please enter a reason before declining this report.');
      return;
    }
    Alert.alert(
      'Confirm Decline',
      'Are you sure you want to decline this report with the provided reason?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          onPress: async () => {
            setDeclineSubmitting(true);
            try {
              const docRef = doc(db, 'alerts', alertId);
              await updateDoc(docRef, {
                status: 'declined',
                declineReason: declineReason.trim(),
                updatedAt: serverTimestamp()
              });
              setDeclineModalVisible(false);
              setDeclineReason('');
              Alert.alert('Report Declined', 'The report has been marked as declined.');
            } catch (error) {
              console.log('Error declining report:', error);
              Alert.alert('Error', 'Failed to decline the report. Please try again.');
            } finally {
              setDeclineSubmitting(false);
            }
          }
        }
      ]
    );
  };

  // Open native Maps app with the incident coordinates — 100% free, no API call
  const openInMaps = () => {
    const lat = incident?.location?.latitude;
    const lng = incident?.location?.longitude;
    if (!lat || !lng) {
      Alert.alert('No Coordinates', 'This report has no GPS coordinates attached.');
      return;
    }
    const label = encodeURIComponent(incident?.location?.addressText || 'Incident Location');
    const url = Platform.OS === 'ios'
      ? `maps:0,0?q=${label}@${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    Linking.openURL(url).catch(() =>
      // Fallback to Google Maps web if native Maps not available
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`)
    );
  };

  const statusInfo = incident ? getStatusStyle(incident.status) : { statusText: 'Pending', tagBg: '#FFF9E6', tagColor: '#D97706' };
  const displayId = alertId ? (alertId.length > 10 ? alertId.substring(0, 10).toUpperCase() : alertId.toUpperCase()) : 'NEW';
  const currentStatusKey = incident?.status || 'submitted';
  const isDeclined = currentStatusKey === 'declined';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('AdminHome');
            }
          }}
        >
          <Feather name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Incident Detail</Text>
          <Text style={styles.headerSubtitle}>ReportID: #{displayId}</Text>
        </View>
        <View style={[styles.statusTag, { backgroundColor: statusInfo.tagBg }]}>
          <Text style={[styles.statusText, { color: statusInfo.tagColor }]}>{statusInfo.statusText}</Text>
        </View>
      </View>

      {loading ? (
        <SkeletonLoader type="detail" />
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.navigate('AdminHome')}>
            <Text style={styles.retryButtonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* ─── DECLINED WARNING BANNER ─────────────────────────────── */}
            {isDeclined && (
              <View style={styles.declineBanner}>
                <View style={styles.declineBannerHeader}>
                  <Feather name="alert-octagon" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.declineBannerTitle}>Report Declined</Text>
                </View>
                <Text style={styles.declineBannerSubtitle}>
                  This report was marked as fake or invalid by the Command Center.
                </Text>
                {incident.declineReason ? (
                  <View style={styles.declineReasonBox}>
                    <Text style={styles.declineReasonLabel}>Admin's reason:</Text>
                    <Text style={styles.declineReasonText}>"{incident.declineReason}"</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ─── AI FAKE WARNING BANNER ─────────────────────────────── */}
            {incident.aiFlaggedFake && !isDeclined && (
              <View style={styles.aiFakeBanner}>
                <View style={styles.aiFakeBannerHeader}>
                  <Feather name="alert-triangle" size={18} color="#D97706" style={{ marginRight: 8 }} />
                  <Text style={styles.aiFakeBannerTitle}>AI Warning: Potential Fake Report</Text>
                </View>
                <Text style={styles.aiFakeBannerSubtitle}>
                  AI analyzed this report and identified that it might be spam, fake, or a test.
                </Text>
                {incident.aiFakeReason ? (
                  <View style={styles.aiFakeReasonBox}>
                    <Text style={styles.aiFakeReasonLabel}>AI Reasoning:</Text>
                    <Text style={styles.aiFakeReasonText}>"{incident.aiFakeReason}"</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.aiFakeDeclineBtn}
                  onPress={() => {
                    setDeclineReason(`AI Flagged: ${incident.aiFakeReason || 'Potential Fake Report'}`);
                    setDeclineModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="x-circle" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.aiFakeDeclineBtnText}>Decline Invalid Report</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─── ACTION PANEL ─────────────────────────────────────────── */}
            <View style={styles.actionCard}>
              <View style={styles.reviewHeaderRow}>
                <Feather name="settings" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
                <Text style={styles.reviewHeader}>Manage Incident Status</Text>
              </View>
              <Text style={styles.actionSubtitle}>
                Update the stage or status of this incident:
              </Text>

              <TouchableOpacity
                style={styles.statusTriggerBtn}
                onPress={() => setStatusModalVisible(true)}
                disabled={updating}
                activeOpacity={0.8}
              >
                <View style={styles.statusTriggerLeft}>
                  <View style={[styles.statusTriggerDot, { backgroundColor: statusInfo.tagColor }]} />
                  <Text style={styles.statusTriggerLabel}>
                    Status: <Text style={styles.statusTriggerValue}>{statusInfo.statusText}</Text>
                  </Text>
                </View>
                <View style={styles.statusTriggerRight}>
                  <Text style={styles.editBtnText}>Edit</Text>
                  <Feather name="chevron-right" size={16} color="#0F2C59" />
                </View>
              </TouchableOpacity>
            </View>

            {/* ─── INCIDENT DETAILS CARD ────────────────────────────────── */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewHeaderRow}>
                <Feather name="alert-triangle" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
                <Text style={styles.reviewHeader}>Incident Details</Text>
              </View>

              {incident.aiSummary ? (
                <View style={styles.aiSummaryRow}>
                  <View style={styles.aiSummaryHeader}>
                    <Ionicons name="sparkles" size={12} color="#2563EB" style={{ marginRight: 4 }} />
                    <Text style={styles.aiSummaryTitle}>AI Brief Summary</Text>
                  </View>
                  <Text style={styles.aiSummaryText}>"{incident.aiSummary}"</Text>
                </View>
              ) : null}

              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Incident Type</Text>
                <Text style={styles.reviewValue}>{incident.category}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Location</Text>
                <Text style={styles.reviewValue}>{incident.location?.addressText || 'N/A'}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Date & Time</Text>
                <Text style={styles.reviewValue}>{formatStepTime(incident.createdAt)}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Description</Text>
                <Text style={styles.reviewValue}>{incident.details}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Witness / Reporter</Text>
                <Text style={styles.reviewValue}>
                  {reporterProfile?.fullName || incident.reporterName || incident.witnessName || 'Anonymous'}
                </Text>
              </View>
            </View>

            {/* ─── LOCATION MAP CARD ─────────────────────────────────── */}
            {incident.location?.latitude && incident.location?.longitude && (
              <View style={styles.reviewCard}>
                <View style={styles.reviewHeaderRow}>
                  <Feather name="map-pin" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
                  <Text style={styles.reviewHeader}>Incident Location</Text>
                </View>

                {/* Address text */}
                <Text style={styles.addressText}>
                  {incident.location?.addressText || 'GPS coordinates recorded'}
                </Text>

                {/* Embedded map with single pin */}
                <View style={styles.mapContainer}>
                  <MapView
                    style={styles.mapView}
                    provider={PROVIDER_GOOGLE}
                    initialRegion={{
                      latitude:       incident.location.latitude,
                      longitude:      incident.location.longitude,
                      latitudeDelta:  0.005,
                      longitudeDelta: 0.005,
                    }}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                  >
                    <Marker
                      coordinate={{
                        latitude:  incident.location.latitude,
                        longitude: incident.location.longitude,
                      }}
                      pinColor="#EF4444"
                      title={incident.category || 'Incident'}
                      description={incident.location?.addressText || ''}
                    />
                  </MapView>

                  {/* Coordinates badge overlay */}
                  <View style={styles.coordsBadge}>
                    <Feather name="navigation" size={10} color="#0F2C59" style={{ marginRight: 4 }} />
                    <Text style={styles.coordsText}>
                      {incident.location.latitude.toFixed(5)}, {incident.location.longitude.toFixed(5)}
                    </Text>
                  </View>
                </View>

                {/* Open in Maps deep-link button */}
                <TouchableOpacity
                  style={styles.openMapsBtn}
                  onPress={openInMaps}
                  activeOpacity={0.8}
                >
                  <Feather name="external-link" size={15} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.openMapsBtnText}>Navigate to Scene</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─── EVIDENCE CARD ────────────────────────────────────────── */}
            {incident.mediaUrls && incident.mediaUrls.length > 0 && (
              <View style={styles.reviewCard}>
                <View style={styles.reviewHeaderRow}>
                  <Feather name="image" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
                  <Text style={styles.reviewHeader}>Evidence</Text>
                </View>
                <View style={styles.reviewThumbnailsRow}>
                  {incident.mediaUrls.map((url, index) => (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.9}
                      onPress={() => { setSelectedImageUri(url); setImageModalVisible(true); }}
                    >
                      <Image source={{ uri: url }} style={styles.reviewThumbnailSquare} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ─── STATUS TIMELINE ──────────────────────────────────────── */}
            <View style={styles.timelineSection}>
              <Text style={styles.timelineHeader}>Status timeline</Text>
              <View style={styles.timelineList}>
                {STATUS_STEPS.map((step, idx) => {
                  const isCompleted = !isDeclined && idx <= activeIndex;
                  const isActive    = !isDeclined && idx === activeIndex;
                  const isLast      = idx === STATUS_STEPS.length - 1;
                  return (
                    <View key={step.key} style={styles.timelineItem}>
                      <View style={styles.nodeColumn}>
                        <View style={[
                          styles.circleNode,
                          isCompleted && styles.circleCompleted,
                          isActive    && styles.circleActive,
                        ]}>
                          {isCompleted && <Feather name="check" size={12} color="#FFFFFF" />}
                        </View>
                        {!isLast && (
                          <View style={[styles.lineConnector, idx < activeIndex && !isDeclined && styles.lineCompleted]} />
                        )}
                      </View>
                      <View style={styles.stepDetails}>
                        <Text style={[
                          styles.stepLabel,
                          isCompleted && styles.stepLabelCompleted,
                          isActive    && styles.stepLabelActive,
                        ]}>
                          {step.label}
                        </Text>
                        {isCompleted && (
                          <Text style={styles.stepTime}>
                            {idx === 0
                              ? formatStepTime(incident.createdAt)
                              : formatStepTime(incident.updatedAt || incident.createdAt)}
                          </Text>
                        )}
                        <Text style={styles.stepDesc}>{step.desc}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

          </ScrollView>

          {/* Bottom gradient fade */}
          <View style={styles.bottomGradient} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="fadeGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0"   stopColor="#FFFFFF" stopOpacity="0"    />
                  <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.85" />
                  <Stop offset="1"   stopColor="#FFFFFF" stopOpacity="1"    />
                </LinearGradient>
              </Defs>
              <Rect width="100" height="100" fill="url(#fadeGrad)" />
            </Svg>
          </View>

          {/* Sticky Message Reporter Footer Button */}
          <View style={styles.footerContainer}>
            <TouchableOpacity 
              style={[styles.messageButton, isDeclined && styles.disabledMessageButton]}
              onPress={() => navigation.navigate('ChatScreen', { alertId })}
              disabled={isDeclined}
              activeOpacity={isDeclined ? 1 : 0.8}
            >
              {isDeclined ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="lock" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.messageButtonText}>Chat Locked (Report Declined)</Text>
                </View>
              ) : (
                <Text style={styles.messageButtonText}>Message Reporter</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ─── STATUS SELECTION MODAL ─────────────────────────────────────── */}
      <GestureModal
        visible={statusModalVisible}
        onClose={() => setStatusModalVisible(false)}
        contentStyle={styles.statusModalSheet}
      >
        <Text style={styles.statusModalTitle}>Update Status</Text>
        <Text style={styles.statusModalSubtitle}>Select the new status for this incident:</Text>

        <View style={styles.statusOptionsList}>
          {STATUS_OPTIONS.map((opt) => {
            const isSelected = currentStatusKey === opt.key
              || (opt.key === 'done' && currentStatusKey === 'resolved');

            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.statusSelectRow,
                  isSelected && { backgroundColor: opt.bgSelected, borderColor: opt.themeColor, borderWidth: 1.5 }
                ]}
                onPress={() => handleStatusSelection(opt.key === 'done' ? 'resolved' : opt.key)}
                activeOpacity={0.7}
              >
                <View style={styles.statusSelectLeft}>
                  <View style={[styles.statusOptionDot, { backgroundColor: opt.themeColor }]} />
                  <Text style={[
                    styles.statusSelectLabel,
                    isSelected && { color: opt.themeColor, fontWeight: '700' }
                  ]}>
                    {opt.label}
                  </Text>
                </View>
                {isSelected && <Feather name="check" size={18} color={opt.themeColor} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.cancelStatusBtn}
          onPress={() => setStatusModalVisible(false)}
        >
          <Text style={styles.cancelStatusBtnText}>Cancel</Text>
        </TouchableOpacity>
      </GestureModal>

      {/* ─── DECLINE REASON MODAL ──────────────────────────────────────── */}
      <GestureModal
        visible={declineModalVisible}
        onClose={() => setDeclineModalVisible(false)}
        contentStyle={styles.declineModalSheet}
        keyboardAvoiding
      >
        {/* Modal header */}
        <View style={styles.declineModalHeader}>
          <View style={styles.declineIconCircle}>
            <Feather name="x-circle" size={22} color="#EF4444" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.declineModalTitle}>Decline Report</Text>
            <Text style={styles.declineModalSubtitle}>
              Provide a reason so the citizen understands why their report was declined.
            </Text>
          </View>
        </View>

        {/* Reason input */}
        <Text style={styles.declineInputLabel}>Reason for declining</Text>
        <TextInput
          style={styles.declineInput}
          placeholder="e.g. Duplicate report, false alarm, insufficient details..."
          placeholderTextColor="#9CA3AF"
          value={declineReason}
          onChangeText={setDeclineReason}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={300}
        />
        <Text style={styles.charCount}>{declineReason.length}/300</Text>

        {/* Action buttons */}
        <View style={styles.declineModalButtons}>
          <TouchableOpacity
            style={styles.cancelModalButton}
            onPress={() => setDeclineModalVisible(false)}
          >
            <Text style={styles.cancelModalButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmDeclineButton, declineSubmitting && { opacity: 0.6 }]}
            onPress={submitDecline}
            disabled={declineSubmitting}
          >
            {declineSubmitting
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={styles.confirmDeclineButtonText}>Decline Report</Text>
            }
          </TouchableOpacity>
        </View>
      </GestureModal>

      {/* ─── IMAGE VIEWER MODAL ───────────────────────────────────────── */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => { setImageModalVisible(false); setSelectedImageUri(null); }}
      >
        <TouchableOpacity
          style={styles.imageOverlay}
          activeOpacity={1}
          onPress={() => { setImageModalVisible(false); setSelectedImageUri(null); }}
        >
          <TouchableOpacity
            style={styles.closeImageBtn}
            onPress={() => { setImageModalVisible(false); setSelectedImageUri(null); }}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {selectedImageUri && (
            <Image source={{ uri: selectedImageUri }} style={styles.fullImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  // ── Header ──────────────────────────────────────────────────────────
  navHeader: {
    height: 64, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#00000040', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  headerTitleContainer: { flex: 1, marginLeft: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  headerSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '500' },
  statusTag: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },

  // ── Center / loading / error ─────────────────────────────────────────
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  loadingText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  errorText: { fontSize: 16, color: '#EF4444', fontWeight: '700', textAlign: 'center' },
  retryButton: { backgroundColor: '#0F2C59', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20, marginTop: 20 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },

  // ── Scroll content ───────────────────────────────────────────────────
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 140 },

  // ── Decline banner (shown at the top when declined) ──────────────────
  declineBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  declineBannerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  declineBannerTitle: { fontSize: 15, fontWeight: '700', color: '#B91C1C' },
  declineBannerSubtitle: { fontSize: 13, color: '#EF4444', lineHeight: 18, fontWeight: '500' },
  declineReasonBox: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  declineReasonLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginBottom: 4 },
  declineReasonText: { fontSize: 14, color: '#1F2937', fontWeight: '600', lineHeight: 20, fontStyle: 'italic' },

  // ── AI Fake Banner ───────────────────────────────────────────────────
  aiFakeBanner: {
    backgroundColor: '#FFF9E6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  aiFakeBannerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  aiFakeBannerTitle: { fontSize: 15, fontWeight: '700', color: '#D97706' },
  aiFakeBannerSubtitle: { fontSize: 13, color: '#B45309', lineHeight: 18, fontWeight: '500' },
  aiFakeReasonBox: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  aiFakeReasonLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginBottom: 4 },
  aiFakeReasonText: { fontSize: 14, color: '#1F2937', fontWeight: '600', lineHeight: 20, fontStyle: 'italic' },
  aiFakeDeclineBtn: {
    marginTop: 14,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiFakeDeclineBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // ── Action card ───────────────────────────────────────────────────────
  actionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 20,
    shadowColor: '#0F2C59', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04, shadowRadius: 16, elevation: 2,
  },
  actionSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 14, fontWeight: '500' },
  statusButtonsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statusOptionButton: {
    width: '48%', backgroundColor: '#F9FAFB', borderRadius: 14,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10,
  },
  declineButton: {
    // Full-width red-tinted Decline button
    width: '100%',
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  statusOptionText: { fontSize: 12, fontWeight: '600' },

  // ── Review card ───────────────────────────────────────────────────────
  reviewCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 20,
    shadowColor: '#00000040', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03, shadowRadius: 16, elevation: 2,
  },
  reviewHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  reviewHeader: { fontSize: 16, fontWeight: '700', color: '#0F2C59' },
  reviewRow: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB', paddingBottom: 8 },
  reviewLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 2 },
  reviewValue: { fontSize: 15, fontWeight: '700', color: '#1F2937', lineHeight: 20 },
  reviewThumbnailsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  reviewThumbnailSquare: { width: 90, height: 90, borderRadius: 14, marginRight: 12, marginBottom: 12, resizeMode: 'cover' },

  // ── Timeline ──────────────────────────────────────────────────────────
  timelineSection: { marginTop: 8, paddingHorizontal: 4, paddingBottom: 40 },
  timelineHeader: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 20 },
  timelineList: { paddingLeft: 4 },
  timelineItem: { flexDirection: 'row', minHeight: 80 },
  nodeColumn: { alignItems: 'center', marginRight: 16 },
  circleNode: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
  },
  circleCompleted: { borderColor: '#0F2C59', backgroundColor: '#0F2C59' },
  circleActive:    { borderColor: '#0F2C59', backgroundColor: '#0F2C59' },
  lineConnector:   { width: 2, flex: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },
  lineCompleted:   { backgroundColor: '#0F2C59' },
  stepDetails:     { flex: 1, paddingTop: 2 },
  stepLabel:       { fontSize: 15, fontWeight: '700', color: '#9CA3AF' },
  stepLabelCompleted: { color: '#1F2937' },
  stepLabelActive:    { color: '#1F2937' },
  stepTime:        { fontSize: 12, color: '#9CA3AF', marginTop: 2, fontWeight: '500' },
  stepDesc:        { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 18, fontWeight: '500' },

  // ── Location map card ──────────────────────────────────────────────
  addressText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 18,
  },
  mapContainer: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    position: 'relative',
    marginBottom: 12,
  },
  mapView: {
    width: '100%',
    height: '100%',
  },
  coordsBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  coordsText: {
    fontSize: 10,
    color: '#4B5563',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  openMapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F2C59',
    borderRadius: 14,
    paddingVertical: 12,
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  openMapsBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Bottom gradient ───────────────────────────────────────────────────
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, zIndex: 5 },

  // ── Decline reason modal ──────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  declineModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingTop: 12,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 12,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20,
  },
  declineModalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  declineIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center',
  },
  declineModalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  declineModalSubtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18, fontWeight: '500' },
  declineInputLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  declineInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    fontSize: 14,
    color: '#1F2937',
    minHeight: 100,
    lineHeight: 20,
  },
  charCount: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4, marginBottom: 20 },
  declineModalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelModalButton: {
    flex: 1, marginRight: 10,
    backgroundColor: '#F3F4F6', borderRadius: 30,
    paddingVertical: 14, alignItems: 'center',
  },
  cancelModalButtonText: { fontSize: 15, fontWeight: '700', color: '#6B7280' },
  confirmDeclineButton: {
    flex: 1,
    backgroundColor: '#EF4444', borderRadius: 30,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 3,
  },
  confirmDeclineButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // ── Image viewer modal ────────────────────────────────────────────────
  imageOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  closeImageBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 20,
    zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20,
  },
  fullImage: { width: '90%', height: '75%' },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#F3F4F6',
    zIndex: 10,
  },
  messageButton: {
    backgroundColor: '#0F2C59',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2C5940',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  disabledMessageButton: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  messageButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  statusTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  statusTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusTriggerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  statusTriggerLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  statusTriggerValue: {
    color: '#0F2C59',
    fontWeight: '700',
  },
  statusTriggerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F2C59',
    marginRight: 4,
  },
  statusModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 12,
  },
  statusModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statusModalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 16,
  },
  statusOptionsList: {
    marginBottom: 16,
  },
  statusSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  statusSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  statusSelectLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  cancelStatusBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelStatusBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6B7280',
  },
  aiSummaryRow: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  aiSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  aiSummaryTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E40AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiSummaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E3A8A',
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
