import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  StatusBar,
  Animated,
  PanResponder,
  Dimensions
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Feather, AntDesign, Ionicons } from '@expo/vector-icons';
import GoogleIcon from '../../components/GoogleIcon';
import { checkSignUpStatus, recordSignUpAttempt } from '../../services/rateLimiter';
import { validateEmail, sanitizeText, validatePhilippinePhone } from '../../services/inputSanitizer';

import GestureModal from '../../components/GestureModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function RegisterScreen({ navigation }) {
  const { register, loginWithGoogle } = useAuth();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const [signUpLockoutTime, setSignUpLockoutTime] = useState(0);

  useEffect(() => {
    const initRateLimit = async () => {
      const status = await checkSignUpStatus();
      if (status.locked) {
        setSignUpLockoutTime(status.secondsRemaining);
        setErrorMsg(`Too many registration attempts. Try again in ${status.secondsRemaining} seconds.`);
      }
    };
    initRateLimit();
  }, []);

  useEffect(() => {
    let timer;
    if (signUpLockoutTime > 0) {
      timer = setInterval(() => {
        setSignUpLockoutTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setErrorMsg('');
            return 0;
          }
          setErrorMsg(`Too many registration attempts. Try again in ${prev - 1} seconds.`);
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [signUpLockoutTime]);

  // Step 1: Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 2: Personal Details
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState(''); // Text representation
  const [dobDate, setDobDate] = useState(new Date(2000, 0, 1)); // State for selected Date
  const [phoneNumber, setPhoneNumber] = useState(''); // Initialized to empty string for placeholder visibility
  const [gender, setGender] = useState('');

  // Step 1: Terms consent
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);

  // Modals Visibility
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);

  // Calendar Picker local navigation state
  const [viewMonth, setViewMonth] = useState(0); // Jan = 0
  const [viewYear, setViewYear] = useState(2000);
  const [calendarViewMode, setCalendarViewMode] = useState('calendar'); // 'calendar' | 'year'

  // Format Helper
  const formatDateString = (date) => {
    if (!date) return '';
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const y = date.getFullYear();
    return `${m}-${d}-${y}`;
  };

  // Helper to pre-populate view year/month when calendar opens
  const openCalendar = () => {
    setViewMonth(dobDate.getMonth());
    setViewYear(dobDate.getFullYear());
    setCalendarViewMode('calendar');
    setCalendarModalVisible(true);
  };

  // Enforce +63 prefix and allow resetting to empty for placeholder visibility
  const handlePhoneNumberChange = (text) => {
    if (!text || text.trim() === '' || text === '+' || text === '+6' || text === '+63' || text === '+63 ') {
      setPhoneNumber('');
      return;
    }

    let rest = '';
    if (text.startsWith('+63')) {
      rest = text.substring(4).replace(/[^0-9]/g, '');
    } else {
      rest = text.replace(/[^0-9]/g, '');
      if (rest.startsWith('63')) {
        rest = rest.substring(2);
      }
    }
    setPhoneNumber('+63 ' + rest.substring(0, 10)); // Limit to 10-digit mobile number
  };

  // Step 1: Calculate Progress Dynamically
  const getStep1Progress = () => {
    let filled = 0;
    if (email.trim() !== '') filled++;
    if (password !== '') filled++;
    if (confirmPassword !== '') filled++;
    return Math.round((filled / 3) * 50);
  };

  // Step 2: Calculate Progress Dynamically
  const getStep2Progress = () => {
    let filled = 0;
    if (fullName.trim() !== '') filled++;
    if (dob !== '') filled++;
    if (phoneNumber && phoneNumber.trim() !== '') filled++;
    if (gender !== '') filled++;
    return 50 + Math.round((filled / 4) * 50);
  };

  // Animated values for progress bars
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

  // Go from Step 1 to Step 2 with strong password validation
  const handleNextStep = () => {
    if (!email || !password || !confirmPassword) {
      setErrorMsg('Please fill out all credentials fields.');
      return;
    }
    if (!acceptTerms) {
      setErrorMsg('You must agree to the Terms of Service and Privacy Policy.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!validateEmail(email.trim())) {
      setErrorMsg('Please enter a valid email address (e.g. user@gmail.com).');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password.includes(' ')) {
      setErrorMsg('Password cannot contain spaces.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setErrorMsg('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[a-z]/.test(password)) {
      setErrorMsg('Password must contain at least one lowercase letter.');
      return;
    }
    if (!/\d/.test(password)) {
      setErrorMsg('Password must contain at least one number.');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setErrorMsg('Password must contain at least one special character (e.g. !@#$%^&*).');
      return;
    }

    setErrorMsg('');
    setStep(2);
  };

  // Go back to Step 1 or navigate back to Login
  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else {
      navigation.goBack();
    }
  };

  // Submit complete registration with citizen role and all required constraints
  const handleSignUp = async () => {
    const status = await checkSignUpStatus();
    if (status.locked) {
      setSignUpLockoutTime(status.secondsRemaining);
      setErrorMsg(`Too many registration attempts. Try again in ${status.secondsRemaining} seconds.`);
      Alert.alert('Locked Out', `Too many registration attempts. Please try again in ${status.secondsRemaining} seconds.`);
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }
    // Sanitize fullName — strip any HTML tags or dangerous chars
    const cleanFullName = sanitizeText(fullName.trim(), 100);
    if (cleanFullName.length < 2) {
      setErrorMsg('Full Name must be at least 2 characters.');
      return;
    }
    if (!dob || dob === '') {
      setErrorMsg('Date of Birth is required.');
      return;
    }
    // Validation for phone length: '+63 ' (4 chars) + 10 digits = 14 characters total
    if (!phoneNumber || phoneNumber.trim() === '+63' || phoneNumber.length < 14) {
      setErrorMsg('A valid 10-digit Contact Number is required (+63 9XX XXX XXXX).');
      return;
    }
    if (!gender || gender === 'Select your gender') {
      setErrorMsg('Gender is required.');
      return;
    }

    const rateStatus = await recordSignUpAttempt();
    if (rateStatus.locked) {
      setSignUpLockoutTime(rateStatus.secondsRemaining);
      setErrorMsg(`Too many registration attempts. Try again in ${rateStatus.secondsRemaining} seconds.`);
      Alert.alert('Locked Out', `Too many registration attempts. Please try again in ${rateStatus.secondsRemaining} seconds.`);
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      await register(
        email.trim(),
        password,
        cleanFullName,
        dob,
        phoneNumber.trim(),
        gender,
        'citizen', // Automatically set to citizen
        () => new Promise((resolve) => {
          Alert.alert(
            "Registration Successful",
            "Your account has been created successfully! Welcome to BrgyAlert.",
            [{ text: "OK", onPress: resolve }],
            { cancelable: false }
          );
        })
      );
    } catch (error) {
      console.log('Registration error:', error.code, error.message);
      let friendlyError = 'Registration failed. Please check your information and try again.';

      if (error.code === 'auth/email-already-in-use') {
        friendlyError = 'This email is already registered. Please use a different email.';
        setStep(1);
      } else if (error.code === 'auth/invalid-email') {
        friendlyError = 'Please enter a valid email address.';
        setStep(1);
      } else if (error.code === 'auth/network-request-failed') {
        friendlyError = 'No internet connection. Please connect to the internet (try mobile data if on school/office WiFi) and try again.';
      } else if (error.code === 'firestore/write-timeout' || (error.message && error.message.includes('Could not save your profile'))) {
        friendlyError = 'Account created but profile could not be saved. Please check your internet connection. (Tip: try mobile data instead of school WiFi)';
      }

      setErrorMsg(friendlyError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    const status = await checkSignUpStatus();
    if (status.locked) {
      setSignUpLockoutTime(status.secondsRemaining);
      setErrorMsg(`Too many registration attempts. Try again in ${status.secondsRemaining} seconds.`);
      Alert.alert('Locked Out', `Too many registration attempts. Please try again in ${status.secondsRemaining} seconds.`);
      return;
    }
    setErrorMsg('');
    loginWithGoogle();
  };

  // Step 1 UI: Create Your Account
  const renderStep1 = () => {
    const progress = getStep1Progress();
    return (
      <>
        {/* Step Info */}
        <View style={styles.stepHeader}>
          <Text style={styles.stepText}>Step 1 of 2: Credentials</Text>
          <Text style={styles.percentText}>{progress}% Complete</Text>
        </View>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: widthInterpolate1 }]} />
        </View>

        {/* Screen Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Enter your credentials to continue</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Email */}
          <Text style={[styles.label, focusedField === 'email' && styles.labelActive]}>Email</Text>
          <View style={[styles.inputContainer, focusedField === 'email' && styles.inputContainerActive]}>
            <TextInput
              style={styles.input}
              placeholder="johndoe@gmail.com"
              placeholderTextColor="#A0AEC0"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Password */}
          <Text style={[styles.label, focusedField === 'password' && styles.labelActive]}>Password</Text>
          <View style={[styles.passwordContainer, focusedField === 'password' && styles.passwordContainerActive]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="********"
              placeholderTextColor="#A0AEC0"
              value={password}
              onChangeText={(val) => setPassword(val.replace(/\s/g, ''))}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#A0AEC0" />
            </TouchableOpacity>
          </View>

          {password.length > 0 && (
            <View style={styles.passwordStrengthContainer}>
              <View style={styles.strengthBarBg}>
                <View 
                  style={[
                    styles.strengthBarFill, 
                    { 
                      width: (() => {
                        let score = 0;
                        if (password.length >= 8) score++;
                        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
                        if (/\d/.test(password)) score++;
                        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
                        return score === 0 ? '0%' : score === 1 ? '25%' : score === 2 ? '50%' : score === 3 ? '75%' : '100%';
                      })(),
                      backgroundColor: (() => {
                        let score = 0;
                        if (password.length >= 8) score++;
                        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
                        if (/\d/.test(password)) score++;
                        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
                        return score <= 1 ? '#DC3545' : score === 2 ? '#FD7E14' : score === 3 ? '#FFC107' : '#28A745';
                      })()
                    }
                  ]} 
                />
              </View>
              <Text style={[
                styles.strengthText,
                {
                  color: (() => {
                    let score = 0;
                    if (password.length >= 8) score++;
                    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
                    if (/\d/.test(password)) score++;
                    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
                    return score <= 1 ? '#DC3545' : score === 2 ? '#FD7E14' : score === 3 ? '#FFC107' : '#28A745';
                  })()
                }
              ]}>
                {(() => {
                  let score = 0;
                  if (password.length >= 8) score++;
                  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
                  if (/\d/.test(password)) score++;
                  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
                  return score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';
                })()}
              </Text>
            </View>
          )}

          {password.length > 0 && (
            <View style={styles.passwordRequirementsContainer}>
              <Text style={styles.requirementsTitle}>Password Requirements:</Text>
              <View style={styles.requirementRow}>
                <Feather 
                  name={password.length >= 8 ? "check-circle" : "circle"} 
                  size={14} 
                  color={password.length >= 8 ? "#28A745" : "#A0AEC0"} 
                />
                <Text style={[styles.requirementText, password.length >= 8 && styles.requirementMet]}>
                  Minimum of 8 characters
                </Text>
              </View>
              <View style={styles.requirementRow}>
                <Feather 
                  name={(/[A-Z]/.test(password) && /[a-z]/.test(password)) ? "check-circle" : "circle"} 
                  size={14} 
                  color={(/[A-Z]/.test(password) && /[a-z]/.test(password)) ? "#28A745" : "#A0AEC0"} 
                />
                <Text style={[styles.requirementText, (/[A-Z]/.test(password) && /[a-z]/.test(password)) && styles.requirementMet]}>
                  Both uppercase and lowercase letters
                </Text>
              </View>
              <View style={styles.requirementRow}>
                <Feather 
                  name={/\d/.test(password) ? "check-circle" : "circle"} 
                  size={14} 
                  color={/\d/.test(password) ? "#28A745" : "#A0AEC0"} 
                />
                <Text style={[styles.requirementText, /\d/.test(password) && styles.requirementMet]}>
                  At least one number
                </Text>
              </View>
              <View style={styles.requirementRow}>
                <Feather 
                  name={/[!@#$%^&*(),.?":{}|<>]/.test(password) ? "check-circle" : "circle"} 
                  size={14} 
                  color={/[!@#$%^&*(),.?":{}|<>]/.test(password) ? "#28A745" : "#A0AEC0"} 
                />
                <Text style={[styles.requirementText, /[!@#$%^&*(),.?":{}|<>]/.test(password) && styles.requirementMet]}>
                  At least one special character (e.g., !@#$)
                </Text>
              </View>
            </View>
          )}

          {/* Confirm Password */}
          <Text style={[styles.label, focusedField === 'confirmPassword' && styles.labelActive]}>Confirm Password</Text>
          <View style={[styles.passwordContainer, focusedField === 'confirmPassword' && styles.passwordContainerActive]}>
            <TextInput
              style={styles.passwordInput}
              placeholder="********"
              placeholderTextColor="#A0AEC0"
              value={confirmPassword}
              onChangeText={(val) => setConfirmPassword(val.replace(/\s/g, ''))}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              onFocus={() => setFocusedField('confirmPassword')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              <Feather name={showConfirmPassword ? "eye" : "eye-off"} size={20} color="#A0AEC0" />
            </TouchableOpacity>
          </View>

          {/* Terms & Conditions Consent */}
          <View style={styles.termsConsentContainer}>
            <TouchableOpacity
              onPress={() => setAcceptTerms(!acceptTerms)}
              activeOpacity={0.8}
              style={[styles.termsCheckbox, acceptTerms && styles.termsCheckboxActive, { marginRight: 12 }]}
            >
              {acceptTerms && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setTermsModalVisible(true)}
              style={{ flex: 1 }}
            >
              <Text style={styles.termsConsentText}>
                I agree to the{' '}
                <Text style={styles.termsConsentLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsConsentLink}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Continue Button */}
          <TouchableOpacity 
            style={[styles.primaryButton, !acceptTerms && styles.primaryButtonDisabled]} 
            onPress={handleNextStep}
          >
            <Text style={styles.primaryButtonText}>Sign up</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}> or </Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Sign-up */}
        <TouchableOpacity
          style={[
            styles.googleButton,
            signUpLockoutTime > 0 && styles.googleButtonDisabled
          ]}
          onPress={handleGoogleSignup}
          disabled={signUpLockoutTime > 0}
        >
          <GoogleIcon size={20} style={styles.googleIcon} />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        {/* Footer Navigation */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.navLinkText}>Login</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  // Calendar Day Generator
  const daysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (month, year) => new Date(year, month, 1).getDay();

  const renderCalendarGrid = () => {
    const totalDays = daysInMonth(viewMonth, viewYear);
    const startOffset = firstDayOfMonth(viewMonth, viewYear);
    const cells = [];

    // Weekdays headers
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    // Empty blank cells for offset
    for (let i = 0; i < startOffset; i++) {
      cells.push(<View key={`blank-${i}`} style={styles.calendarCellEmpty} />);
    }

    // Active day cells
    for (let day = 1; day <= totalDays; day++) {
      const isSelected = dobDate &&
        dobDate.getDate() === day &&
        dobDate.getMonth() === viewMonth &&
        dobDate.getFullYear() === viewYear;
      cells.push(
        <TouchableOpacity
          key={`day-${day}`}
          style={[styles.calendarCellDay, isSelected && styles.calendarCellDaySelected]}
          onPress={() => {
            setDobDate(new Date(viewYear, viewMonth, day));
          }}
        >
          <Text style={[styles.calendarCellDayText, isSelected && styles.calendarCellDayTextSelected]}>
            {day}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.calendarGrid}>
        <View style={styles.weekdaysRow}>
          {weekdays.map(wd => (
            <View key={wd} style={styles.weekdayHeader}>
              <Text style={styles.weekdayHeaderText}>{wd}</Text>
            </View>
          ))}
        </View>
        <View style={styles.daysContainer}>
          {cells}
        </View>
      </View>
    );
  };

  // Grid of years from 1930 to 2026 for fast jumps
  const renderYearGrid = () => {
    const years = [];
    for (let y = 2026; y >= 1930; y--) {
      years.push(y);
    }
    return (
      <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGridContainer}>
        {years.map(yr => (
          <TouchableOpacity
            key={yr}
            style={[styles.yearGridCell, viewYear === yr && styles.yearGridCellSelected]}
            onPress={() => {
              setViewYear(yr);
              setCalendarViewMode('calendar');
            }}
          >
            <Text style={[styles.yearGridCellText, viewYear === yr && styles.yearGridCellTextSelected]}>
              {yr}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // Step 2 UI: Personal Details
  const renderStep2 = () => {
    const progress = getStep2Progress();
    return (
      <>
        {/* Step Info */}
        <View style={styles.stepHeader}>
          <Text style={styles.stepText}>Step 2 of 2: Personal Details</Text>
          <Text style={styles.percentText}>{progress}% Complete</Text>
        </View>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: widthInterpolate2 }]} />
        </View>

        {/* Screen Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Personal Details</Text>
          <Text style={styles.subtitle}>Enter your personal information. This will be kept private and secure.</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {errorMsg ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Full Name */}
          <Text style={[styles.label, focusedField === 'fullName' && styles.labelActive]}>Full Name</Text>
          <View style={[styles.inputContainer, focusedField === 'fullName' && styles.inputContainerActive]}>
            <TextInput
              style={styles.input}
              placeholder="johndoe"
              placeholderTextColor="#A0AEC0"
              value={fullName}
              onChangeText={setFullName}
              autoCorrect={false}
              editable={!isSubmitting}
              onFocus={() => setFocusedField('fullName')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Date of Birth (Trigger Calendar bottom-sheet) */}
          <Text style={[styles.label, (focusedField === 'dob' || calendarModalVisible) && styles.labelActive]}>Date of Birth</Text>
          <TouchableOpacity
            style={[
              styles.dropdown,
              (calendarModalVisible || focusedField === 'dob') && styles.dropdownActive
            ]}
            onPress={() => {
              setFocusedField('dob');
              openCalendar();
            }}
            disabled={isSubmitting}
          >
            <Text style={[styles.dropdownText, !dob && styles.dropdownPlaceholder]}>
              {dob || 'Select your date of birth'}
            </Text>
            <Feather name="calendar" size={18} color="#A0AEC0" />
          </TouchableOpacity>

          {/* Contact Number */}
          <Text style={[styles.label, focusedField === 'phoneNumber' && styles.labelActive]}>Contact Number</Text>
          <View style={[styles.inputContainer, focusedField === 'phoneNumber' && styles.inputContainerActive]}>
            <TextInput
              style={styles.input}
              placeholder="+63 909 000 0000"
              placeholderTextColor="#A0AEC0"
              value={phoneNumber}
              onChangeText={handlePhoneNumberChange}
              keyboardType="phone-pad"
              autoCorrect={false}
              editable={!isSubmitting}
              onFocus={() => setFocusedField('phoneNumber')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Gender Selection */}
          <Text style={[styles.label, (focusedField === 'gender' || genderModalVisible) && styles.labelActive]}>Gender</Text>
          <TouchableOpacity
            style={[
              styles.dropdown,
              (genderModalVisible || focusedField === 'gender') && styles.dropdownActive
            ]}
            onPress={() => {
              setFocusedField('gender');
              setGenderModalVisible(true);
            }}
            disabled={isSubmitting}
          >
            <Text style={[styles.dropdownText, !gender && styles.dropdownPlaceholder]}>
              {gender || 'Select your gender'}
            </Text>
            <Feather name="chevron-down" size={18} color="#A0AEC0" />
          </TouchableOpacity>

          {/* Complete Signup Button */}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (isSubmitting || signUpLockoutTime > 0) && styles.primaryButtonDisabled
            ]}
            onPress={handleSignUp}
            disabled={isSubmitting || signUpLockoutTime > 0}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {signUpLockoutTime > 0 ? `Locked (${signUpLockoutTime}s)` : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Terms of Service & Privacy Policy Modal */}
        <GestureModal
          visible={termsModalVisible}
          onClose={() => setTermsModalVisible(false)}
          title="Terms & Privacy Policy"
        >
          <ScrollView style={styles.termsScroll} contentContainerStyle={styles.termsContentContainer}>
            <Text style={styles.termsSectionTitle}>1. Privacy Policy</Text>
            <Text style={styles.termsText}>
              BrgyAlert collects basic profile registration data including full name, contact details, gender, and date of birth to establish authorized identity. Coordinates and reports are gathered solely for dispatching appropriate responder personnel during verified local emergencies.
            </Text>
            <Text style={styles.termsSectionTitle}>2. Code of Conduct</Text>
            <Text style={styles.termsText}>
              Users agree not to submit false, malicious, or fabricated panic alerts. False report triggers or misuse of responder chats can lead to permanent account suspension and legal action by barangay authorities.
            </Text>
            <Text style={styles.termsSectionTitle}>3. Dispatch Authority</Text>
            <Text style={styles.termsText}>
              The Barangay Command Center retains full operational discretion to decline, update, or escalate incident logs based on response unit availability, safety conditions, and reported priority levels.
            </Text>
            <TouchableOpacity 
              style={[styles.primaryButton, { marginTop: 24, marginBottom: 32 }]} 
              onPress={() => {
                setAcceptTerms(true);
                setTermsModalVisible(false);
              }}
            >
              <Text style={styles.primaryButtonText}>Accept & Agree</Text>
            </TouchableOpacity>
          </ScrollView>
        </GestureModal>

        {/* Swipeable Calendar Modal Selector */}
        <GestureModal
          visible={calendarModalVisible}
          onClose={() => {
            setCalendarModalVisible(false);
            setFocusedField(null);
          }}
          title="Select Date of Birth"
        >
          <View style={styles.calendarContainer}>
            <View style={styles.calendarNavHeader}>
              <TouchableOpacity
                onPress={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11);
                    setViewYear(viewYear - 1);
                  } else {
                    setViewMonth(viewMonth - 1);
                  }
                }}
                style={styles.calendarNavButton}
              >
                <Feather name="chevron-left" size={20} color="#2D3748" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setCalendarViewMode(calendarViewMode === 'year' ? 'calendar' : 'year')}
                style={styles.calendarHeaderTitleContainer}
              >
                <Text style={styles.calendarHeaderTitle}>
                  {MONTH_NAMES[viewMonth]} {viewYear} <Feather name="chevron-down" size={12} color="#718096" />
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0);
                    setViewYear(viewYear + 1);
                  } else {
                    setViewMonth(viewMonth + 1);
                  }
                }}
                style={styles.calendarNavButton}
              >
                <Feather name="chevron-right" size={20} color="#2D3748" />
              </TouchableOpacity>
            </View>

            {calendarViewMode === 'calendar' ? renderCalendarGrid() : renderYearGrid()}

            <View style={styles.calendarActionRow}>
              <TouchableOpacity
                style={styles.calendarCancelBtn}
                onPress={() => {
                  setCalendarModalVisible(false);
                  setFocusedField(null);
                }}
              >
                <Text style={styles.calendarCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarConfirmBtn}
                onPress={() => {
                  setDob(formatDateString(dobDate));
                  setCalendarModalVisible(false);
                  setFocusedField(null);
                }}
              >
                <Text style={styles.calendarConfirmBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GestureModal>

        {/* Swipeable Gender Selection Modal */}
        <GestureModal
          visible={genderModalVisible}
          onClose={() => {
            setGenderModalVisible(false);
            setFocusedField(null);
          }}
          title="Select Gender"
        >
          <View style={styles.genderModalContainer}>
            <FlatList
              data={GENDER_OPTIONS}
              keyExtractor={(item) => item}
              scrollEnabled={true} // Enabled gestures scroll
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setGender(item);
                    setGenderModalVisible(false);
                    setFocusedField(null);
                  }}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </GestureModal>

      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Custom Header Navigation / Back Button */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 1 ? renderStep1() : renderStep2()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  navHeader: {
    height: 64,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEEF1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
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
  titleContainer: {
    marginBottom: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#718096',
    lineHeight: 22,
  },
  formContainer: {
    width: '100%',
  },
  errorBanner: {
    backgroundColor: '#FFF0F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD6DB',
  },
  errorText: {
    color: '#DC3545',
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2D3748',
    marginBottom: 8,
    marginTop: 16,
  },
  labelActive: {
    color: '#0B2564',
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE1E7',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
  },
  inputContainerActive: {
    borderColor: '#0B2564',
    borderWidth: 1.5,
  },
  input: {
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A202C',
    height: '100%',
  },
  passwordContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE1E7',
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
  },
  passwordContainerActive: {
    borderColor: '#0B2564',
    borderWidth: 1.5,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A202C',
    height: '100%',
  },
  eyeButton: {
    paddingHorizontal: 16,
    height: '100%',
    justifyContent: 'center',
  },
  dropdown: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE1E7',
    borderRadius: 16,
    height: 56,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownActive: {
    borderColor: '#0B2564',
    borderWidth: 1.5,
  },
  dropdownText: {
    fontSize: 16,
    color: '#1A202C',
  },
  dropdownPlaceholder: {
    color: '#A0AEC0',
  },
  primaryButton: {
    backgroundColor: '#0B2564',
    borderRadius: 20,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  primaryButtonDisabled: {
    backgroundColor: '#718096',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#A0AEC0',
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE1E7',
    borderRadius: 20,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  googleButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#F7FAFC',
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    color: '#2D3748',
    fontSize: 16,
    fontWeight: '600',
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  footerText: {
    color: '#718096',
    fontSize: 14,
  },
  navLinkText: {
    color: '#0B2564',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
  },
  modalItemText: {
    fontSize: 16,
    color: '#1A202C',
    fontWeight: '500',
  },
  genderModalContainer: {
    maxHeight: 250,
  },
  // Calendar-specific styles
  calendarContainer: {
    width: '100%',
  },
  calendarNavHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarNavButton: {
    padding: 8,
  },
  calendarHeaderTitleContainer: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F7FAFC',
    borderRadius: 10,
  },
  calendarHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
  },
  calendarGrid: {
    width: '100%',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    paddingBottom: 6,
    marginBottom: 8,
  },
  weekdayHeader: {
    width: '14.28%',
    alignItems: 'center',
  },
  weekdayHeaderText: {
    fontSize: 13,
    color: '#A0AEC0',
    fontWeight: '600',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCellEmpty: {
    width: '14.28%',
    height: 40,
  },
  calendarCellDay: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    marginVertical: 2,
  },
  calendarCellDaySelected: {
    backgroundColor: '#0B2564',
  },
  calendarCellDayText: {
    fontSize: 15,
    color: '#2D3748',
    fontWeight: '500',
  },
  calendarCellDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  yearScroll: {
    maxHeight: 200,
  },
  yearGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  yearGridCell: {
    width: '23%',
    height: 44,
    marginVertical: 4,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  yearGridCellSelected: {
    backgroundColor: '#0B2564',
    borderColor: '#0B2564',
  },
  yearGridCellText: {
    fontSize: 14,
    color: '#2D3748',
    fontWeight: '500',
  },
  yearGridCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  calendarActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
  },
  calendarCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 12,
  },
  calendarCancelBtnText: {
    fontSize: 15,
    color: '#718096',
    fontWeight: '600',
  },
  calendarConfirmBtn: {
    backgroundColor: '#0B2564',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  calendarConfirmBtnText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  passwordRequirementsContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  requirementsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  requirementText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 8,
  },
  requirementMet: {
    color: '#28A745',
    fontWeight: '600',
  },
  passwordStrengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  strengthBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 10,
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '700',
    width: 50,
    textAlign: 'right',
  },
  termsConsentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  termsCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  termsCheckboxActive: {
    backgroundColor: '#0B2564',
    borderColor: '#0B2564',
  },
  termsConsentText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  termsConsentLink: {
    color: '#0B2564',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  termsScroll: {
    maxHeight: 400,
    paddingHorizontal: 16,
  },
  termsContentContainer: {
    paddingBottom: 24,
  },
  termsSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 16,
    marginBottom: 6,
  },
  termsText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  primaryButtonDisabled: {
    backgroundColor: '#718096',
  },
});
