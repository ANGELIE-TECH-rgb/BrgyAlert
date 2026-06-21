import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { ScrollView } from 'react-native';

export default function ReportSuccess({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { reportId = 'NEW', estimatedTime = '15 - 30 Minutes' } = route.params || {};

  const isOffline = reportId === 'OFFLINE_SMS';
  const displayId = reportId.length > 8 ? reportId.substring(0, 8).toUpperCase() : reportId;
  const homeRoute = user ? 'CitizenHome' : 'Login';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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

      {/* Navigation Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.navigate(homeRoute)}
        >
          <Feather name="arrow-left" size={20} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Scrollable Content Wrapper */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Main Content Container inside Secure Card */}
        <View style={styles.secureCard}>
          
          {/* Concentric Circle Success Badge */}
          <View style={styles.iconOuterRing}>
            <View style={styles.iconMiddleRing}>
              <View style={styles.iconInnerCircle}>
                <Ionicons 
                  name={isOffline ? "chatbubble-ellipses" : "shield-checkmark"} 
                  size={56} 
                  color="#2563EB" 
                />
              </View>
            </View>
          </View>

          {/* Success Title */}
          <Text style={styles.title}>
            {isOffline ? 'SMS Report Compiled' : 'Report Successfully Submitted'}
          </Text>
          
          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {isOffline 
              ? 'We have compiled your report details into an SMS. Please make sure to press SEND on the native messaging screen to transmit it.'
              : `Thank you for helping keep our community safe. Your report (Report #${displayId}) has been received and is being reviewed by the Barangay Command Center.`
            }
          </Text>

          {/* Transmission Card */}
          <View style={styles.timeCard}>
            <View style={styles.clockIconWrapper}>
              <Feather name={isOffline ? "message-square" : "clock"} size={20} color="#2563EB" />
            </View>
            <View style={styles.timeTextWrapper}>
              <Text style={styles.timeLabel}>
                {isOffline ? 'TRANSMISSION CHANNEL' : 'ESTIMATED REVIEW TIME'}
              </Text>
              <Text style={styles.timeValue}>
                {isOffline ? 'Native SMS Client' : estimatedTime}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View style={styles.footer}>
        {user ? (
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => {
              if (isOffline) {
                navigation.navigate('CitizenReports');
              } else {
                navigation.navigate('StatusTracker', { alertId: reportId });
              }
            }}
          >
            <Text style={styles.primaryButtonText}>
              {isOffline ? 'View my Reports' : 'View my Report'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.primaryButtonText}>Go to Sign In</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={styles.textButton}
          onPress={() => navigation.navigate(homeRoute)}
        >
          <Text style={styles.textButtonText}>
            {user ? 'Back to Home' : 'Back to Login'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
  },
  navHeader: {
    height: 64,
    justifyContent: 'center',
    backgroundColor: 'transparent',
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
    borderColor: '#ECEEF1',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  iconOuterRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconMiddleRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconInnerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth, very soft blue shadow
    shadowColor: '#2563EB40',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0F2C59',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
    marginBottom: 36,
    fontWeight: '500',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 16,
  },
  secureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0B2564',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  timeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  clockIconWrapper: {
    backgroundColor: '#EFF6FF',
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  timeTextWrapper: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginTop: 2,
  },
  footer: {
    paddingBottom: 40,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#0F2C59',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2C5940',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  textButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  textButtonText: {
    color: '#0F2C59',
    fontSize: 14,
    fontWeight: '700',
  },
});
