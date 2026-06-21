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
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { doc, onSnapshot, query, collection, where, getDocs, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import TutorialOverlay from '../../components/TutorialOverlay';
import NetInfo from '@react-native-community/netinfo';
import SkeletonLoader from '../../components/SkeletonLoader';
import ConnectionBlocker from '../../components/ConnectionBlocker';

const STATUS_STEPS = [
  { key: 'submitted', label: 'Report Submitted', desc: 'Your report has been successfully recorded in the system.' },
  { key: 'under_review', label: 'Under Review', desc: 'Command center is currently reviewing the details.' },
  { key: 'dispatched', label: 'Dispatched', desc: 'Responder units have been deployed to the scene.' },
  { key: 'done', label: 'Resolved', desc: 'The incident has been resolved and closed.' }
];

export default function StatusTracker({ route, navigation }) {
  const { alertId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const { user } = useAuth();
  
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [responseTimeText, setResponseTimeText] = useState('15-30 mins');

  // Load configured response time from Firestore
  useEffect(() => {
    const fetchResponseTime = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'brgyConfig', 'responseTimeConfig'));
        if (configDoc.exists() && configDoc.data().value) {
          setResponseTimeText(configDoc.data().value);
        }
      } catch (err) {
        console.log('Error fetching responseTimeConfig:', err);
      }
    };
    fetchResponseTime();
  }, []);

  // Monitor Network Connectivity State
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsubscribeNet();
  }, []);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const checkTutorial = async () => {
        try {
          const val = await AsyncStorage.getItem('hasSeenTrackerTutorial');
          if (val !== 'true') {
            setTimeout(() => {
              setShowTutorial(true);
            }, 600);
          } else {
            setShowTutorial(false);
          }
        } catch (err) {
          console.log('Error checking tracker tutorial state:', err);
        }
      };
      checkTutorial();
    });
    return unsubscribe;
  }, [navigation]);

  const handleFinishTutorial = async () => {
    try {
      await AsyncStorage.setItem('hasSeenTrackerTutorial', 'true');
    } catch (err) {
      console.log('Error saving tracker tutorial state:', err);
    }
    setShowTutorial(false);
  };

  const trackerTourSteps = [
    {
      title: 'Incident Timeline Progress',
      desc: 'Track the real-time status of your incident. Responders will update this from Submitted to Dispatched and eventually Resolved.',
      top: insets.top + Math.round(H * 0.12),
      arrow: 'top'
    },
    {
      title: 'Reporter Details Review',
      desc: 'Review report details, witness statements, geocoded address coordinates, and compressed photo evidence attachments.',
      top: Math.round(H * 0.40),
      arrow: 'top'
    },
    {
      title: 'Secure Message Responders',
      desc: 'Tap "Message Responder" to open the secure chat thread and coordinate directly with the Command Center in real-time.',
      bottom: Math.round(H * 0.10),
      arrow: 'bottom'
    }
  ];

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
      console.log('Error listening to alert:', err);
      setErrorMsg('Could not establish real-time listener. Please check your internet connection.');
      setLoading(false);
    });

    // Mark status notifications for this report as read
    const markStatusNotifsAsRead = async () => {
      if (!user) return;
      try {
        const notifQuery = query(
          collection(db, 'users', user.uid, 'notifications'),
          where('relatedId', '==', alertId),
          where('type', '==', 'status'),
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
        console.log('Error marking status notifications as read:', err);
      }
    };
    markStatusNotifsAsRead();

    return () => unsubscribe();
  }, [alertId, user]);

  // Determine current active step index
  const getCurrentStepIndex = () => {
    if (!incident) return 0;
    const currentStatus = incident.status || 'submitted';
    
    if (currentStatus === 'resolved') return 3;

    const index = STATUS_STEPS.findIndex(step => step.key === currentStatus);
    return index !== -1 ? index : 0;
  };

  const activeIndex = getCurrentStepIndex();

  // Custom status color schemes matching dashboard citizen
  const getStatusStyle = (status) => {
    let statusText = 'Pending';
    let tagBg = '#FFF9E6';
    let tagColor = '#D97706'; // Vibrant orange/yellow

    if (status === 'under_review') {
      statusText = 'Under Review';
      tagBg = '#EFF6FF';
      tagColor = '#2563EB'; // Blue
    } else if (status === 'dispatched') {
      statusText = 'Dispatched';
      tagBg = '#ECFDF5';
      tagColor = '#10B981'; // Green
    } else if (status === 'done' || status === 'resolved') {
      statusText = 'Resolved';
      tagBg = '#F3F4F6';
      tagColor = '#4B5563'; // Grey
    } else if (status === 'declined') {
      statusText = 'Declined';
      tagBg = '#FEF2F2';
      tagColor = '#EF4444'; // Red
    }

    return { statusText, tagBg, tagColor };
  };

  // Format Date and Time
  const formatStepTime = (createdAt) => {
    if (!createdAt) return '';
    try {
      const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit'
      }) + `, ` + date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return '';
    }
  };

  const statusInfo = incident ? getStatusStyle(incident.status) : { statusText: 'Pending', tagBg: '#FFF9E6', tagColor: '#D97706' };
  const displayId = alertId ? (alertId.length > 10 ? alertId.substring(0, 10).toUpperCase() : alertId.toUpperCase()) : 'NEW';
  const isDeclined = incident?.status === 'declined';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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

      {/* Header (Mockup Alignment) */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('CitizenHome');
            }
          }}
        >
          <Feather name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Report Details</Text>
          <Text style={styles.headerSubtitle}>ReportID: #{displayId}</Text>
        </View>

        <View style={[styles.statusTag, { backgroundColor: statusInfo.tagBg }]}>
          <Text style={[styles.statusText, { color: statusInfo.tagColor }]}>{statusInfo.statusText}</Text>
        </View>
      </View>

      {loading ? (
        <SkeletonLoader type="tracker" />
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => navigation.navigate('CitizenHome')}
          >
            <Text style={styles.retryButtonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* ─── DECLINE WARNING BANNER ─────────────────────────────── */}
            {isDeclined && (
              <View style={styles.declineBanner}>
                <View style={styles.declineBannerHeader}>
                  <Feather name="alert-octagon" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={styles.declineBannerTitle}>Report Declined</Text>
                </View>
                <Text style={styles.declineBannerSubtitle}>
                  Your report has been reviewed and marked as invalid or a false alarm by the Command Center.
                </Text>
                {incident.declineReason ? (
                  <View style={styles.declineReasonBox}>
                    <Text style={styles.declineReasonLabel}>Reason from Admin:</Text>
                    <Text style={styles.declineReasonText}>"{incident.declineReason}"</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* ─── ESTIMATED RESPONSE BANNER ──────────────────────────── */}
            {!isDeclined && (incident?.status === 'under_review' || incident?.status === 'dispatched') && (
              <View style={styles.responseBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Feather name="clock" size={16} color="#0F2C59" style={{ marginRight: 6 }} />
                  <Text style={styles.responseBannerTitle}>Command Center Notified</Text>
                </View>
                <Text style={styles.responseBannerText}>
                  Responders are actively coordinating. Estimated response time: {responseTimeText}.
                </Text>
              </View>
            )}

            {/* Card 1: Incident Details */}
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
                <Text style={styles.reviewLabel}>Witness</Text>
                <Text style={styles.reviewValue}>{incident.witnessName || 'None'}</Text>
              </View>
            </View>

            {/* Card 2: Incident Media Evidence */}
            {incident.mediaUrls && incident.mediaUrls.length > 0 ? (
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
                      onPress={() => {
                        setSelectedImageUri(url);
                        setImageModalVisible(true);
                      }}
                    >
                      <Image source={{ uri: url }} style={styles.reviewThumbnailSquare} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Section: Status timeline */}
            <View style={styles.timelineSection}>
              <Text style={styles.timelineHeader}>Status timeline</Text>
              
              <View style={styles.timelineList}>
                {STATUS_STEPS.map((step, idx) => {
                  const isCompleted = !isDeclined && idx <= activeIndex;
                  const isActive    = !isDeclined && idx === activeIndex;
                  const isLast = idx === STATUS_STEPS.length - 1;

                  return (
                    <View key={step.key} style={styles.timelineItem}>
                      
                      {/* Timeline Node Column */}
                      <View style={styles.nodeColumn}>
                        <View style={[
                          styles.circleNode,
                          isCompleted && styles.circleCompleted,
                          isActive && styles.circleActive
                        ]}>
                          {isCompleted ? (
                            <Feather name="check" size={12} color="#FFFFFF" />
                          ) : null}
                        </View>
                        {!isLast ? (
                          <View style={[
                            styles.lineConnector,
                            idx < activeIndex && styles.lineCompleted
                          ]} />
                        ) : null}
                      </View>

                      {/* Timeline Step Details */}
                      <View style={styles.stepDetails}>
                        <Text style={[
                          styles.stepLabel,
                          isCompleted && styles.stepLabelCompleted,
                          isActive && styles.stepLabelActive
                        ]}>
                          {step.label}
                        </Text>
                        
                        {isCompleted && (
                          <Text style={styles.stepTime}>
                            {idx === 0 ? formatStepTime(incident.createdAt) : formatStepTime(incident.updatedAt || incident.createdAt)}
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

          {/* Sticky Message Responder Footer Button */}
          <View style={styles.footerContainer}>
            <TouchableOpacity 
              style={[styles.messageButton, incident?.status === 'declined' && styles.disabledMessageButton]}
              onPress={() => navigation.navigate('ChatScreen', { alertId })}
              disabled={incident?.status === 'declined'}
              activeOpacity={incident?.status === 'declined' ? 1 : 0.8}
            >
              {incident?.status === 'declined' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="lock" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.messageButtonText}>Chat Locked (Report Declined)</Text>
                </View>
              ) : (
                <Text style={styles.messageButtonText}>Message Responder</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Image Viewer Popup Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setImageModalVisible(false);
          setSelectedImageUri(null);
        }}
      >
        <TouchableOpacity 
          style={styles.imageOverlay} 
          activeOpacity={1} 
          onPress={() => {
            setImageModalVisible(false);
            setSelectedImageUri(null);
          }}
        >
          <TouchableOpacity 
            style={styles.closeImageBtn}
            onPress={() => {
              setImageModalVisible(false);
              setSelectedImageUri(null);
            }}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {selectedImageUri && (
            <Image 
              source={{ uri: selectedImageUri }} 
              style={styles.fullImage} 
              resizeMode="contain" 
            />
          )}
        </TouchableOpacity>
      </Modal>

      {/* Tutorial Overlay App Tour */}
      {showTutorial && (
        <TutorialOverlay
          steps={trackerTourSteps}
          onFinish={handleFinishTutorial}
        />
      )}

      {/* Connection Loss Blocker for Citizens */}
      {!isOnline && <ConnectionBlocker navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  navHeader: {
    height: 64,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth soft shadow matching dashboard
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  statusTag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '700',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#0F2C59',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginTop: 20,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 120, // Ensure room for sticky footer button
  },
  responseBanner: {
    backgroundColor: '#E8F0FE',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D2E3FC',
  },
  responseBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2C59',
  },
  responseBannerText: {
    fontSize: 13,
    color: '#3C4043',
    lineHeight: 18,
    fontWeight: '500',
    marginTop: 2,
  },

  // ── Decline banner styles ─────────────────────────────────────────────
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

  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 20,
    // Smooth soft shadow matching dashboard
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 2,
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  reviewHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2C59',
  },
  reviewRow: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    paddingBottom: 8,
  },
  reviewLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    marginBottom: 2,
  },
  reviewValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    lineHeight: 20,
  },
  reviewThumbnailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
  },
  reviewThumbnailSquare: {
    width: 90,
    height: 90,
    borderRadius: 14,
    marginRight: 12,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  timelineSection: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  timelineHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 20,
  },
  timelineList: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 80,
  },
  nodeColumn: {
    alignItems: 'center',
    marginRight: 16,
  },
  circleNode: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleCompleted: {
    borderColor: '#0B2564',
    backgroundColor: '#0B2564',
  },
  circleActive: {
    borderColor: '#0B2564',
    backgroundColor: '#0B2564',
  },
  lineConnector: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  lineCompleted: {
    backgroundColor: '#0B2564',
  },
  stepDetails: {
    flex: 1,
    paddingTop: 2,
  },
  stepLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  stepLabelCompleted: {
    color: '#1F2937',
  },
  stepLabelActive: {
    color: '#1F2937',
  },
  stepTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '500',
  },
  stepDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '500',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#F3F4F6',
    zIndex: 10, // Sit on top of linear gradient
  },
  messageButton: {
    backgroundColor: '#0B2564',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // Smooth soft shadow matching dashboard primary buttons
    shadowColor: '#0B256440',
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
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 5,
  },
  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  closeImageBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  fullImage: {
    width: '90%',
    height: '75%',
  },
});
