import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function IncidentCard({ incident, onPress }) {
  // Format the status for styling
  const status = incident.status || 'submitted';

  // Custom status color schemes — must match admin badge & StatusTracker pill colors
  let statusText = 'Pending';
  let tagBg = '#FFF9E6';
  let tagColor = '#D97706'; // Amber

  if (status === 'under_review') {
    statusText = 'Under Review';
    tagBg = '#EFF6FF';
    tagColor = '#2563EB'; // Blue
  } else if (status === 'dispatched') {
    statusText = 'Dispatched';
    tagBg = '#ECFDF5';
    tagColor = '#10B981'; // Green
  } else if (status === 'done' || status === 'resolved') {
    statusText = 'Resolved';
    tagBg = '#F3F4F6';
    tagColor = '#4B5563'; // Grey
  } else if (status === 'declined') {
    statusText = 'Declined';
    tagBg = '#FEF2F2';
    tagColor = '#EF4444'; // Red
  }

  // Format Date and Time
  let dateText = 'Date unavailable';
  if (incident.createdAt) {
    try {
      const date = incident.createdAt.toDate ? incident.createdAt.toDate() : new Date(incident.createdAt);
      dateText = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }) + `, at ` + date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      console.warn('Error formatting date:', e);
    }
  }

  // Shorten Description for display if needed
  const desc = incident.details || 'No details provided.';
  const displayDesc = desc.length > 50 ? desc.substring(0, 47) + '...' : desc;

  // Render short ID from doc ID
  const displayId = incident.id ? incident.id.substring(0, 8).toUpperCase() : (incident.alertId ? incident.alertId.substring(0, 8).toUpperCase() : 'NEW');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Top Row: Report ID and Status Tag */}
      <View style={styles.topRow}>
        <Text style={styles.reportId}>Report #{displayId}</Text>
        <View style={[styles.statusTag, { backgroundColor: tagBg }]}>
          <Text style={[styles.statusText, { color: tagColor }]}>{statusText}</Text>
        </View>
      </View>

      {/* Middle Row: Description and Right Chevron */}
      <View style={styles.middleRow}>
        <Text style={styles.detailsText}>{displayDesc}</Text>
        <Feather name="chevron-right" size={20} color="#9CA3AF" />
      </View>

      {/* Bottom Row: Timestamp */}
      <View style={styles.bottomRow}>
        <Text style={styles.timestampText}>Updated: On {dateText}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportId: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  statusTag: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  middleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
    paddingRight: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  timestampText: {
    fontSize: 12,
    color: '#6B7280',
  },
});

