import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function ConnectionBlocker({ navigation }) {
  const handleGoOfflineReport = () => {
    navigation.navigate('ReportWizard');
  };

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Feather name="wifi-off" size={36} color="#EF4444" />
        </View>
        
        <Text style={styles.title}>Walang Internet Connection</Text>
        <Text style={styles.subtitle}>No Connection Detected</Text>
        
        <Text style={styles.description}>
          Hindi magagamit ang online features sa kasalukuyan. Maaari mong gamitin ang aming offline mode upang magpadala ng ulat ng emergency gamit ang SMS.
        </Text>
        
        <TouchableOpacity 
          style={styles.button}
          onPress={handleGoOfflineReport}
          activeOpacity={0.8}
        >
          <Feather name="message-square" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.buttonText}>Mag-ulat gamit ang SMS</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 14,
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F2C59',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
