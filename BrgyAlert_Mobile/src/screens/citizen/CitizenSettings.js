import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Switch,
  Alert,
  Modal,
  Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useAuth } from '../../context/AuthContext';
import { db, auth } from '../../services/firebaseConfig';
import BottomTabNav from '../../components/BottomTabNav';
import GestureModal from '../../components/GestureModal';

export default function CitizenSettings({ navigation }) {
  const { user, userProfile, logout, resetPassword, sendVerificationEmail } = useAuth();
  const insets = useSafeAreaInsets();

  // Profile Form States
  const [fullName, setFullName] = useState(userProfile?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(userProfile?.phoneNumber || '');
  const [dob, setDob] = useState(userProfile?.dob || '');
  const [gender, setGender] = useState(userProfile?.gender || 'Male'); // Male | Female | Other

  const [saving, setSaving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Change Password States
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Legal Modals
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalModalType, setLegalModalType] = useState('terms'); // terms | privacy
  const [resendingVerification, setResendingVerification] = useState(false);

  // Load preferences on load
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const soundPref = await AsyncStorage.getItem('soundEnabled');
        if (soundPref !== null) {
          setSoundEnabled(soundPref === 'true');
        }
        const pushPref = await AsyncStorage.getItem('pushEnabled');
        if (pushPref !== null) {
          setPushEnabled(pushPref === 'true');
        }
      } catch (err) {
        console.log('Error loading preferences:', err);
      }
    };
    loadPrefs();
  }, []);

  // Update states if userProfile changes
  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.fullName || '');
      setPhoneNumber(userProfile.phoneNumber || '');
      setDob(userProfile.dob || '');
      setGender(userProfile.gender || 'Male');
    }
  }, [userProfile]);

  // Initials for avatar
  const getInitials = () => {
    if (!fullName) return 'C';
    const parts = fullName.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  // Handle Profile Save
  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Full Name is required.');
      return;
    }
    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        dob: dob.trim(),
        gender: gender,
      });
      Alert.alert('Success', 'Profile updated successfully.');
      setIsEditing(false);
    } catch (error) {
      console.log('Error saving profile:', error);
      Alert.alert('Error', 'Could not update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle Password Reset
  const handlePasswordReset = () => {
    if (!user?.email) return;
    Alert.alert(
      'Reset Password',
      'Would you like to receive a password reset link at ' + user.email + '?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              await resetPassword(user.email);
              Alert.alert('Email Sent', 'A password reset link has been dispatched to your email.');
            } catch (err) {
              Alert.alert('Error', err.message || 'Could not send reset email.');
            }
          }
        }
      ]
    );
  };

  // Toggle Sound Preference
  const handleToggleSound = async (val) => {
    setSoundEnabled(val);
    try {
      await AsyncStorage.setItem('soundEnabled', String(val));
    } catch (err) {
      console.log('Error saving sound preference:', err);
    }
  };

  // Toggle Push Preference
  const handleTogglePush = async (val) => {
    setPushEnabled(val);
    try {
      await AsyncStorage.setItem('pushEnabled', String(val));
    } catch (err) {
      console.log('Error saving push preference:', err);
    }
  };

  // Direct In-App Change Password Logic
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Validation Error', 'All password fields are required.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Validation Error', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      const activeUser = auth.currentUser;
      if (!activeUser || !activeUser.email) {
        throw new Error('No active authenticated user found.');
      }
      
      const credential = EmailAuthProvider.credential(activeUser.email, currentPassword);
      await reauthenticateWithCredential(activeUser, credential);
      await updatePassword(activeUser, newPassword);
      
      Alert.alert('Success', 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePasswordModal(false);
    } catch (error) {
      console.log('Error changing password:', error);
      let errMsg = 'Could not change password. Please verify your current password.';
      if (error.code === 'auth/wrong-password') {
        errMsg = 'Incorrect current password. Please try again.';
      } else if (error.code === 'auth/weak-password') {
        errMsg = 'The new password is too weak. Please use a stronger password.';
      }
      Alert.alert('Error', errMsg);
    } finally {
      setChangingPassword(false);
    }
  };

  // Resend Email Verification
  const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
      await sendVerificationEmail();
      Alert.alert('Verification Sent', 'A verification email link has been sent to ' + user.email);
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not send verification email.');
    } finally {
      setResendingVerification(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of BrgyAlert?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => logout() }
      ]
    );
  };

  // Handle Replay Tour
  const handleReplayTour = async () => {
    try {
      await AsyncStorage.removeItem('hasSeenDashboardTutorial');
      Alert.alert('Tour Reset', 'App tour has been reset. Returning to dashboard...');
      navigation.navigate('CitizenHome');
    } catch (err) {
      console.log('Error resetting tutorial state:', err);
      Alert.alert('Error', 'Could not reset the app tour.');
    }
  };

  const openLegalModal = (type) => {
    setLegalModalType(type);
    setLegalModalVisible(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Block */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Profile Card Summary */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGradient}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{fullName || 'Citizen User'}</Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Citizen Portal</Text>
              </View>
              {user?.emailVerified ? (
                <View style={[styles.verificationBadge, { backgroundColor: '#10B98120' }]}>
                  <Feather name="check-circle" size={10} color="#10B981" style={{ marginRight: 3 }} />
                  <Text style={[styles.verificationBadgeText, { color: '#10B981' }]}>Verified</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.verificationBadge, { backgroundColor: '#F59E0B20' }]}
                  onPress={handleResendVerification}
                  disabled={resendingVerification}
                >
                  <Feather name="alert-triangle" size={10} color="#F59E0B" style={{ marginRight: 3 }} />
                  <Text style={[styles.verificationBadgeText, { color: '#F59E0B' }]}>
                    {resendingVerification ? 'Sending...' : 'Unverified • Verify Now'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Profile Details Form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          <View style={styles.card}>
            {!isEditing ? (
              <View>
                <View style={styles.profileDetailRow}>
                  <Text style={styles.detailLabel}>Full Name</Text>
                  <Text style={styles.detailValue}>{fullName || 'Not Set'}</Text>
                </View>
                <View style={styles.profileDetailRow}>
                  <Text style={styles.detailLabel}>Phone Number</Text>
                  <Text style={styles.detailValue}>{phoneNumber || 'Not Set'}</Text>
                </View>
                <View style={styles.profileDetailRow}>
                  <Text style={styles.detailLabel}>Date of Birth</Text>
                  <Text style={styles.detailValue}>{dob || 'Not Set'}</Text>
                </View>
                <View style={[styles.profileDetailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.detailLabel}>Gender</Text>
                  <Text style={styles.detailValue}>{gender || 'Not Set'}</Text>
                </View>

                <TouchableOpacity
                  style={styles.editProfileButton}
                  onPress={() => setIsEditing(true)}
                  activeOpacity={0.7}
                >
                  <Feather name="edit-2" size={14} color="#0F2C59" style={{ marginRight: 6 }} />
                  <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your Full Name"
                  placeholderTextColor="#9CA3AF"
                />

                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="e.g. 09123456789"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Date of Birth</Text>
                <TextInput
                  style={styles.input}
                  value={dob}
                  onChangeText={setDob}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                />

                <Text style={styles.inputLabel}>Gender</Text>
                <View style={styles.genderRow}>
                  {['Male', 'Female', 'Other'].map((item) => {
                    const isSelected = gender === item;
                    return (
                      <TouchableOpacity
                        key={item}
                        style={[styles.genderChip, isSelected && styles.genderChipActive]}
                        onPress={() => setGender(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.genderChipText, isSelected && styles.genderChipTextActive]}>
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.saveButton, { flex: 2, marginRight: 8 }]}
                    onPress={handleSaveProfile}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setFullName(userProfile?.fullName || '');
                      setPhoneNumber(userProfile?.phoneNumber || '');
                      setDob(userProfile?.dob || '');
                      setGender(userProfile?.gender || 'Male');
                      setIsEditing(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.card}>
            
            {/* Sound Chimes Row */}
            <View style={styles.settingRow}>
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                  <Feather name="volume-2" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Notification Chime</Text>
                  <Text style={styles.settingSubtitle}>Play sound for new alerts</Text>
                </View>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={handleToggleSound}
                trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
                thumbColor={soundEnabled ? '#2563EB' : '#9CA3AF'}
              />
            </View>

            {/* Push Notifications Row */}
            <View style={[styles.settingRow, styles.borderTop]}>
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#EEF2F6' }]}>
                  <Feather name="bell" size={18} color="#475569" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Push Notifications</Text>
                  <Text style={styles.settingSubtitle}>Receive real-time system alerts</Text>
                </View>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={handleTogglePush}
                trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
                thumbColor={pushEnabled ? '#2563EB' : '#9CA3AF'}
              />
            </View>

            {/* Reset Password Row */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={handlePasswordReset}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#FFF9E6' }]}>
                  <Feather name="lock" size={18} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Reset Password</Text>
                  <Text style={styles.settingSubtitle}>Send password reset email link</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Change Password Row */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={() => setShowChangePasswordModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#F3F4F6' }]}>
                  <Feather name="key" size={18} color="#4B5563" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Change Password</Text>
                  <Text style={styles.settingSubtitle}>Update your password directly in-app</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Replay App Tour Row */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={handleReplayTour}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                  <Feather name="help-circle" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Replay App Tour</Text>
                  <Text style={styles.settingSubtitle}>Show step-by-step interactive overlay</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

          </View>
        </View>

        {/* ─── Support & Legal ──────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & Legal</Text>
          <View style={styles.card}>

            {/* Contact Support */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => Linking.openURL('mailto:support@brgylert.ph?subject=BrgyAlert%20Support')}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                  <Feather name="mail" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Contact Support</Text>
                  <Text style={styles.settingSubtitle}>Email us for help or inquiries</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Privacy Policy */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={() => openLegalModal('privacy')}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#ECFDF5' }]}>
                  <Feather name="shield" size={18} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Privacy Policy</Text>
                  <Text style={styles.settingSubtitle}>How we handle your data</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Terms of Service */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={() => openLegalModal('terms')}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#FFF9E6' }]}>
                  <Feather name="file-text" size={18} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Terms of Service</Text>
                  <Text style={styles.settingSubtitle}>Usage rules and responsibilities</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Report a Bug */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={() => Linking.openURL('mailto:bugs@brgylert.ph?subject=Bug%20Report%20-%20BrgyAlert%20Mobile')}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#FEF2F2' }]}>
                  <Feather name="alert-circle" size={18} color="#EF4444" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Report a Bug</Text>
                  <Text style={styles.settingSubtitle}>Help us improve the app</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

          </View>
        </View>

        {/* System Information */}
        <View style={styles.infoWrapper}>
          <Text style={styles.infoText}>BrgyAlert Mobile • Version 1.0.0</Text>
        </View>

        {/* Danger/Sign Out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.signOutButtonText}>Sign Out Account</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={showChangePasswordModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChangePasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalOverlayDismiss}
            activeOpacity={1}
            onPress={() => setShowChangePasswordModal(false)}
          />
          <View style={styles.passwordModalContent}>
            
            {/* Header */}
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderTitleGroup}>
                <Feather name="key" size={20} color="#0F2C59" style={{ marginRight: 8 }} />
                <Text style={styles.modalHeaderTitle}>Change Password</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowChangePasswordModal(false)}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInstructionText}>
              Please enter your current password to verify identity, followed by your new password.
            </Text>

            {/* Inputs */}
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>Current Password</Text>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
              />

              <Text style={styles.inputLabel}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
              />

              <Text style={styles.inputLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
              />
            </View>

            {/* Actions */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.saveButton, { flex: 2, marginRight: 8 }]}
                onPress={handleChangePassword}
                disabled={changingPassword}
                activeOpacity={0.8}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Update Password</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setShowChangePasswordModal(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      {/* Legal Scrollable Gesture Modals */}
      <GestureModal
        visible={legalModalVisible}
        onClose={() => setLegalModalVisible(false)}
        title={legalModalType === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
      >
        <ScrollView style={styles.legalScroll} showsVerticalScrollIndicator={false}>
          {legalModalType === 'privacy' ? (
            <View style={styles.legalTextContainer}>
              <Text style={styles.legalHeading}>1. Information We Collect</Text>
              <Text style={styles.legalBody}>
                BrgyAlert collects incident reports, real-time location data when reporting emergencies, and contact profiles (Full Name, Phone Number) to facilitate direct communication with authorized barangay responders.
              </Text>
              <Text style={styles.legalHeading}>2. How We Use Information</Text>
              <Text style={styles.legalBody}>
                Your data is exclusively utilized to dispatch public safety personnel (police, medical, fire) to emergency sites and coordinate rescue response.
              </Text>
              <Text style={styles.legalHeading}>3. Data Protection</Text>
              <Text style={styles.legalBody}>
                We employ secure database access protocols and encryption. Your credentials and personally identifiable data are never leased or sold to third-party tracking services or marketing agencies.
              </Text>
              <Text style={styles.legalHeading}>4. Revisions</Text>
              <Text style={styles.legalBody}>
                We reserve the right to modify this Privacy Policy. Continued usage signifies agreement with our updated safety terms.
              </Text>
            </View>
          ) : (
            <View style={styles.legalTextContainer}>
              <Text style={styles.legalHeading}>1. Code of Conduct</Text>
              <Text style={styles.legalBody}>
                You agree to report emergency incidents truthfully, responsibly, and to the best of your knowledge. Submission of intentionally falsified emergencies is illegal under Philippine law (PD 1727) and will result in permanent account ban.
              </Text>
              <Text style={styles.legalHeading}>2. Service Limitations</Text>
              <Text style={styles.legalBody}>
                BrgyAlert is a coordination tool. We do not guarantee instant physical presence of responders and are not liable for network latency or connection outages during severe natural disasters.
              </Text>
              <Text style={styles.legalHeading}>3. Account Liability</Text>
              <Text style={styles.legalBody}>
                You are solely responsible for keeping your credentials safe. Do not share your login credentials with others.
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.legalCloseButton}
            onPress={() => setLegalModalVisible(false)}
          >
            <Text style={styles.legalCloseButtonText}>I Understand</Text>
          </TouchableOpacity>
        </ScrollView>
      </GestureModal>

      {/* Bottom Smooth Gradient Background Fade */}
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

      {/* Floating Bottom Nav */}
      <BottomTabNav />

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
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 140,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 5,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    backgroundColor: '#0F2C59',
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
    shadowColor: '#0F2C59',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatarGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E8F0FE',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2C59',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0F2C59',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileEmail: {
    fontSize: 13,
    color: '#93C5FD',
    marginTop: 2,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  roleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  verificationBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  verificationBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 6,
    paddingLeft: 2,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 16,
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  genderChip: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  genderChipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#0F2C59',
  },
  genderChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  genderChipTextActive: {
    color: '#0F2C59',
  },
  saveButton: {
    backgroundColor: '#0F2C59',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 8,
    paddingTop: 16,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  settingSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  infoWrapper: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 16,
    height: 48,
  },
  signOutButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  profileDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '700',
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    height: 42,
    marginTop: 12,
  },
  editProfileButtonText: {
    color: '#0F2C59',
    fontSize: 13,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalOverlayDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  passwordModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2C59',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalInstructionText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 20,
    lineHeight: 18,
  },
  legalScroll: {
    maxHeight: 400,
    paddingTop: 8,
  },
  legalTextContainer: {
    marginBottom: 24,
  },
  legalHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2C59',
    marginTop: 16,
    marginBottom: 6,
  },
  legalBody: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  legalCloseButton: {
    backgroundColor: '#0F2C59',
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  legalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
