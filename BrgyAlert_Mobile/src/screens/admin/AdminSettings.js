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
  Linking,
  Animated
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useAuth } from '../../context/AuthContext';
import { db, auth } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';
import BottomGradient from '../../components/BottomGradient';
import GestureModal from '../../components/GestureModal';

export default function AdminSettings({ navigation }) {
  const { user, userProfile, logout, resetPassword, updateUserRole } = useAuth();
  const insets = useSafeAreaInsets();

  // Smooth entrance animations
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(20)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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

  // User Role Management States (admin-only)
  const [searchEmail, setSearchEmail] = useState('');
  const [searchedUser, setSearchedUser] = useState(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [newUserRole, setNewUserRole] = useState('');
  const [savingRole, setSavingRole] = useState(false);

  // Barangay Configuration States
  const [barangayName, setBarangayName] = useState('Barangay Lepa');
  const [hotlinePolice, setHotlinePolice] = useState('');
  const [hotlineFire, setHotlineFire] = useState('');
  const [hotlineAmbulance, setHotlineAmbulance] = useState('');
  const [smsGateways, setSmsGateways] = useState(['', '', '', '', '']);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Response Time Config
  const [responseTimeValue, setResponseTimeValue] = useState('15-30 mins');
  const [savingResponseTime, setSavingResponseTime] = useState(false);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [backupConfig, setBackupConfig] = useState(null);

  // Legal Modals
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalModalType, setLegalModalType] = useState('terms'); // terms | privacy
  const [signingOut, setSigningOut] = useState(false);

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

  // Fetch Barangay Configuration and Response Time Config on load
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        // 1. Barangay basic hotlines
        const docRef = doc(db, 'config', 'barangay');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBarangayName(data.barangayName || 'Barangay Lepa');
          setHotlinePolice(data.hotlinePolice || '');
          setHotlineFire(data.hotlineFire || '');
          setHotlineAmbulance(data.hotlineAmbulance || '');

          if (data.smsGateways && Array.isArray(data.smsGateways)) {
            const padded = [...data.smsGateways];
            while (padded.length < 5) padded.push('');
            setSmsGateways(padded);
          } else {
            setSmsGateways(['', '', '', '', '']);
          }
        }

        // 2. Response time
        const responseTimeRef = doc(db, 'brgyConfig', 'responseTimeConfig');
        const responseTimeSnap = await getDoc(responseTimeRef);
        if (responseTimeSnap.exists()) {
          setResponseTimeValue(responseTimeSnap.data().value || '15-30 mins');
        }
      } catch (err) {
        console.log('Error fetching barangay configurations:', err);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchConfigs();
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

  // Handle Barangay Config Save (Combined)
  const handleSaveBarangayConfig = async () => {
    if (!barangayName.trim()) {
      Alert.alert('Validation Error', 'Barangay Name is required.');
      return;
    }
    setSavingConfig(true);
    try {
      // 1. Save hotlines and SMS gateways
      const docRef = doc(db, 'config', 'barangay');
      const cleanedGateways = smsGateways
        .map(num => num.trim())
        .filter(num => num.length > 0);

      await setDoc(docRef, {
        barangayName: barangayName.trim(),
        hotlinePolice: hotlinePolice.trim(),
        hotlineFire: hotlineFire.trim(),
        hotlineAmbulance: hotlineAmbulance.trim(),
        smsGateways: cleanedGateways,
      }, { merge: true });

      // 2. Save Response Time Config
      const responseTimeRef = doc(db, 'brgyConfig', 'responseTimeConfig');
      await setDoc(responseTimeRef, {
        value: responseTimeValue.trim(),
      }, { merge: true });

      Alert.alert('Success', 'Barangay configurations updated successfully.');
      setIsEditingConfig(false);
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

  // Search User by Email (admin-only)
  const handleSearchUser = async () => {
    if (!searchEmail.trim()) {
      Alert.alert('Validation Error', 'Please enter an email address to search.');
      return;
    }
    setSearchingUser(true);
    setSearchedUser(null);
    try {
      const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        Alert.alert('Not Found', 'No user found with the specified email address.');
      } else {
        const docObj = snap.docs[0];
        const data = docObj.data();
        setSearchedUser({ id: docObj.id, ...data });
        setNewUserRole(data.role || 'citizen');
      }
    } catch (err) {
      console.log('Error searching user:', err);
      Alert.alert('Error', 'Failed to query user.');
    } finally {
      setSearchingUser(false);
    }
  };

  // Update user role using the existing updateUserRole from AuthContext
  const handleUpdateUserRole = async () => {
    if (!searchedUser || !newUserRole) return;
    if (newUserRole === searchedUser.role) {
      Alert.alert('No Change', 'The selected role is the same as the current role.');
      return;
    }
    Alert.alert(
      'Confirm Role Change',
      `Change ${searchedUser.fullName || searchedUser.email}'s role from "${searchedUser.role}" to "${newUserRole}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            setSavingRole(true);
            try {
              await updateUserRole(searchedUser.id, newUserRole);
              setSearchedUser(prev => ({ ...prev, role: newUserRole }));
              Alert.alert('Success', `Role updated to "${newUserRole}" for ${searchedUser.fullName || searchedUser.email}.`);
            } catch (err) {
              console.log('Error updating role:', err);
              Alert.alert('Error', 'Could not update role. Please try again.');
            } finally {
              setSavingRole(false);
            }
          }
        }
      ]
    );
  };

  // Handle Clear Cache
  const handleClearCache = () => {
    Alert.alert(
      'Clear App Cache',
      'This will clear local preferences (such as sound configurations, onboarded statuses, and saved cookies). The app will restart.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              Alert.alert('Cache Cleared', 'All local application cache has been reset. Please restart the app.');
            } catch (err) {
              Alert.alert('Error', 'Failed to clear local cache.');
            }
          }
        }
      ]
    );
  };

  // Handle Sign Out
  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of BrgyAlert Admin Console?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              await logout();
            } catch (err) {
              console.log('Logout error:', err);
              setSigningOut(false);
            }
          }
        }
      ]
    );
  };

  // Handle Replay Tour
  const handleReplayTour = async () => {
    try {
      await AsyncStorage.removeItem('hasSeenAdminConsoleTutorial');
      Alert.alert('Tour Reset', 'Admin tour has been reset. Returning to console...');
      navigation.navigate('AdminConsole');
    } catch (err) {
      console.log('Error resetting tutorial state:', err);
      Alert.alert('Error', 'Could not reset the admin console tour.');
    }
  };

  const openLegalModal = (type) => {
    setLegalModalType(type);
    setLegalModalVisible(true);
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

      {/* Header Block */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Admin Settings</Text>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Profile Card Summary */}
          <View style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatarGradient}>
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </View>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{fullName || 'Admin User'}</Text>
              <Text style={styles.profileEmail}>{user?.email || ''}</Text>
              <View style={[styles.roleBadge, { backgroundColor: userProfile?.role === 'admin' ? '#3B82F630' : '#10B98130' }]}>
                <Text style={[styles.roleBadgeText, { color: userProfile?.role === 'admin' ? '#2563EB' : '#10B981' }]}>
                  {getRoleLabel()}
                </Text>
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
                    <Feather name="edit-2" size={14} color="#0B2564" style={{ marginRight: 6 }} />
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
                <ActivityIndicator size="small" color="#0B2564" style={{ marginVertical: 20 }} />
              ) : !isEditingConfig ? (
                <View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.detailLabel}>Barangay Name</Text>
                    <Text style={styles.detailValue}>{barangayName || 'Not Set'}</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.detailLabel}>Police Hotline</Text>
                    <Text style={styles.detailValue}>{hotlinePolice || 'Not Set'}</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.detailLabel}>Fire Station Hotline</Text>
                    <Text style={styles.detailValue}>{hotlineFire || 'Not Set'}</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.detailLabel}>Medical/Ambulance Hotline</Text>
                    <Text style={styles.detailValue}>{hotlineAmbulance || 'Not Set'}</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.detailLabel}>Estimated Response Time</Text>
                    <Text style={styles.detailValue}>{responseTimeValue || 'Not Set'}</Text>
                  </View>
                  <View style={[styles.profileDetailRow, { borderBottomWidth: 0, flexDirection: 'column', alignItems: 'flex-start' }]}>
                    <Text style={[styles.detailLabel, { marginBottom: 6 }]}>Offline SMS Gateways</Text>
                    {smsGateways.filter(gw => gw.trim().length > 0).length === 0 ? (
                      <Text style={[styles.detailValue, { fontStyle: 'italic', color: '#9CA3AF' }]}>None Configured</Text>
                    ) : (
                      smsGateways
                        .filter(gw => gw.trim().length > 0)
                        .map((gw, idx) => (
                          <Text key={idx} style={[styles.detailValue, { marginBottom: 4 }]}>• {gw}</Text>
                        ))
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.editProfileButton}
                    onPress={() => {
                      setBackupConfig({
                        barangayName,
                        hotlinePolice,
                        hotlineFire,
                        hotlineAmbulance,
                        smsGateways: [...smsGateways],
                        responseTimeValue
                      });
                      setIsEditingConfig(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-2" size={14} color="#0B2564" style={{ marginRight: 6 }} />
                    <Text style={styles.editProfileButtonText}>Edit Config</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.inputLabel}>Barangay Name</Text>
                  <TextInput
                    style={styles.input}
                    value={barangayName}
                    onChangeText={setBarangayName}
                    placeholder="Barangay Name"
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

                  <Text style={styles.inputLabel}>Estimated Response Time (Citizen Banner)</Text>
                  <TextInput
                    style={styles.input}
                    value={responseTimeValue}
                    onChangeText={setResponseTimeValue}
                    placeholder="e.g. 15-30 mins"
                    placeholderTextColor="#9CA3AF"
                  />

                  <Text style={[styles.inputLabel, { marginTop: 12, fontWeight: '700' }]}>Offline SMS Dispatch Gateways (Max 5)</Text>
                  {smsGateways.map((gw, idx) => (
                    <TextInput
                      key={idx}
                      style={[styles.input, { marginBottom: 8 }]}
                      value={gw}
                      onChangeText={(val) => {
                        const updated = [...smsGateways];
                        updated[idx] = val;
                        setSmsGateways(updated);
                      }}
                      placeholder={`Gateway Number ${idx + 1}`}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="phone-pad"
                    />
                  ))}

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.saveButton, { flex: 2, marginRight: 8 }]}
                      onPress={handleSaveBarangayConfig}
                      disabled={savingConfig}
                      activeOpacity={0.8}
                    >
                      {savingConfig ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        if (backupConfig) {
                          setBarangayName(backupConfig.barangayName);
                          setHotlinePolice(backupConfig.hotlinePolice);
                          setHotlineFire(backupConfig.hotlineFire);
                          setHotlineAmbulance(backupConfig.hotlineAmbulance);
                          setSmsGateways(backupConfig.smsGateways);
                          setResponseTimeValue(backupConfig.responseTimeValue);
                        }
                        setIsEditingConfig(false);
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

          {/* User Role Management — admin-only */}
          {userProfile?.role === 'admin' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>User Role Management</Text>
              <View style={styles.card}>
                <Text style={[styles.inputLabel, { marginBottom: 4 }]}>Search by Email</Text>
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
                  Find a registered user and update their role.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={searchEmail}
                    onChangeText={setSearchEmail}
                    placeholder="user@email.com"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.saveButton, { paddingHorizontal: 16, marginTop: 0, minWidth: 80, height: 48, justifyContent: 'center' }]}
                    onPress={handleSearchUser}
                    disabled={searchingUser}
                    activeOpacity={0.8}
                  >
                    {searchingUser
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={styles.saveButtonText}>Search</Text>
                    }
                  </TouchableOpacity>
                </View>

                {searchedUser && (
                  <View style={{ marginTop: 16, padding: 14, backgroundColor: '#F0F4FF', borderRadius: 12 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A2C5B', marginBottom: 2 }}>
                      {searchedUser.fullName || 'Unknown'}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>{searchedUser.email}</Text>

                    <Text style={styles.inputLabel}>Current Role: <Text style={{ color: '#0B2564', fontWeight: '700' }}>{searchedUser.role}</Text></Text>
                    <Text style={[styles.inputLabel, { marginTop: 10 }]}>New Role</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      {['citizen', 'responder', 'admin'].map((role) => (
                        <TouchableOpacity
                          key={role}
                          onPress={() => setNewUserRole(role)}
                          style={[
                            {
                              flex: 1, paddingVertical: 10, borderRadius: 10,
                              borderWidth: 1.5,
                              borderColor: newUserRole === role ? '#0B2564' : '#D1D5DB',
                              backgroundColor: newUserRole === role ? '#0B2564' : '#FFFFFF',
                              alignItems: 'center'
                            }
                          ]}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: newUserRole === role ? '#FFFFFF' : '#6B7280', textTransform: 'capitalize' }}>
                            {role}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={[styles.saveButton, { marginTop: 14 }]}
                      onPress={handleUpdateUserRole}
                      disabled={savingRole || newUserRole === searchedUser.role}
                      activeOpacity={0.8}
                    >
                      {savingRole
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : <Text style={styles.saveButtonText}>Apply Role Change</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>
            <View style={styles.card}>

              {/* Sound Chimes Row */}
              <View style={styles.settingRow}>
                <View style={styles.settingRowLeft}>
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="volume-2" size={18} color="#0B2564" />
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
                  thumbColor={soundEnabled ? '#0B2564' : '#9CA3AF'}
                />
              </View>

              {/* Reset Password Row */}
              <TouchableOpacity
                style={[styles.settingRow, styles.borderTop]}
                onPress={handlePasswordReset}
                activeOpacity={0.7}
              >
                <View style={styles.settingRowLeft}>
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="lock" size={18} color="#0B2564" />
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
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="key" size={18} color="#0B2564" />
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
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="help-circle" size={18} color="#0B2564" />
                  </View>
                  <View>
                    <Text style={styles.settingTitle}>Replay App Tour</Text>
                    <Text style={styles.settingSubtitle}>Show step-by-step interactive overlay</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Clear App Cache Row */}
              <TouchableOpacity
                style={[styles.settingRow, styles.borderTop]}
                onPress={handleClearCache}
                activeOpacity={0.7}
              >
                <View style={styles.settingRowLeft}>
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="trash-2" size={18} color="#0B2564" />
                  </View>
                  <View>
                    <Text style={styles.settingTitle}>Clear App Cache</Text>
                    <Text style={styles.settingSubtitle}>Reset local preferences and sound cache</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              </TouchableOpacity>

            </View>
          </View>

          {/* Support & Legal */}
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
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="mail" size={18} color="#0B2564" />
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
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="shield" size={18} color="#0B2564" />
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
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="file-text" size={18} color="#0B2564" />
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
                  <View style={[styles.rowIconWrapper, { backgroundColor: '#E8F0FE' }]}>
                    <Feather name="alert-circle" size={18} color="#0B2564" />
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
      </Animated.View>

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
                <Feather name="key" size={20} color="#0B2564" style={{ marginRight: 8 }} />
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
      <BottomGradient />

      {/* Floating Bottom Nav */}
      <AdminBottomTabNav />

      {/* Sign Out Loading Overlay */}
      {signingOut && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
            <View style={{ backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }}>
              <ActivityIndicator size="large" color="#0B2564" />
              <Text style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: '#1F2937' }}>Signing out...</Text>
            </View>
          </View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    backgroundColor: '#0B2564',
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
    shadowColor: '#0B2564',
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
    color: '#0B2564',
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
    borderColor: '#0B2564',
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
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 10,
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
    borderColor: '#0B2564',
  },
  genderChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  genderChipTextActive: {
    color: '#0B2564',
  },
  saveButton: {
    backgroundColor: '#0B2564',
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
    color: '#0B2564',
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
    color: '#0B2564',
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
    color: '#0B2564',
    marginTop: 16,
    marginBottom: 6,
  },
  legalBody: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  legalCloseButton: {
    backgroundColor: '#0B2564',
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
