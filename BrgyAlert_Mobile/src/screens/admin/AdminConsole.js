import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { useAuth } from '../../context/AuthContext';

export default function AdminConsole() {
  const { userProfile, logout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F2C59" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BrgyAlert Admin Console</Text>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeText}>Logged in as Responder/Official,</Text>
          <Text style={styles.userName}>{userProfile?.fullName || 'Barangay Staff'}</Text>
          
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role:</Text>
            <Text style={[styles.infoValue, styles.adminRole]}>{userProfile?.role?.toUpperCase() || 'RESPONDER'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{userProfile?.email || 'N/A'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Contact:</Text>
            <Text style={styles.infoValue}>{userProfile?.phoneNumber || 'N/A'}</Text>
          </View>
        </View>

        {/* Quick Metrics Placeholder */}
        <View style={styles.metricsContainer}>
          <View style={[styles.metricBox, styles.metricCritical]}>
            <Text style={styles.metricCount}>0</Text>
            <Text style={styles.metricLabel}>Critical Alerts</Text>
          </View>
          <View style={[styles.metricBox, styles.metricPending]}>
            <Text style={styles.metricCount}>0</Text>
            <Text style={styles.metricLabel}>Pending Triage</Text>
          </View>
        </View>

        <Text style={styles.statusMsg}>
          This is the Admin Dashboard. The Dispatch Queue and Evacuation Center monitors are coming in Sprint 3!
        </Text>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#0F2C59',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  welcomeText: {
    fontSize: 14,
    color: '#6C757D',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0F2C59',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E9ECEF',
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6C757D',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1A1D20',
    fontWeight: '600',
  },
  adminRole: {
    color: '#FF9E00',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  metricCritical: {
    borderLeftWidth: 4,
    borderLeftColor: '#DC3545',
  },
  metricPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF9E00',
  },
  metricCount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1D20',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 4,
  },
  statusMsg: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
    lineHeight: 20,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  logoutButton: {
    backgroundColor: '#DC3545',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#DC3545',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
