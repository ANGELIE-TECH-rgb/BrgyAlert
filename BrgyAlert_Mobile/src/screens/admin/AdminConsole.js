import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  StatusBar, 
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebaseConfig';
import IncidentCard from '../../components/IncidentCard';

export default function AdminConsole({ navigation }) {
  const { userProfile, logout } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [criticalCount, setCriticalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  // Fetch ALL reports in real-time for the Admin Console
  useEffect(() => {
    const q = query(
      collection(db, 'alerts'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alertsList = [];
      let critical = 0;
      let pending = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const alertItem = {
          id: doc.id,
          ...data
        };
        alertsList.push(alertItem);

        // Count critical active issues
        if (data.urgency === 'critical' && data.status !== 'done' && data.status !== 'resolved') {
          critical++;
        }
        // Count pending triage issues
        if (data.status === 'submitted') {
          pending++;
        }
      });

      setAllAlerts(alertsList);
      setCriticalCount(critical);
      setPendingCount(pending);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching admin alerts snapshot:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getFormattedDate = () => {
    return new Date().toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    const displayName = userProfile?.fullName ? userProfile.fullName.split(' ')[0] : 'Admin';
    if (hours < 12) return `Good morning, ${displayName}`;
    if (hours < 18) return `Good afternoon, ${displayName}`;
    return `Good evening, ${displayName}`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header Block (Cohesive with Citizen Dashboard) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
          <Text style={styles.dateText}>{getFormattedDate()}</Text>
          
          {/* Active Command Indicator */}
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.statusLabel}>Command Console Active</Text>
          </View>
        </View>
        
        {/* Logout Button in header matching bell button position */}
        <TouchableOpacity 
          style={styles.logoutHeaderButton}
          onPress={logout}
        >
          <Feather name="log-out" size={20} color="#DC2626" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Welcome Profile Card */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeCardHeader}>
            <View>
              <Text style={styles.welcomeText}>Logged in as Responder/Staff</Text>
              <Text style={styles.userName}>{userProfile?.fullName || 'Barangay Staff'}</Text>
            </View>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>{userProfile?.role?.toUpperCase() || 'RESPONDER'}</Text>
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <Feather name="mail" size={14} color="#6B7280" style={{ marginRight: 8 }} />
            <Text style={styles.infoValue}>{userProfile?.email || 'N/A'}</Text>
          </View>
        </View>

        {/* Live Metrics Tiles (styled like Services Cards) */}
        <View style={styles.metricsContainer}>
          <View style={[styles.metricBox, styles.metricCritical]}>
            <View style={styles.metricIconWrapperCritical}>
              <Feather name="alert-triangle" size={18} color="#EF4444" />
            </View>
            <View style={styles.metricTextWrapper}>
              <Text style={styles.metricCountText}>{criticalCount}</Text>
              <Text style={styles.metricLabelText}>Critical Alerts</Text>
            </View>
          </View>
          
          <View style={[styles.metricBox, styles.metricPending]}>
            <View style={styles.metricIconWrapperPending}>
              <Feather name="clock" size={18} color="#D97706" />
            </View>
            <View style={styles.metricTextWrapper}>
              <Text style={styles.metricCountText}>{pendingCount}</Text>
              <Text style={styles.metricLabelText}>Pending Triage</Text>
            </View>
          </View>
        </View>

        {/* Live Incident Command List */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Live Command Queue ({allAlerts.length})</Text>

          {loading ? (
            <ActivityIndicator style={styles.loader} color="#0F2C59" />
          ) : allAlerts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="list" size={36} color="#9CA3AF" style={styles.emptyIcon} />
              <Text style={styles.emptyText}>No emergency reports in queue.</Text>
            </View>
          ) : (
            allAlerts.map((item) => (
              <IncidentCard 
                key={item.id} 
                incident={item} 
                onPress={() => alert(`Details for Report #${item.id.substring(0, 8).toUpperCase()}:\n\nType: ${item.category}\nDetails: ${item.details}\nStatus: ${item.status}\nUrgency: ${item.urgency}`)}
              />
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  dateText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  logoutHeaderButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    // Smooth red shadow
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    // Smooth, soft shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  welcomeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  welcomeText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2C59',
    marginTop: 4,
  },
  roleTag: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  roleTagText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoValue: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
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
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    // Smooth, soft shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  metricCritical: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  metricPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
  },
  metricIconWrapperCritical: {
    backgroundColor: '#FEE2E2',
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  metricIconWrapperPending: {
    backgroundColor: '#FEF3C7',
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  metricTextWrapper: {
    flex: 1,
  },
  metricCountText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  metricLabelText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 2,
  },
  sectionContainer: {
    width: '100%',
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  loader: {
    marginVertical: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
  },
  emptyIcon: {
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
});
