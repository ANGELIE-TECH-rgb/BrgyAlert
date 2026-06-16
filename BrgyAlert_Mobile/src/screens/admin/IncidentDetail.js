import React, { useState, useEffect } from 'react';
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
  KeyboardAvoidingView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';

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

  // Subscribe to real-time updates for this alert
  useEffect(() => {
    if (!alertId) {
      setErrorMsg('No Report ID provided.');
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'alerts', alertId);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setIncident(docSnap.data());
      } else {
        setErrorMsg('Report not found in database.');
      }
      setLoading(false);
    }, (err) => {
      console.error('Error listening to alert:', err);
      setErrorMsg('Could not establish real-time listener.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [alertId]);

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
  const updateIncidentStatus = async (newStatus) => {
    if (newStatus === 'declined') {
      // Open decline reason modal instead
      setDeclineReason('');
      setDeclineModalVisible(true);
      return;
    }

    if (updating || !alertId) return;
    setUpdating(true);
    try {
      const docRef = doc(db, 'alerts', alertId);
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      Alert.alert('Updated', `Status changed to ${newStatus.replace('_', ' ').toUpperCase()}.`);
    } catch (error) {
      console.error('Error updating status:', error);
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
      Alert.alert('Report Declined', 'The report has been marked as declined. The citizen will be notified with your reason.');
    } catch (error) {
      console.error('Error declining report:', error);
      Alert.alert('Error', 'Failed to decline the report. Please try again.');
    } finally {
      setDeclineSubmitting(false);
    }
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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('AdminHome')}>
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
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0F2C59" />
          <Text style={styles.loadingText}>Syncing details...</Text>
        </View>
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

            {/* ─── ACTION PANEL ─────────────────────────────────────────── */}
            <View style={styles.actionCard}>
              <View style={styles.reviewHeaderRow}>
                <Feather name="settings" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
                <Text style={styles.reviewHeader}>Manage Incident Status</Text>
              </View>
              <Text style={styles.actionSubtitle}>
                Tap a status to update, or decline if the report is fake / invalid:
              </Text>

              <View style={styles.statusButtonsContainer}>
                {STATUS_OPTIONS.map((opt) => {
                  const isSelected = currentStatusKey === opt.key
                    || (opt.key === 'done' && currentStatusKey === 'resolved');

                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.statusOptionButton,
                        isSelected && {
                          backgroundColor: opt.bgSelected,
                          borderColor: opt.themeColor,
                          borderWidth: 2,
                        },
                        opt.key === 'declined' && styles.declineButton,
                      ]}
                      onPress={() => updateIncidentStatus(opt.key === 'done' ? 'resolved' : opt.key)}
                      disabled={updating}
                      activeOpacity={0.7}
                    >
                      {opt.key === 'declined' && (
                        <Feather
                          name="x-circle"
                          size={14}
                          color={isSelected ? '#EF4444' : '#9CA3AF'}
                          style={{ marginBottom: 4 }}
                        />
                      )}
                      <Text style={[
                        styles.statusOptionText,
                        { color: isSelected ? opt.themeColor : '#718096' },
                        isSelected && { fontWeight: '700' },
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ─── INCIDENT DETAILS CARD ────────────────────────────────── */}
            <View style={styles.reviewCard}>
              <View style={styles.reviewHeaderRow}>
                <Feather name="alert-triangle" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
                <Text style={styles.reviewHeader}>Incident Details</Text>
              </View>
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
                <Text style={styles.reviewValue}>{incident.reporterName || incident.witnessName || 'Anonymous'}</Text>
              </View>
            </View>

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
        </>
      )}

      {/* ─── DECLINE REASON MODAL ──────────────────────────────────────── */}
      <Modal
        visible={declineModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDeclineModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setDeclineModalVisible(false)}
          />
          <View style={styles.declineModalSheet}>
            {/* Drag handle */}
            <View style={styles.modalHandle} />

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
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 80 },

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
});
