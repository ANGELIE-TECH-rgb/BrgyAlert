import React, { useState, useEffect } from 'react';
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
  StatusBar,
  Alert,
  Modal,
  Image,
  Animated
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Feather, AntDesign, Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import GoogleIcon from '../../components/GoogleIcon';
import { checkLoginStatus, recordFailedLogin, resetLoginAttempts } from '../../services/rateLimiter';
import { validateEmail, sanitizeText } from '../../services/inputSanitizer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { requestLocationPermission } from '../../services/locationService';
import { auth } from '../../services/firebaseConfig';

export default function LoginScreen({ navigation }) {
  const { login, loginWithGoogle } = useAuth();
  const [isOnline, setIsOnline] = useState(true);

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

  // Proactively request location permissions on mount to prepare for emergencies
  useEffect(() => {
    const askLoc = async () => {
      try {
        await requestLocationPermission();
      } catch (err) {
        console.log('Error prompting location permission on mount:', err);
      }
    };
    const timer = setTimeout(() => {
      askLoc();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Monitor network state
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);

  // Load remembered email on startup — reads from Firebase Auth's persisted
  // session rather than storing the raw email in plain AsyncStorage.
  // This avoids leaking the email on physical device access.
  useEffect(() => {
    const loadRememberedEmail = async () => {
      try {
        const rememberFlag = await AsyncStorage.getItem('rememberMeEnabled');
        if (rememberFlag === 'true') {
          // Firebase Auth already persists the session — read the email from it
          const currentUser = auth.currentUser;
          if (currentUser?.email) {
            setEmail(currentUser.email);
          }
          setRememberMe(true);
        }
      } catch (err) {
        console.log('Failed to load remember-me state', err);
      }
    };
    loadRememberedEmail();
  }, []);

  useEffect(() => {
    const initRateLimit = async () => {
      const status = await checkLoginStatus();
      if (status.locked) {
        setLockoutTime(status.secondsRemaining);
        setErrorMsg(`Too many failed attempts. Try again in ${status.secondsRemaining} seconds.`);
      }
    };
    initRateLimit();
  }, []);

  useEffect(() => {
    let timer;
    if (lockoutTime > 0) {
      timer = setInterval(() => {
        setLockoutTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setErrorMsg('');
            return 0;
          }
          setErrorMsg(`Too many failed attempts. Try again in ${prev - 1} seconds.`);
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutTime]);

  const handleLogin = async () => {
    if (!isOnline) {
      Alert.alert(
        'Connection Error',
        'You are offline. To sign in, please connect to the internet, or file an offline ulat via SMS.',
        [
          { text: 'File Offline Report', onPress: () => navigation.navigate('ReportWizard') },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    const status = await checkLoginStatus();
    if (status.locked) {
      setLockoutTime(status.secondsRemaining);
      setErrorMsg(`Too many failed attempts. Try again in ${status.secondsRemaining} seconds.`);
      Alert.alert('Locked Out', `Too many failed attempts. Please try again in ${status.secondsRemaining} seconds.`);
      return;
    }

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      Alert.alert('Validation Error', 'Please enter both email and password.');
      return;
    }

    // Validate email format before sending to Firebase
    const cleanEmail = sanitizeText(email.trim(), 254);
    if (!validateEmail(cleanEmail)) {
      setErrorMsg('Please enter a valid email address (e.g. user@gmail.com).');
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      await login(cleanEmail, password);
      await resetLoginAttempts();

      if (rememberMe) {
        // Store only a flag — NOT the raw email
        await AsyncStorage.setItem('rememberMeEnabled', 'true');
      } else {
        await AsyncStorage.removeItem('rememberMeEnabled');
      }
    } catch (error) {
      console.log('Login failed:', error.code || error.message);

      const isNetworkError =
        error.code === 'auth/network-request-failed' ||
        error.message?.toLowerCase().includes('network') ||
        error.message?.toLowerCase().includes('timeout');

      if (isNetworkError) {
        setErrorMsg('Network timeout or low connection. Please check your signal and try again.');
        Alert.alert(
          'Network Error',
          'Your connection seems slow or offline. Please check your internet connection and try again, or file an offline report via SMS.',
          [
            { text: 'File Offline Report', onPress: () => navigation.navigate('ReportWizard') },
            { text: 'Try Again', style: 'cancel' }
          ]
        );
      } else {
        const rateStatus = await recordFailedLogin();
        if (rateStatus.locked) {
          setLockoutTime(rateStatus.secondsRemaining);
          setErrorMsg(`Too many failed attempts. Try again in ${rateStatus.secondsRemaining} seconds.`);
          Alert.alert('Locked Out', `Too many failed attempts. Please try again in ${rateStatus.secondsRemaining} seconds.`);
        } else {
          setErrorMsg('Incorrect email or password. Please try again.');
          Alert.alert('Login Failed', 'Incorrect email or password. Please try again.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isOnline) {
      Alert.alert('Connection Error', 'Google Login requires an active internet connection.');
      return;
    }
    const status = await checkLoginStatus();
    if (status.locked) {
      setLockoutTime(status.secondsRemaining);
      setErrorMsg(`Too many failed attempts. Try again in ${status.secondsRemaining} seconds.`);
      Alert.alert('Locked Out', `Too many failed attempts. Please try again in ${status.secondsRemaining} seconds.`);
      return;
    }
    setErrorMsg('');
    loginWithGoogle();
  };

  return (
    <SafeAreaView style={styles.container}>
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* Header Title with Branding Logo */}
            <View style={styles.headerContainer}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Enter your credentials to access your secure Barangay command console.</Text>
            </View>

            {/* Offline Mode Alert Banner */}
            {!isOnline && (
              <TouchableOpacity
                style={styles.offlineBanner}
                onPress={() => navigation.navigate('ReportWizard')}
                activeOpacity={0.8}
              >
                <View style={styles.offlineBannerContent}>
                  <Feather name="wifi-off" size={20} color="#D97706" />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.offlineBannerTitle}>No Connection Detected</Text>
                    <Text style={styles.offlineBannerSubtitle}>
                      Tap here to submit an <Text style={styles.offlineBannerBold}>Offline Report via SMS</Text>
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#D97706" />
                </View>
              </TouchableOpacity>
            )}

            {/* Form */}
            <View style={styles.formContainer}>
              {errorMsg ? (
                <View style={styles.errorBanner}>
                  <Feather name="alert-circle" size={16} color="#DC3545" style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Email Field */}
              <Text style={[styles.label, focusedField === 'email' && styles.labelActive]}>Email Address</Text>
              <View style={[styles.inputContainer, focusedField === 'email' && styles.inputContainerActive]}>
                <Feather
                  name="mail"
                  size={18}
                  color={focusedField === 'email' ? '#0B2564' : '#A0AEC0'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="name@gmail.com"
                  placeholderTextColor="#A0AEC0"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!isSubmitting}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              {rememberMe && email.trim().length > 0 && (
                <View style={styles.rememberedEmailChip}>
                  <Ionicons name="save-outline" size={13} color="#0B2564" style={{ marginRight: 4 }} />
                  <Text style={styles.rememberedEmailText}>Email pre-filled from your last session</Text>
                </View>
              )}

              {/* Password Field */}
              <Text style={[styles.label, focusedField === 'password' && styles.labelActive]}>Password</Text>
              <View style={[styles.passwordContainer, focusedField === 'password' && styles.passwordContainerActive]}>
                <Feather
                  name="lock"
                  size={18}
                  color={focusedField === 'password' ? '#0B2564' : '#A0AEC0'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.passwordInput}
                  placeholder="••••••••"
                  placeholderTextColor="#A0AEC0"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  editable={!isSubmitting}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                >
                  <Feather
                    name={showPassword ? "eye" : "eye-off"}
                    size={20}
                    color="#A0AEC0"
                  />
                </TouchableOpacity>
              </View>

              {/* Options Row (Remember Me & Forgot Password) */}
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.rememberMeContainer}
                  onPress={() => setRememberMe(!rememberMe)}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <View style={[styles.customCheckbox, rememberMe && styles.customCheckboxActive]}>
                    {rememberMe && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.rememberMeText}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate('ForgotPassword')}
                  disabled={isSubmitting}
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              {/* Login Button */}
              <TouchableOpacity
                style={[
                  styles.loginButton,
                  (isSubmitting || lockoutTime > 0) && styles.loginButtonDisabled
                ]}
                onPress={handleLogin}
                disabled={isSubmitting || lockoutTime > 0}
              >
                <Text style={styles.loginButtonText}>
                  {lockoutTime > 0 ? `Locked (${lockoutTime}s)` : 'Login'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}> or </Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Button */}
            <TouchableOpacity
              style={[
                styles.googleButton,
                (isSubmitting || lockoutTime > 0) && styles.googleButtonDisabled
              ]}
              onPress={handleGoogleLogin}
              disabled={isSubmitting || lockoutTime > 0}
            >
              <GoogleIcon size={20} style={styles.googleIcon} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* Footer Navigation */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Don’t have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isSubmitting}>
                <Text style={styles.signUpText}>Sign Up</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Loading Overlay Modal */}
      <Modal
        transparent={true}
        animationType="fade"
        visible={isSubmitting}
        onRequestClose={() => { }}
      >
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" style={{ marginBottom: 20 }} />
          <Text style={styles.loadingText}>Signing in...</Text>
          <Text style={styles.loadingSubtext}>Please wait while we verify your credentials</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 20 : 40,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 32,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE1E7',
    borderRadius: 16,
    height: 56,
  },
  inputContainerActive: {
    borderColor: '#0B2564',
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    paddingLeft: 8,
    paddingRight: 16,
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
    paddingLeft: 8,
    paddingRight: 16,
    fontSize: 16,
    color: '#1A202C',
    height: '100%',
  },
  inputIcon: {
    marginLeft: 16,
    marginRight: 4,
  },
  eyeButton: {
    paddingHorizontal: 16,
    height: '100%',
    justifyContent: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 28,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  customCheckboxActive: {
    backgroundColor: '#0B2564',
    borderColor: '#0B2564',
  },
  rememberMeText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#4A5568',
    fontWeight: '500',
  },
  forgotPasswordText: {
    color: '#0B2564',
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: '#0B2564',
    borderRadius: 20,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    backgroundColor: '#718096',
  },
  loginButtonText: {
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
  },
  footerText: {
    color: '#718096',
    fontSize: 14,
  },
  signUpText: {
    color: '#0B2564',
    fontSize: 14,
    fontWeight: 'bold',
  },
  googleButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#F7FAFC',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.44)', // Frosted dark/black background
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#CBD5E1', // Cool gray 300
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
    maxWidth: 280,
  },
  offlineBanner: {
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  offlineBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offlineBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D97706',
  },
  offlineBannerSubtitle: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 2,
  },
  offlineBannerBold: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  logoImage: {
    height: 60,
    width: 100,
    alignSelf: 'flex-start',
  },
  rememberedEmailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  rememberedEmailText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0B2564',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#DC3545',
    fontWeight: '500',
    flex: 1,
  },
});
