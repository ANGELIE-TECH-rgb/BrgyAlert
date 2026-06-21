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
  Alert,
  StatusBar
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Ionicons, Feather } from '@expo/vector-icons';

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  // 2-Step Flow States
  const [step, setStep] = useState(1); // 1: Enter Email, 2: Confirmation
  const [sentToEmail, setSentToEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const maskEmail = (rawEmail) => {
    if (!rawEmail) return '';
    const parts = rawEmail.split('@');
    if (parts.length !== 2) return rawEmail;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}@${domain}`;
  };

  const handleReset = async () => {
    if (!email) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const emailTrimmed = email.trim();
      await resetPassword(emailTrimmed);
      setSentToEmail(emailTrimmed);
      setStep(2);
      setCooldown(60);
      setEmail('');
    } catch (error) {
      console.log(error);
      let friendlyError = 'Failed to send password reset email. Please try again.';
      if (error.code === 'auth/invalid-email') {
        friendlyError = 'Please enter a valid email address.';
      } else if (error.code === 'auth/user-not-found') {
        friendlyError = 'No account found with this email.';
      }
      setErrorMsg(friendlyError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !sentToEmail) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await resetPassword(sentToEmail);
      setCooldown(60);
      Alert.alert('Link Resent', 'A new password reset link has been sent to your email.');
    } catch (error) {
      setErrorMsg('Failed to resend. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Back Button Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            if (step === 2) {
              setStep(1);
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {step === 1 ? (
            <>
              {/* Step 1: Request Reset */}
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Forgot Password</Text>
                <Text style={styles.subtitle}>Enter your email to reset your password quickly</Text>
              </View>

              {/* Form */}
              <View style={styles.formContainer}>
                {errorMsg ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                {/* Email Field */}
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
                    editable={!isSubmitting}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>

                {/* Send Code / Reset Button */}
                <TouchableOpacity 
                  style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]} 
                  onPress={handleReset}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send Link</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Step 2: Email Dispatched Notice */}
              <View style={styles.successIconContainer}>
                <View style={styles.successIconOuter}>
                  <Feather name="mail" size={44} color="#0B2564" />
                </View>
              </View>

              <View style={styles.titleContainerCentred}>
                <Text style={styles.titleCentered}>Verify Your Email</Text>
                <Text style={styles.subtitleCentered}>
                  We sent a secure password reset link to:
                </Text>
                <Text style={styles.maskedEmailText}>
                  {maskEmail(sentToEmail)}
                </Text>
                <Text style={styles.subtitleCentered}>
                  Please check your inbox and tap the link to complete resetting your password.
                </Text>
              </View>

              <View style={styles.formContainer}>
                {errorMsg ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <TouchableOpacity 
                  style={[
                    styles.resendButton, 
                    cooldown > 0 && styles.resendButtonDisabled
                  ]} 
                  onPress={handleResend}
                  disabled={cooldown > 0 || isSubmitting}
                >
                  <Text style={[
                    styles.resendButtonText,
                    cooldown > 0 && styles.resendButtonTextDisabled
                  ]}>
                    {cooldown > 0 ? `Resend Link in ${cooldown}s` : 'Resend Link'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.backToLoginButton}
                  onPress={() => navigation.navigate('Login')}
                >
                  <Text style={styles.backToLoginButtonText}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

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
    paddingTop: 16,
  },
  titleContainer: {
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
  successIconContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  successIconOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F0F4FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainerCentred: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  titleCentered: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitleCentered: {
    fontSize: 15,
    color: '#718096',
    lineHeight: 22,
    textAlign: 'center',
  },
  maskedEmailText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B2564',
    marginVertical: 10,
    textAlign: 'center',
  },
  resendButton: {
    backgroundColor: '#0B2564',
    borderRadius: 20,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  resendButtonDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resendButtonTextDisabled: {
    color: '#94A3B8',
  },
  backToLoginButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE1E7',
    borderRadius: 20,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  backToLoginButtonText: {
    color: '#2D3748',
    fontSize: 16,
    fontWeight: '600',
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
});
