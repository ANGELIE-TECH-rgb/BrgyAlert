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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useAuth } from '../../context/AuthContext';
import { db, auth } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';

export default function AdminSettings({ navigation }) {
  const { user, userProfile, logout, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();

  // Profile Form States
  const [fullName, setFullName] = useState(userProfile?.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(userProfile?.phoneNumber || '');
  const [dob, setDob] = useState(userProfile?.dob || '');
  const [gender, setGender] = useState(userProfile?.gender || 'Male'); // Male | Female | Other

  const [savingProfile, setSavingProfile] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  // Change Password States
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Barangay Configuration States
  const [barangayName, setBarangayName] = useState('Barangay Lepa');
  const [hotlinePolice, setHotlinePolice] = useState('');
  const [hotlineFire, setHotlineFire] = useState('');
  const [hotlineAmbulance, setHotlineAmbulance] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Load local sound preference on load
  useEffect(() => {
    const loadSoundPref = async () => {
      try {
        const pref = await AsyncStorage.getItem('soundEnabled');
        if (pref !== null) {
          setSoundEnabled(pref === 'true');
        }
      } catch (err) {
        console.log('Error loading sound preference:', err);
      }
    };
    loadSoundPref();
  }, []);

  // Fetch Barangay Configuration on load
  useEffect(() => {
    const fetchBarangayConfig = async () => {
      try {
        const docRef = doc(db, 'config', 'barangay');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBarangayName(data.barangayName || 'Barangay Lepa');
          setHotlinePolice(data.hotlinePolice || '');
          setHotlineFire(data.hotlineFire || '');
          setHotlineAmbulance(data.hotlineAmbulance || '');
        }
      } catch (err) {
        console.log('Error fetching barangay config:', err);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchBarangayConfig();
  }, []);

  // Update profile states if userProfile changes
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
    if (!fullName) return 'A';
    const parts = fullName.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  const getRoleLabel = () => {
    if (userProfile?.role === 'admin') return 'Admin Portal';
    if (userProfile?.role === 'responder') return 'Responder Portal';
    return 'Barangay Command Center';
  };

  // Handle Profile Save
  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Full Name is required.');
      return;
    }
    setSavingProfile(true);
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
      setSavingProfile(false);
    }
  };

  // Handle Barangay Config Save
  const handleSaveBarangayConfig = async () => {
    if (!barangayName.trim()) {
      Alert.alert('Validation Error', 'Barangay Name is required.');
      return;
    }
    setSavingConfig(true);
    try {
      const docRef = doc(db, 'config', 'barangay');
      await setDoc(docRef, {
        barangayName: barangayName.trim(),
        hotlinePolice: hotlinePolice.trim(),
        hotlineFire: hotlineFire.trim(),
        hotlineAmbulance: hotlineAmbulance.trim(),
      }, { merge: true });
      Alert.alert('Success', 'Barangay configurations updated successfully.');
    } catch (error) {
      console.log('Error saving barangay config:', error);
      Alert.alert('Error', 'Could not update Barangay configurations. Please try again.');
    } finally {
      setSavingConfig(false);
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

  // Handle Sign Out
  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of BrgyAlert Admin Console?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => logout() }
      ]
    );
  };

  // Handle Replay Tour
  const handleReplayTour = async () => {
    try {
      await AsyncStorage.removeItem('hasSeenAdminTutorial');
      Alert.alert('Tour Reset', 'Admin tour has been reset. Returning to command console...');
      navigation.navigate('AdminHome');
    } catch (err) {
      console.log('Error resetting tutorial state:', err);
      Alert.alert('Error', 'Could not reset the app tour.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Block */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Profile Card Summary */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{fullName || 'Admin User'}</Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{getRoleLabel()}</Text>
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
                    disabled={savingProfile}
                    activeOpacity={0.8}
                  >
                    {savingProfile ? (
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

        {/* Barangay Configuration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Barangay Configurations</Text>
          <View style={styles.card}>
            {loadingConfig ? (
              <ActivityIndicator size="small" color="#0F2C59" style={{ marginVertical: 20 }} />
            ) : (
              <>
                <Text style={styles.inputLabel}>Barangay Name</Text>
                <TextInput
                  style={styles.input}
                  value={barangayName}
                  onChangeText={setBarangayName}
                  placeholder="Barangay Lepa"
                  placeholderTextColor="#9CA3AF"
                />

                <Text style={styles.inputLabel}>Police Hotline</Text>
                <TextInput
                  style={styles.input}
                  value={hotlinePolice}
                  onChangeText={setHotlinePolice}
                  placeholder="e.g. 911 / (02) 8123-4567"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Fire Station Hotline</Text>
                <TextInput
                  style={styles.input}
                  value={hotlineFire}
                  onChangeText={setHotlineFire}
                  placeholder="e.g. (02) 8927-7278"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Medical / Ambulance Hotline</Text>
                <TextInput
                  style={styles.input}
                  value={hotlineAmbulance}
                  onChangeText={setHotlineAmbulance}
                  placeholder="e.g. (02) 8888-1234"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveBarangayConfig}
                  disabled={savingConfig}
                  activeOpacity={0.8}
                >
                  {savingConfig ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Barangay Settings</Text>
                  )}
                </TouchableOpacity>
              </>
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
              onPress={() => Linking.openURL('mailto:support@brgylert.ph?subject=BrgyAlert%20Admin%20Support')}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                  <Feather name="mail" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Contact Support</Text>
                  <Text style={styles.settingSubtitle}>Email the BrgyAlert team</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Privacy Policy */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={() =>
                Alert.alert(
                  'Privacy Policy',
                  'BrgyAlert collects incident reports, location data, and profile information solely to provide barangay emergency response services. Admin data is restricted to authorized Command Center personnel.',
                  [{ text: 'Got it' }]
                )
              }
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
              onPress={() =>
                Alert.alert(
                  'Terms of Service',
                  'Admin users of BrgyAlert are bound to handle citizen data confidentially and responsibly. Unauthorized access, misuse of data, or false status updates are grounds for account suspension.',
                  [{ text: 'Understood' }]
                )
              }
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#FFF9E6' }]}>
                  <Feather name="file-text" size={18} color="#D97706" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Terms of Service</Text>
                  <Text style={styles.settingSubtitle}>Admin usage rules</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            {/* Report a Bug */}
            <TouchableOpacity
              style={[styles.settingRow, styles.borderTop]}
              onPress={() => Linking.openURL('mailto:bugs@brgylert.ph?subject=Bug%20Report%20-%20BrgyAlert%20Admin')}
              activeOpacity={0.7}
            >
              <View style={styles.settingRowLeft}>
                <View style={[styles.rowIconWrapper, { backgroundColor: '#FEF2F2' }]}>
                  <Feather name="alert-circle" size={18} color="#EF4444" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Report a Bug</Text>
                  <Text style={styles.settingSubtitle}>Help us improve the admin console</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>

          </View>
        </View>

        {/* System Information */}
        <View style={styles.infoWrapper}>
          <Text style={styles.infoText}>BrgyAlert Command • Version 1.0.0</Text>
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
    paddingBottom: 140, // Space for floating bottom nav
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
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2C59',
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
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
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
});
