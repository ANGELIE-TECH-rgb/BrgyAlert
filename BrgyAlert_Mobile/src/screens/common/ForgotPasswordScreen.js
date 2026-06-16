import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const handleReset = async () => {
    if (!email) {
      setErrorMsg('Please enter your email address.');
      setSuccessMsg('');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      await resetPassword(email.trim());
      setSuccessMsg('Reset link sent successfully! Please check your email.');
      setEmail('');
    } catch (error) {
      console.error(error);
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Back Button Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#1A202C" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Header Title */}
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

            {successMsg ? (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>{successMsg}</Text>
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
                <Text style={styles.primaryButtonText}>Send code</Text>
              )}
            </TouchableOpacity>
          </View>

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
  successBanner: {
    backgroundColor: '#E6F4EA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#CEEAD6',
  },
  successText: {
    color: '#28A745',
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
