import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  AppState,
  Linking,
  ActivityIndicator
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function LocationRequiredModal() {
  const [checking, setChecking] = useState(true);
  const [requirementsPassed, setRequirementsPassed] = useState(false);
  const [isInitialCheck, setIsInitialCheck] = useState(true);

  // Function to check location services & permissions
  const verifyLocationStatus = async () => {
    try {
      setChecking(true);
      // 1. Check if location services (GPS) are enabled globally
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setRequirementsPassed(false);
        setChecking(false);
        return;
      }

      // 2. Check if foreground permission is granted
      let { status } = await Location.getForegroundPermissionsAsync();
      
      // If not granted, try to request it actively
      if (status !== 'granted') {
        const { status: requestedStatus } = await Location.requestForegroundPermissionsAsync();
        status = requestedStatus;
      }

      if (status === 'granted') {
        setRequirementsPassed(true);
      } else {
        setRequirementsPassed(false);
      }
    } catch (err) {
      console.log('[LocationRequiredModal] Error checking location status:', err);
      setRequirementsPassed(false);
    } finally {
      setChecking(false);
      setIsInitialCheck(false);
    }
  };

  useEffect(() => {
    // Run initial check on mount
    verifyLocationStatus();

    // Recheck status when the app returns to the foreground (e.g. user went to Settings and came back)
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active') {
        verifyLocationStatus();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const handleOpenSettings = () => {
    Linking.openSettings().catch((err) => {
      console.log('[LocationRequiredModal] Failed to open device settings:', err);
    });
  };

  // Prevent flashing on app startup: only show modal if we FINISHED the initial check and they FAILED.
  if (requirementsPassed || isInitialCheck) {
    return null;
  }

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={false}
      statusBarTranslucent={true}
      onRequestClose={() => {}} // Non-dismissible
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Circular alert icon wrapper */}
          <View style={styles.iconCircle}>
            <Ionicons name="location" size={48} color="#EF4444" />
          </View>

          {/* Heading */}
          <Text style={styles.title}>Location Access Required</Text>
          
          {/* Context Text */}
          <Text style={styles.description}>
            BrgyAlert is an emergency response and safety reporting system. To coordinate swift responder dispatches and map incidents accurately, you must enable your device's location services (GPS) and grant location permission.
          </Text>

          {/* Verification indicator */}
          {checking ? (
            <View style={styles.checkingContainer}>
              <ActivityIndicator size="small" color="#0B2564" style={{ marginRight: 8 }} />
              <Text style={styles.checkingText}>Verifying settings...</Text>
            </View>
          ) : (
            <View style={styles.alertWarning}>
              <Ionicons name="warning-outline" size={16} color="#B45309" style={{ marginRight: 6 }} />
              <Text style={styles.alertWarningText}>GPS disabled or permission denied.</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={handleOpenSettings}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Open Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={verifyLocationStatus}
              disabled={checking}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh-outline" size={18} color="#0B2564" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Check Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkingText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  alertWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  alertWarningText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B45309',
  },
  actions: {
    width: '100%',
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#0B2564',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#0B2564',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0B2564',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0B2564',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
