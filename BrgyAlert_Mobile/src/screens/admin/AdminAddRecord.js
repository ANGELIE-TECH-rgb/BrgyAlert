import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../services/firebaseConfig';
import { useAuth } from '../../context/AuthContext';
import { selectImageFromLibrary, captureImageWithCamera } from '../../services/mediaService';
import GestureModal from '../../components/GestureModal';

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

export default function AdminAddRecord({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [saving, setSaving] = useState(false);
  const [formCategory, setFormCategory] = useState('General');
  const [formReporterName, setFormReporterName] = useState('');
  const [formPhoneNumber, setFormPhoneNumber] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formUrgency, setFormUrgency] = useState('medium');
  const [formStatus, setFormStatus] = useState('submitted');
  const [formAdminNotes, setFormAdminNotes] = useState('');
  const [formIncidentDate, setFormIncidentDate] = useState(new Date());
  const [evidenceUris, setEvidenceUris] = useState([]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);

  // Evidence Picker Logic
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
        if (evidenceUris.length >= 3) {
          Alert.alert('Limit Reached', 'You can attach a maximum of 3 image evidences.');
          return;
        }
        setEvidenceUris([...evidenceUris, uri]);
      }
    } catch (err) {
      console.log('Error picking evidence image:', err);
      Alert.alert('Error', 'Failed to attach image evidence.');
    }
  };

  const removeEvidence = (index) => {
    const updated = [...evidenceUris];
    updated.splice(index, 1);
    setEvidenceUris(updated);
  };

  // Upload to Firebase Storage
  const uploadEvidenceImage = async (uri, index) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const uid = user ? user.uid : 'admin_manual';
      const fileRef = ref(storage, `evidences/${uid}_${Date.now()}_${index}.jpg`);
      await uploadBytes(fileRef, blob);
      return await getDownloadURL(fileRef);
    } catch (err) {
      console.log('Upload image failed:', err);
      throw new Error('Failed to upload photo evidence.');
    }
  };

  // Save manual entry to database
  const handleSubmit = async () => {
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

    setSaving(true);
    try {
      // 1. Upload evidence images first if any
      const uploadedUrls = [];
      for (let i = 0; i < evidenceUris.length; i++) {
        const downloadUrl = await uploadEvidenceImage(evidenceUris[i], i);
        uploadedUrls.push(downloadUrl);
      }

      // 2. Prepare payload
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
        mediaUrls: uploadedUrls,
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

      Alert.alert('Success', 'Incident record has been manually logged successfully.', [
        { text: 'OK', onPress: () => navigation.navigate('AdminQueue') }
      ]);
    } catch (err) {
      console.log('Error adding manual alert:', err);
      Alert.alert('Error', 'Failed to save incident record. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const showDatePickerModal = () => {
    setShowDatePicker(true);
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

      {/* Custom Navigation Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Feather name="arrow-left" size={24} color="#0B2564" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Manual Record</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionSubtitle}>Add offline walk-ins, phone calls, or texts to the database.</Text>

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
                activeOpacity={0.7}
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
          placeholder="e.g. 0917XXXXXXX"
          placeholderTextColor="#9CA3AF"
          value={formPhoneNumber}
          onChangeText={setFormPhoneNumber}
          keyboardType="phone-pad"
        />

        {/* Location/Address */}
        <Text style={styles.fieldLabel}>Incident Location / Address *</Text>
        <TextInput
          style={styles.formInput}
          placeholder="e.g. Purok 4, near Barangay Hall"
          placeholderTextColor="#9CA3AF"
          value={formAddress}
          onChangeText={setFormAddress}
        />

        {/* Description Details */}
        <Text style={styles.fieldLabel}>Description / Details *</Text>
        <TextInput
          style={[styles.formInput, styles.multilineInput]}
          placeholder="What happened? Describe the incident details..."
          placeholderTextColor="#9CA3AF"
          value={formDetails}
          onChangeText={setFormDetails}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Urgency selection */}
        <Text style={styles.fieldLabel}>Urgency / Priority *</Text>
        <View style={styles.urgencyRow}>
          {URGENCY_LEVELS.map((level) => {
            const active = formUrgency === level.key;
            return (
              <TouchableOpacity
                key={level.key}
                style={[
                  styles.urgencyChip,
                  active && { backgroundColor: level.bg, borderColor: level.color, borderWidth: 1.5 }
                ]}
                onPress={() => setFormUrgency(level.key)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.urgencyChipText,
                  { color: active ? level.color : '#4B5563', fontWeight: active ? '700' : '500' }
                ]}>
                  {level.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Incident Date & Time Picker */}
        <Text style={styles.fieldLabel}>Incident Occurrence Time</Text>
        <View style={styles.datePickerRow}>
          <TouchableOpacity
            style={styles.pickerTriggerButton}
            onPress={showDatePickerModal}
            activeOpacity={0.8}
          >
            <Feather name="calendar" size={16} color="#0B2564" style={{ marginRight: 8 }} />
            <Text style={styles.pickerTriggerText}>
              {formIncidentDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerTriggerButton}
            onPress={() => setShowTimePicker(true)}
            activeOpacity={0.8}
          >
            <Feather name="clock" size={16} color="#0B2564" style={{ marginRight: 8 }} />
            <Text style={styles.pickerTriggerText}>
              {formIncidentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Proof / Evidence Attachment Section */}
        <Text style={styles.fieldLabel}>Proof / Evidence (Max 3 Images)</Text>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => setPickerModalVisible(true)}
          activeOpacity={0.8}
        >
          <Feather name="camera" size={20} color="#0B2564" style={{ marginRight: 8 }} />
          <Text style={styles.attachButtonText}>Attach Photo Evidence</Text>
        </TouchableOpacity>

        {evidenceUris.length > 0 && (
          <View style={styles.evidenceContainer}>
            {evidenceUris.map((uri, idx) => (
              <View key={idx} style={styles.evidenceWrapper}>
                <Image source={{ uri }} style={styles.evidenceThumbnail} />
                <TouchableOpacity
                  style={styles.deleteEvidenceBtn}
                  onPress={() => removeEvidence(idx)}
                  activeOpacity={0.8}
                >
                  <Feather name="x" size={12} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Initial Status Selection */}
        <Text style={styles.fieldLabel}>Initial Status *</Text>
        <View style={styles.statusChipsRow}>
          {STATUS_OPTS.map((opt) => {
            const active = formStatus === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.statusChip, active && styles.statusChipActive]}
                onPress={() => setFormStatus(opt.key)}
                activeOpacity={0.7}
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

        {/* Date/Time Pickers Logic */}
        {showDatePicker && (
          <RNDateTimePicker
            value={formIncidentDate}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) {
                setFormIncidentDate(selectedDate);
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

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.65 }]}
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save Record</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Image Picker Option Selector (Camera / Gallery) */}
      <GestureModal
        visible={pickerModalVisible}
        onClose={() => setPickerModalVisible(false)}
        title="Attach Evidence Photo"
      >
        <View style={styles.pickerModalContent}>
          <TouchableOpacity
            style={styles.pickerModalBtn}
            onPress={() => handleSelectImage(true)}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={22} color="#0B2564" style={{ marginRight: 12 }} />
            <Text style={styles.pickerModalBtnText}>Take Photo with Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pickerModalBtn}
            onPress={() => handleSelectImage(false)}
            activeOpacity={0.8}
          >
            <Feather name="image" size={22} color="#0B2564" style={{ marginRight: 12 }} />
            <Text style={styles.pickerModalBtnText}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickerModalBtn, { borderBottomWidth: 0, justifyContent: 'center' }]}
            onPress={() => setPickerModalVisible(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pickerModalBtnText, { color: '#EF4444' }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </GestureModal>
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
    alignItems: 'center',
    gap: 15,
    paddingHorizontal: 24,
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000ff',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 60,
  },
  sectionSubtitle: {
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
    minHeight: 100,
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
  datePickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerTriggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    width: '48%',
    justifyContent: 'center',
  },
  pickerTriggerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B2564',
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
  },
  attachButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B2564',
  },
  evidenceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  evidenceWrapper: {
    position: 'relative',
    marginRight: 12,
    marginBottom: 12,
  },
  evidenceThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  deleteEvidenceBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  statusChipTextActive: {
    color: '#10B981',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  cancelBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingVertical: 14,
    width: '45%',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4B5563',
  },
  saveBtn: {
    backgroundColor: '#0B2564',
    borderRadius: 16,
    paddingVertical: 14,
    width: '50%',
    alignItems: 'center',
    shadowColor: '#0B2564',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pickerModalContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  pickerModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerModalBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
});
