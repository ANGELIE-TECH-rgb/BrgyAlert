import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
  Alert,
  Linking,
  Animated,
  PanResponder,
  Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { db, storage } from '../../services/firebaseConfig';
import { getCurrentLocation } from '../../services/locationService';
import { selectImageFromLibrary, captureImageWithCamera } from '../../services/mediaService';
import GestureModal from '../../components/GestureModal';
import { predictIncidentAttributes, processIncidentSubmissionAI, isAiRateLimited } from '../../services/aiService';

const INCIDENT_TYPES = [
  'Physical Abuse',
  'Fire',
  'Flooding',
  'Medical',
  'Crime',
  'Accident',
  'General'
];

const CATEGORY_SMS_CODES = {
  'Physical Abuse': 'CR',
  'Crime': 'CR',
  'Fire': 'FE',
  'Flooding': 'FC',
  'Medical': 'ME',
  'Accident': 'AC',
  'General': 'GI'
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper to convert Blob to base64 string natively
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
};

export default function ReportWizard({ navigation }) {
  const { user, userProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [isOnline, setIsOnline] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form states
  const [incidentType, setIncidentType] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceUris, setEvidenceUris] = useState([]);
  const [witness, setWitness] = useState('');
  const [locationCoords, setLocationCoords] = useState({ latitude: 14.599512, longitude: 120.984222, addressText: 'Purok 1, Barangay Lepa' });
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [currentTimeText, setCurrentTimeText] = useState('');
  const [isCertified, setIsCertified] = useState(false);

  // AI Integration States
  const [urgency, setUrgency] = useState('medium');
  const [aiPrediction, setAiPrediction] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiLimitReached, setAiLimitReached] = useState(false);

  // Check rate limit on mount
  useEffect(() => {
    isAiRateLimited('citizen').then(limitReached => {
      setAiLimitReached(limitReached);
    });
  }, []);

  const handleApplyAiRecommendation = () => {
    if (!aiPrediction) return;
    
    // Auto-select Suggested Category
    if (INCIDENT_TYPES.includes(aiPrediction.category)) {
      setIncidentType(aiPrediction.category);
    }
    
    // Auto-select Suggested Urgency
    if (aiPrediction.urgency) {
      setUrgency(aiPrediction.urgency.toLowerCase());
    }
    
    // Clear the chip once applied to avoid redundancy
    setAiPrediction(null);
  };

  // Dynamic Progress Calculations
  const getStep1Progress = () => {
    let filled = 0;
    if (incidentType) filled++;
    if (description && description.trim().length >= 5) filled++;
    if (evidenceUris && evidenceUris.length > 0) filled++;
    return Math.round((filled / 3) * 50);
  };

  const getStep2Progress = () => {
    let filled = 0;
    if (isCertified) filled++;
    return 50 + Math.round((filled / 1) * 50);
  };

  const progress1 = getStep1Progress();
  const progress2 = getStep2Progress();

  const animatedProgress1 = useRef(new Animated.Value(0)).current;
  const animatedProgress2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedProgress1, {
      toValue: progress1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress1]);

  useEffect(() => {
    Animated.timing(animatedProgress2, {
      toValue: progress2,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress2]);

  const widthInterpolate1 = animatedProgress1.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const widthInterpolate2 = animatedProgress2.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Modals UI states
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [imageModalVisible, setImageModalVisible] = useState(false);

  // Monitor network and load location/time on mount
  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });

    const lockLocation = async () => {
      setLoadingLocation(true);
      const coords = await getCurrentLocation();
      setLocationCoords(coords);
      setLoadingLocation(false);
    };

    const formatTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }) + `, at ` + now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setCurrentTimeText(formatted);
    };

    lockLocation();
    formatTime();
    return () => unsubscribeNet();
  }, []);

  const handleSelectImage = async (useCamera = false) => {
    setPickerModalVisible(false);
    try {
      let uri = null;
      if (useCamera) {
        uri = await captureImageWithCamera();
      } else {
        uri = await selectImageFromLibrary();
      }
      if (uri) {
        // Double check compressed image file size limit (5MB)
        const response = await fetch(uri);
        const blob = await response.blob();
        if (blob.size > 5 * 1024 * 1024) {
          Alert.alert('File Size Limit', 'The image exceeds the 5MB size limit.');
          return;
        }

        if (evidenceUris.length >= 3) {
          Alert.alert('Limit Reached', 'You can attach a maximum of 3 image evidences.');
          return;
        }
        setEvidenceUris([...evidenceUris, uri]);
      }
    } catch (err) {
      console.log('Error attaching evidence:', err);
      if (err.message === 'Image size exceeds the 5MB limit.') {
        Alert.alert('File Size Limit', 'The selected image exceeds the 5MB size limit.');
      } else {
        Alert.alert('Evidence Attachment', 'Could not open camera/gallery permissions or picker.');
      }
    }
  };

  const handleNextStep = async () => {
    if (!incidentType) {
      setErrorMsg('Please select an Incident Type.');
      return;
    }
    if (!description || description.trim().length < 5) {
      setErrorMsg('Please provide a description (min. 5 characters).');
      return;
    }
    if (evidenceUris.length === 0) {
      setErrorMsg('Please attach at least one photo evidence.');
      return;
    }

    setErrorMsg('');

    // Check rate limit first so we can set warning banner state
    const limitReached = await isAiRateLimited('citizen');
    setAiLimitReached(limitReached);

    if (!limitReached && isOnline && description.trim().length >= 8) {
      setLoadingAi(true);
      setAiPrediction(null);
      // Trigger categorization prediction on-demand during Step 1 -> Step 2 transition
      predictIncidentAttributes(description, 'citizen')
        .then(prediction => {
          if (prediction) {
            let predictedCat = prediction.category;
            if (predictedCat === 'Flood') predictedCat = 'Flooding';
            
            setAiPrediction({
              ...prediction,
              category: predictedCat
            });
          }
        })
        .catch(err => {
          console.log('[ReportWizard] Error fetching AI predictions on Next:', err);
        })
        .finally(() => {
          setLoadingAi(false);
        });
    }

    setStep(2);
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else {
      navigation.goBack();
    }
  };

  const uploadEvidenceImage = async (uri, index) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const uid = user ? user.uid : 'guest';
      const fileRef = ref(storage, `evidences/${uid}_${Date.now()}_${index}.jpg`);
      await uploadBytes(fileRef, blob);
      
      const downloadUrl = await getDownloadURL(fileRef);
      return downloadUrl;
    } catch (err) {
      console.log('Firebase Storage upload failed:', err);
      throw new Error('Failed to upload photo evidence. Connection may be low or offline.');
    }
  };

  const triggerSmsFallback = () => {
    try {
      const categoryCode = CATEGORY_SMS_CODES[incidentType] || 'GI';
      const rawLocation = (locationCoords?.addressText || '').replace(/[!]/g, '');
      const rawDetails = (description || '').replace(/[!]/g, '');
      
      const smsPayload = `BA!${categoryCode}!${rawLocation}!${rawDetails}`;
      const gatewayNumber = '+639090000000';
      const smsUrl = `sms:${gatewayNumber}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(smsPayload)}`;

      Alert.alert(
        'Offline Mode Detected',
        'No cellular internet connection. We will compile your report into a compressed SMS to the Barangay gateway. Please press send on the next screen.',
        [
          {
            text: 'Open SMS Client',
            onPress: async () => {
              const supported = await Linking.canOpenURL(smsUrl);
              if (supported) {
                await Linking.openURL(smsUrl);
                navigation.navigate('ReportSuccess', {
                  reportId: 'OFFLINE_SMS',
                  estimatedTime: 'Waiting for SMS transmission'
                });
              } else {
                Alert.alert('SMS Error', 'Could not open native SMS client.');
              }
              setIsSubmitting(false);
            }
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setIsSubmitting(false)
          }
        ]
      );
    } catch (smsErr) {
      console.log('Offline SMS trigger failed:', smsErr);
      setErrorMsg('Could not initialize offline SMS fallback.');
      setIsSubmitting(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!isCertified) {
      setErrorMsg('Please certify that the information is true and accurate.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    if (isOnline) {
      try {
        const uploadUrls = [];
        const base64Images = [];

        // Concurrently read images as base64 for Gemini and upload to Firebase Storage
        await Promise.all(evidenceUris.map(async (uri, i) => {
          // Upload to storage
          const url = await uploadEvidenceImage(uri, i);
          uploadUrls.push(url);

          // Convert to base64 for Gemini multimodal input
          try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const b64 = await blobToBase64(blob);
            base64Images.push({
              data: b64,
              mimeType: 'image/jpeg'
            });
          } catch (b64Err) {
            console.log(`[ReportWizard] Failed converting image ${i} to base64:`, b64Err);
          }
        }));

        let generatedSummary = '';
        let isFlaggedFake = false;
        let combinedReason = '';
        let combinedConfidence = 'Low';

        // Check if rate limited first to avoid calling processIncidentSubmissionAI if we are already rate limited
        const limitReached = await isAiRateLimited('citizen');
        if (!limitReached) {
          try {
            const aiResult = await processIncidentSubmissionAI(description, incidentType, base64Images, 'citizen');
            if (aiResult.rateLimited) {
              setAiLimitReached(true);
            } else {
              generatedSummary = aiResult.summary;
              isFlaggedFake = aiResult.isFake || !aiResult.imageMatches;
              
              let reasonParts = [];
              if (aiResult.isFake && aiResult.textReasoning) {
                reasonParts.push(`Text: ${aiResult.textReasoning}`);
              }
              if (!aiResult.imageMatches && aiResult.imageReasoning) {
                reasonParts.push(`Larawan: ${aiResult.imageReasoning}`);
              }
              combinedReason = reasonParts.join(' | ');

              // Determine highest confidence
              let textConf = aiResult.textConfidence || 'Low';
              let imgConf = aiResult.imageConfidence || 'Low';
              if (textConf === 'High' || imgConf === 'High') {
                combinedConfidence = 'High';
              } else if (textConf === 'Medium' || imgConf === 'Medium') {
                combinedConfidence = 'Medium';
              }

              // Update the urgency and category states with prediction if they weren't manual
              if (aiResult.urgency) {
                setUrgency(aiResult.urgency.toLowerCase());
              }
              if (aiResult.category && INCIDENT_TYPES.includes(aiResult.category)) {
                setIncidentType(aiResult.category);
              }
            }
          } catch (aiErr) {
            console.log('[ReportWizard] Consolidated AI submission analysis failed:', aiErr);
          }
        } else {
          setAiLimitReached(true);
        }

        const payload = {
          userId: user ? user.uid : 'guest',
          reporterName: userProfile?.fullName || 'Anonymous Citizen',
          phoneNumber: userProfile?.phoneNumber || '',
          category: incidentType,
          details: description,
          witnessName: witness.trim() || 'None',
          location: {
            latitude: locationCoords.latitude,
            longitude: locationCoords.longitude,
            addressText: locationCoords.addressText
          },
          source: 'online_app',
          status: 'submitted',
          urgency: urgency, // Use dynamically set urgency state from AI prediction
          mediaUrls: uploadUrls,
          assignedResponders: [],
          aiSummary: generatedSummary || '',
          aiFlaggedFake: !!isFlaggedFake,
          aiFakeReason: combinedReason || '',
          aiValidityConfidence: combinedConfidence,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'alerts'), payload);
        navigation.navigate('ReportSuccess', { 
          reportId: docRef.id, 
          estimatedTime: '15 - 30 Minutes' 
        });
      } catch (err) {
        console.log('Online submit error:', err);
        setErrorMsg('Submission failed due to connection issues. Please try again.');
        
        Alert.alert(
          'Low Internet / Submission Failed',
          'We detected a weak internet connection or timeout. Would you like to compile this report into a compressed SMS to the Barangay gateway instead?',
          [
            { text: 'Submit via SMS', onPress: () => triggerSmsFallback() },
            { text: 'Try Again', style: 'cancel' }
          ]
        );
      } finally {
        setIsSubmitting(false);
      }
    } else {
      triggerSmsFallback();
    }
  };

  const renderStep1 = () => (
    <>
      <View style={styles.stepHeader}>
        <Text style={styles.stepText}>Step 1 of 2: Incident Details</Text>
        <Text style={styles.percentText}>{progress1}% Complete</Text>
      </View>
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { width: widthInterpolate1 }]} />
      </View>



      <View style={styles.formContainer}>
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {aiLimitReached ? (
          <View style={styles.aiLimitBanner}>
            <Ionicons name="warning-outline" size={16} color="#B45309" style={{ marginRight: 8 }} />
            <Text style={styles.aiLimitText}>
              ⚠️ AI features are temporarily limited for this hour. Your report will be processed manually.
            </Text>
          </View>
        ) : null}

        {/* AI Suggestion Chip */}
        {loadingAi && (
          <View style={styles.aiLoadingContainer}>
            <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: 8 }} />
            <Text style={styles.aiLoadingText}>AI is analyzing description...</Text>
          </View>
        )}

        {!loadingAi && aiPrediction && (aiPrediction.category !== incidentType || aiPrediction.urgency.toLowerCase() !== urgency) && (
          <TouchableOpacity 
            style={styles.aiSuggestionChip}
            onPress={handleApplyAiRecommendation}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={14} color="#2563EB" style={{ marginRight: 6 }} />
            <Text style={styles.aiSuggestionText}>
              AI recommends: <Text style={styles.aiSuggestionBold}>{aiPrediction.category} ({aiPrediction.urgency})</Text> — Tap to apply
            </Text>
          </TouchableOpacity>
        )}

        {/* Incident Type Picker */}
        <Text style={styles.label}>Incident Type <Text style={styles.req}>*</Text></Text>
        <TouchableOpacity style={styles.dropdown} onPress={() => setTypeModalVisible(true)}>
          <Text style={[styles.dropdownText, !incidentType && styles.dropdownPlaceholder]}>
            {incidentType || 'Select Incident Type'}
          </Text>
          <Feather name="chevron-down" size={20} color="#6B7280" />
        </TouchableOpacity>

        {/* Description */}
        <Text style={styles.label}>Description <Text style={styles.req}>*</Text></Text>
        <TextInput 
          style={styles.textArea}
          placeholder="Please Provide specific details about the incident..."
          placeholderTextColor="#9CA3AF"
          multiline={true}
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />

        {/* Evidence picker container */}
        <Text style={styles.label}>Evidence (Up to 3 photos) <Text style={styles.req}>*</Text></Text>
        <View style={styles.evidenceContainer}>
          {evidenceUris.map((uri, index) => (
            <View key={index} style={styles.thumbnailContainer}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setSelectedImageUri(uri);
                  setImageModalVisible(true);
                }}
                style={{ width: '100%', height: '100%' }}
              >
                <Image source={{ uri }} style={styles.thumbnailImage} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.thumbnailRemoveBtn} 
                onPress={() => {
                  const updated = [...evidenceUris];
                  updated.splice(index, 1);
                  setEvidenceUris(updated);
                }}
              >
                <Feather name="x" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}
          {evidenceUris.length < 3 && (
            <TouchableOpacity 
              style={styles.addEvidenceBtn} 
              onPress={() => setPickerModalVisible(true)}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={24} color="#2563EB" />
              <Text style={styles.addEvidenceText}>Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Witness Info */}
        <Text style={styles.label}>Witness <Text style={styles.optional}>Optional</Text></Text>
        <TextInput 
          style={styles.input}
          placeholder="Witness Name"
          placeholderTextColor="#9CA3AF"
          value={witness}
          onChangeText={setWitness}
        />

        {/* Locked GPS Location info box */}
        <View style={styles.metaContainer}>
          <Text style={styles.metaLabel}>Location: <Text style={styles.metaValue}>{loadingLocation ? 'Locking GPS...' : locationCoords.addressText}</Text></Text>
          <Text style={styles.metaLabel}>Date & Time: <Text style={styles.metaValue}>{currentTimeText}</Text></Text>
        </View>

        {/* Next Button */}
        <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep}>
          <Text style={styles.primaryButtonText}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* Incident Type Select Modal */}
      <GestureModal
        visible={typeModalVisible}
        onClose={() => setTypeModalVisible(false)}
        title="Select Incident Type"
      >
        <View style={{ maxHeight: 300 }}>
          <FlatList
            data={INCIDENT_TYPES}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.modalItem}
                onPress={() => {
                  setIncidentType(item);
                  setTypeModalVisible(false);
                }}
              >
                <Text style={styles.modalItemText}>{item}</Text>
                {incidentType === item && <Feather name="check" size={18} color="#0F2C59" />}
              </TouchableOpacity>
            )}
          />
        </View>
      </GestureModal>

      {/* Camera vs Gallery Media Picker Modal */}
      <GestureModal
        visible={pickerModalVisible}
        onClose={() => setPickerModalVisible(false)}
        title="Attach Photo Evidence"
      >
        <TouchableOpacity style={styles.mediaOptionButton} onPress={() => handleSelectImage(true)}>
          <Feather name="camera" size={20} color="#374151" style={{ marginRight: 12 }} />
          <Text style={styles.mediaOptionText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaOptionButton} onPress={() => handleSelectImage(false)}>
          <Feather name="image" size={20} color="#374151" style={{ marginRight: 12 }} />
          <Text style={styles.mediaOptionText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </GestureModal>
    </>
  );

  const renderStep2 = () => (
    <>
      <View style={styles.stepHeader}>
        <Text style={styles.stepText}>Step 2 of 2: Review Details</Text>
        <Text style={styles.percentText}>{progress2}% Complete</Text>
      </View>
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { width: widthInterpolate2 }]} />
      </View>



      <View style={styles.formContainer}>
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {aiLimitReached ? (
          <View style={styles.aiLimitBanner}>
            <Ionicons name="warning-outline" size={16} color="#B45309" style={{ marginRight: 8 }} />
            <Text style={styles.aiLimitText}>
              ⚠️ AI features are temporarily limited for this hour. Your report will be processed manually.
            </Text>
          </View>
        ) : null}

        {loadingAi && (
          <View style={styles.aiLoadingContainer}>
            <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: 8 }} />
            <Text style={styles.aiLoadingText}>AI is analyzing description...</Text>
          </View>
        )}

        {!loadingAi && aiPrediction && (aiPrediction.category !== incidentType || aiPrediction.urgency.toLowerCase() !== urgency) && (
          <TouchableOpacity 
            style={styles.aiSuggestionChip}
            onPress={handleApplyAiRecommendation}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={14} color="#2563EB" style={{ marginRight: 6 }} />
            <Text style={styles.aiSuggestionText}>
              AI recommends: <Text style={styles.aiSuggestionBold}>{aiPrediction.category} ({aiPrediction.urgency})</Text> — Tap to apply
            </Text>
          </TouchableOpacity>
        )}

        {/* Read-Only Details Card */}
        <View style={styles.reviewCard}>
          <View style={styles.reviewHeaderRow}>
            <Feather name="alert-triangle" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
            <Text style={styles.reviewHeader}>Incident Details</Text>
          </View>
          
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Incident Type</Text>
            <Text style={styles.reviewValue}>{incidentType}</Text>
          </View>
          
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Location</Text>
            <Text style={styles.reviewValue}>{locationCoords.addressText}</Text>
          </View>

          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Date & Time</Text>
            <Text style={styles.reviewValue}>{currentTimeText}</Text>
          </View>

          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Description</Text>
            <Text style={styles.reviewValue}>{description}</Text>
          </View>

          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Witness</Text>
            <Text style={styles.reviewValue}>{witness || 'None'}</Text>
          </View>
        </View>

        {/* Evidence Thumbnail Preview */}
        <View style={styles.reviewCard}>
          <View style={styles.reviewHeaderRow}>
            <Feather name="image" size={18} color="#0F2C59" style={{ marginRight: 8 }} />
            <Text style={styles.reviewHeader}>Evidence</Text>
          </View>
          {evidenceUris.length > 0 ? (
            <View style={styles.reviewThumbnailsRow}>
              {evidenceUris.map((uri, index) => (
                <TouchableOpacity 
                  key={index} 
                  activeOpacity={0.9} 
                  onPress={() => {
                    setSelectedImageUri(uri);
                    setImageModalVisible(true);
                  }}
                >
                  <Image source={{ uri }} style={styles.reviewThumbnailSquare} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.reviewValue}>No photos attached</Text>
          )}
        </View>

        {/* Certification Checkbox */}
        <TouchableOpacity 
          style={[styles.checkboxContainer, isCertified && styles.checkboxContainerSelected]}
          onPress={() => setIsCertified(!isCertified)}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, isCertified && styles.checkboxSelected]}>
            {isCertified ? <Feather name="check" size={12} color="#FFFFFF" /> : null}
          </View>
          <Text style={styles.checkboxLabel}>
            I certify that the information provided is true and accurate. I understand that submitting false reports may lead to penalties.
          </Text>
        </TouchableOpacity>

        {/* Submit Button */}
        <TouchableOpacity 
          style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]} 
          onPress={handleSubmitReport}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Submit Report</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} disabled={isSubmitting}>
          <Feather name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{step === 1 ? 'File a report' : 'Review report'}</Text>
          <Text style={styles.headerSubtitle}>{currentTimeText.split(',')[0]}</Text>
        </View>
        
        {/* Connection status banner indicator */}
        <View style={styles.statusDotRow}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22C55E' : '#EF4444' }]} />
          <Text style={styles.statusDotText}>{isOnline ? 'Online' : 'Offline Mode'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 1 ? renderStep1() : renderStep2()}
        </ScrollView>
      </KeyboardAvoidingView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  navHeader: {
    height: 56,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth, very faint soft shadow
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  stepText: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
  },
  percentText: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    marginTop: 8,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0B2564',
    borderRadius: 3,
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
  formContainer: {
    width: '100%',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  req: {
    color: '#EF4444',
  },
  optional: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: 'normal',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
    height: 120,
  },
  dropdown: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    fontSize: 16,
    color: '#1F2937',
  },
  dropdownPlaceholder: {
    color: '#9CA3AF',
  },
  evidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  thumbnailContainer: {
    width: 90,
    height: 90,
    borderRadius: 14,
    marginRight: 12,
    marginBottom: 12,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    resizeMode: 'cover',
  },
  thumbnailRemoveBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  addEvidenceBtn: {
    width: 90,
    height: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 12,
  },
  addEvidenceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
  metaContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  metaValue: {
    fontWeight: '500',
    color: '#6B7280',
  },
  primaryButton: {
    backgroundColor: '#0F2C59',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    shadowColor: '#0F2C5940',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  primaryButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 16,
    // Smooth, very soft shadow
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
  checkboxContainer: {
    flexDirection: 'row',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    alignItems: 'flex-start',
    marginVertical: 12,
  },
  checkboxContainerSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#FFFFFF',
    marginTop: 2,
  },
  checkboxSelected: {
    borderColor: '#0F2C59',
    backgroundColor: '#0F2C59',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  dragHandleContainer: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '600',
  },
  mediaOptionButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  mediaOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
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
  aiSuggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  aiSuggestionText: {
    fontSize: 12,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  aiSuggestionBold: {
    fontWeight: '800',
  },
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  aiLoadingText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  aiLimitBanner: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCD34D',
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiLimitText: {
    color: '#B45309',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
