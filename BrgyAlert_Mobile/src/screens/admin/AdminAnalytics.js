import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Feather } from '@expo/vector-icons';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import { db } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 48; // Padding horizontal is 24 on each side
const CHART_HEIGHT = 160;

export default function AdminAnalytics({ navigation }) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'week'

  // Fetch all alerts in real-time
  useEffect(() => {
    const q = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push({
            id: doc.id,
            ...doc.data(),
          });
        });
        setAlerts(list);
        setLoading(false);
      },
      (error) => {
        console.error('Snapshot listener error on AdminAnalytics:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter alerts by time filter selection
  const filteredAlerts = alerts.filter((alert) => {
    if (timeFilter === 'all') return true;
    if (!alert.createdAt) return false;

    const alertDate = alert.createdAt.toDate
      ? alert.createdAt.toDate()
      : new Date(alert.createdAt);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return alertDate >= oneWeekAgo;
  });

  // Calculate Metrics
  const totalCount = filteredAlerts.length;
  
  const statusCounts = filteredAlerts.reduce(
    (acc, alert) => {
      const status = alert.status || 'submitted';
      if (status === 'resolved' || status === 'done') {
        acc.resolved++;
      } else if (status === 'declined') {
        acc.declined++;
      } else {
        acc.active++;
      }
      return acc;
    },
    { active: 0, resolved: 0, declined: 0 }
  );

  // Resolution Rate = Resolved / (Total - Declined)
  const baseCount = totalCount - statusCounts.declined;
  const resolutionRate = baseCount > 0 ? (statusCounts.resolved / baseCount) * 100 : 0;

  // Category counts and calculations
  const categoriesList = [
    { name: 'Physical Abuse', label: 'Abuse/Violence', icon: 'shield', color: '#EF4444', bg: '#FEF2F2' },
    { name: 'Crime', label: 'Crime/Theft', icon: 'shield', color: '#EF4444', bg: '#FEF2F2' },
    { name: 'Fire', label: 'Fire Emergency', icon: 'alert-triangle', color: '#F97316', bg: '#FFF7ED' },
    { name: 'Medical', label: 'Medical Emergency', icon: 'activity', color: '#EF4444', bg: '#FEF2F2' },
    { name: 'Flooding', label: 'Flooding/Disaster', icon: 'droplet', color: '#3B82F6', bg: '#EFF6FF' },
    { name: 'Accident', label: 'Accident/Injury', icon: 'alert-octagon', color: '#D97706', bg: '#FFF7ED' },
    { name: 'Traffic', label: 'Traffic Blockage', icon: 'truck', color: '#D97706', bg: '#FFF7ED' },
  ];

  const categoryAggregates = filteredAlerts.reduce((acc, alert) => {
    const cat = alert.category || 'General';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const processedCategories = categoriesList
    .map((cat) => {
      const count = categoryAggregates[cat.name] || 0;
      const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;
      return { ...cat, count, percentage };
    })
    .sort((a, b) => b.count - a.count); // Show highest incident volumes first

  // Urgency Counts
  const urgencyCounts = filteredAlerts.reduce(
    (acc, alert) => {
      const urgency = (alert.urgency || 'medium').toLowerCase();
      if (urgency === 'high' || urgency === 'critical') acc.high++;
      else if (urgency === 'low') acc.low++;
      else acc.medium++;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  // Generate Weekly Trends for the Area Chart (past 7 days)
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const getWeeklyTrend = () => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const labels = [];
    const now = new Date();
    
    // Create past 7 days labels and start day limits
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      labels.push(daysOfWeek[d.getDay()]);
    }

    filteredAlerts.forEach((alert) => {
      if (!alert.createdAt) return;
      const alertDate = alert.createdAt.toDate
        ? alert.createdAt.toDate()
        : new Date(alert.createdAt);

      const diffTime = now.getTime() - alertDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays < 7) {
        counts[6 - diffDays]++;
      }
    });

    return { counts, labels };
  };

  const trend = getWeeklyTrend();
  const maxTrendValue = Math.max(...trend.counts, 5); // Fallback to 5 to avoid flat scale

  // Compute SVG coordinates for custom Area Curve Chart
  const getSvgCoordinates = () => {
    const paddingLeftRight = 32;
    const paddingTop = 20;
    const paddingBottom = 25;
    
    const chartUsableWidth = CHART_WIDTH - paddingLeftRight * 2;
    const chartUsableHeight = CHART_HEIGHT - paddingTop - paddingBottom;
    
    const points = trend.counts.map((val, idx) => {
      const x = paddingLeftRight + (idx * chartUsableWidth) / 6;
      const y = CHART_HEIGHT - paddingBottom - (val * chartUsableHeight) / maxTrendValue;
      return { x, y };
    });

    // Create spline string commands
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      // Simple cubic bezier curve approximation for smooth lines
      const prev = points[i - 1];
      const curr = points[i];
      const cpX1 = prev.x + (curr.x - prev.x) / 3;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (2 * (curr.x - prev.x)) / 3;
      const cpY2 = curr.y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
    }

    const areaPath =
      `${linePath} L ${points[points.length - 1].x} ${CHART_HEIGHT - paddingBottom} L ${points[0].x} ${CHART_HEIGHT - paddingBottom} Z`;

    return { points, linePath, areaPath, paddingLeftRight, paddingBottom };
  };

  const svgCoords = getSvgCoordinates();

  // Circular progress stroke specs
  const RADIUS = 36;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeOffset = CIRCUMFERENCE - (resolutionRate / 100) * CIRCUMFERENCE;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header Panel */}
      <View style={styles.header}>
        <View style={styles.headerTextRow}>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSubtitle}>Real-time logs performance dashboard</Text>
        </View>

        {/* Filter Toggle Pill Row */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, timeFilter === 'all' && styles.toggleBtnActive]}
            onPress={() => setTimeFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, timeFilter === 'all' && styles.toggleTextActive]}>
              All Time
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, timeFilter === 'week' && styles.toggleBtnActive]}
            onPress={() => setTimeFilter('week')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, timeFilter === 'week' && styles.toggleTextActive]}>
              Last 7 Days
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0B2564" />
          <Text style={styles.loadingText}>Loading analytics data...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Overview Grid Card */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Feather name="file-text" size={20} color="#2563EB" />
              </View>
              <Text style={styles.kpiVal}>{totalCount}</Text>
              <Text style={styles.kpiLabel}>Total Cases</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#FFF7ED' }]}>
                <Feather name="clock" size={20} color="#D97706" />
              </View>
              <Text style={styles.kpiVal}>{statusCounts.active}</Text>
              <Text style={styles.kpiLabel}>Active Queue</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Feather name="check-circle" size={20} color="#10B981" />
              </View>
              <Text style={styles.kpiVal}>{statusCounts.resolved}</Text>
              <Text style={styles.kpiLabel}>Cases Resolved</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#FEF2F2' }]}>
                <Feather name="x-circle" size={20} color="#EF4444" />
              </View>
              <Text style={styles.kpiVal}>{statusCounts.declined}</Text>
              <Text style={styles.kpiLabel}>Cases Declined</Text>
            </View>
          </View>

          {/* Premium Circular Resolution Rate Gauge */}
          <View style={styles.sectionCard}>
            <View style={styles.gaugeContainer}>
              <View style={styles.gaugeLeft}>
                <Text style={styles.sectionTitle}>Response Performance</Text>
                <Text style={styles.sectionSubtitle}>
                  Ratio of reported incidents successfully addressed and marked resolved, excluding declined logs.
                </Text>
                <View style={styles.ratioDetailRow}>
                  <View style={[styles.dotMarker, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.ratioDetailText}>
                    Resolved: {statusCounts.resolved} / {baseCount} cases
                  </Text>
                </View>
              </View>

              <View style={styles.gaugeRight}>
                <Svg width="100" height="100" viewBox="0 0 100 100">
                  {/* Gray Background Circle */}
                  <Circle
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="transparent"
                    stroke="#F3F4F6"
                    strokeWidth="8"
                  />
                  {/* Navy Progress Circle Ring */}
                  <Circle
                    cx="50"
                    cy="50"
                    r={RADIUS}
                    fill="transparent"
                    stroke="#0F2C59"
                    strokeWidth="8"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                  {/* Central Text */}
                  <SvgText
                    x="50"
                    y="55"
                    fontSize="16"
                    fontWeight="bold"
                    fill="#1F2937"
                    textAnchor="middle"
                  >
                    {`${resolutionRate.toFixed(0)}%`}
                  </SvgText>
                </Svg>
              </View>
            </View>
          </View>

          {/* Custom SVG Weekly Trend Area Curve Chart */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Weekly Ingestion Trend</Text>
            <Text style={styles.sectionSubtitle}>
              Emergency alerts filed per day over the active time range.
            </Text>

            <View style={styles.chartWrapper}>
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <Defs>
                  {/* Fill Gradient */}
                  <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#0B2564" stopOpacity="0.3" />
                    <Stop offset="1" stopColor="#0B2564" stopOpacity="0.0" />
                  </LinearGradient>
                </Defs>

                {/* Grid guidelines */}
                {[0, 0.5, 1].map((pct, idx) => {
                  const y = 20 + pct * (CHART_HEIGHT - 45);
                  return (
                    <Path
                      key={idx}
                      d={`M 32 ${y} H ${CHART_WIDTH - 32}`}
                      stroke="#F3F4F6"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                  );
                })}

                {/* Area under the trend curve */}
                <Path d={svgCoords.areaPath} fill="url(#chartGrad)" />

                {/* Core trend spline line */}
                <Path d={svgCoords.linePath} fill="none" stroke="#0F2C59" strokeWidth="3" />

                {/* Interactive Points / Tooltip Values */}
                {svgCoords.points.map((pt, idx) => {
                  const val = trend.counts[idx];
                  return (
                    <React.Fragment key={idx}>
                      <Circle cx={pt.x} cy={pt.y} r="4.5" fill="#FFFFFF" stroke="#0F2C59" strokeWidth="2.5" />
                      {val > 0 && (
                        <SvgText
                          x={pt.x}
                          y={pt.y - 10}
                          fontSize="9"
                          fontWeight="700"
                          fill="#0F2C59"
                          textAnchor="middle"
                        >
                          {val}
                        </SvgText>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Day labels at the bottom */}
                {trend.labels.map((lbl, idx) => {
                  const x = svgCoords.paddingLeftRight + (idx * (CHART_WIDTH - svgCoords.paddingLeftRight * 2)) / 6;
                  return (
                    <SvgText
                      key={idx}
                      x={x}
                      y={CHART_HEIGHT - 6}
                      fontSize="9"
                      fontWeight="bold"
                      fill="#9CA3AF"
                      textAnchor="middle"
                    >
                      {lbl}
                    </SvgText>
                  );
                })}
              </Svg>
            </View>
          </View>

          {/* Urgent Distribution & Priority Ratio */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Priority Urgency Breakdown</Text>
            <Text style={styles.sectionSubtitle}>
              Ratio distribution of incident urgencies designated to reports.
            </Text>

            <View style={styles.priorityContainer}>
              <View style={styles.priorityRow}>
                <View style={styles.priorityItem}>
                  <Text style={[styles.priorityVal, { color: '#EF4444' }]}>
                    {urgencyCounts.high}
                  </Text>
                  <Text style={styles.priorityLabel}>High Priority</Text>
                </View>
                <View style={styles.priorityItem}>
                  <Text style={[styles.priorityVal, { color: '#F59E0B' }]}>
                    {urgencyCounts.medium}
                  </Text>
                  <Text style={styles.priorityLabel}>Medium Priority</Text>
                </View>
                <View style={styles.priorityItem}>
                  <Text style={[styles.priorityVal, { color: '#10B981' }]}>
                    {urgencyCounts.low}
                  </Text>
                  <Text style={styles.priorityLabel}>Low Priority</Text>
                </View>
              </View>

              {/* Stacked Ratio Progress Bar */}
              {totalCount > 0 ? (
                <View style={styles.ratioBarOuter}>
                  <View
                    style={[
                      styles.ratioBarSegment,
                      {
                        backgroundColor: '#EF4444',
                        width: `${(urgencyCounts.high / totalCount) * 100}%`,
                        borderBottomLeftRadius: 5,
                        borderTopLeftRadius: 5,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.ratioBarSegment,
                      {
                        backgroundColor: '#F59E0B',
                        width: `${(urgencyCounts.medium / totalCount) * 100}%`,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.ratioBarSegment,
                      {
                        backgroundColor: '#10B981',
                        width: `${(urgencyCounts.low / totalCount) * 100}%`,
                        borderBottomRightRadius: 5,
                        borderTopRightRadius: 5,
                      },
                    ]}
                  />
                </View>
              ) : (
                <View style={[styles.ratioBarOuter, { backgroundColor: '#F3F4F6' }]} />
              )}
            </View>
          </View>

          {/* Incident Category Distribution List */}
          <View style={[styles.sectionCard, { marginBottom: 20 }]}>
            <Text style={styles.sectionTitle}>Incident Density (By Type)</Text>
            <Text style={styles.sectionSubtitle}>
              Breakdown of emergency reports compiled by category.
            </Text>

            <View style={styles.categoryList}>
              {processedCategories.map((cat, idx) => (
                <View key={idx} style={styles.categoryRow}>
                  <View style={styles.categoryLeft}>
                    <View style={[styles.categoryIconBox, { backgroundColor: cat.bg }]}>
                      <Feather name={cat.icon} size={15} color={cat.color} />
                    </View>
                    <Text style={styles.categoryLabelText}>{cat.label}</Text>
                  </View>

                  <View style={styles.categoryRight}>
                    <Text style={styles.categoryCountVal}>{cat.count} cases</Text>
                    {/* Horizontal Progress Bar */}
                    <View style={styles.barBackground}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${cat.percentage}%`,
                            backgroundColor: cat.color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.categoryPercentText}>
                      {cat.percentage.toFixed(0)}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Floating Bottom Tab Nav Bar */}
      <AdminBottomTabNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  headerTextRow: {
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 18,
  },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#0F2C59',
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 155,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#4B5563',
    fontSize: 14,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 1,
  },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  kpiVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#00000040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 1.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 16,
  },
  gaugeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gaugeLeft: {
    flex: 1,
    marginRight: 16,
  },
  ratioDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dotMarker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  ratioDetailText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  gaugeRight: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  priorityContainer: {
    paddingVertical: 4,
  },
  priorityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  priorityItem: {
    alignItems: 'center',
    flex: 1,
  },
  priorityVal: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  priorityLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  ratioBarOuter: {
    height: 10,
    flexDirection: 'row',
    borderRadius: 5,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  ratioBarSegment: {
    height: '100%',
  },
  categoryList: {
    marginTop: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#F9FAFB',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 0.45,
  },
  categoryIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  categoryLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 0.55,
  },
  categoryCountVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginRight: 10,
    minWidth: 52,
    textAlign: 'right',
  },
  barBackground: {
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
    marginRight: 10,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  categoryPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    minWidth: 32,
    textAlign: 'right',
  },
});
