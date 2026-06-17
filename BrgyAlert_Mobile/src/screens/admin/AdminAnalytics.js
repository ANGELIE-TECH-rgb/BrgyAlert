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
  Rect,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { db } from '../../services/firebaseConfig';
import AdminBottomTabNav from '../../components/AdminBottomTabNav';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 96; // Accounting for 24px screen padding + 20px card padding + safety margin on each side
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
        console.log('Snapshot listener error on AdminAnalytics:', error);
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
      labels.push(`${daysOfWeek[d.getDay()]} ${d.getDate()}`);
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

  const getInsights = () => {
    if (totalCount === 0) {
      return {
        text: "No alerts filed in this time frame. Operational activity is fully clear.",
        badge: "All Clear",
        color: "#10B981",
        bg: "#F0FDF4",
        icon: "smile"
      };
    }

    const topCategory = processedCategories[0];
    const topCategoryLabel = topCategory ? topCategory.label.split('/')[0] : 'General';
    const topCategoryCount = topCategory ? topCategory.count : 0;
    
    // Most active priority
    let mainUrgency = 'Medium';
    const totalUrgency = urgencyCounts.high + urgencyCounts.medium + urgencyCounts.low;
    if (totalUrgency > 0) {
      if (urgencyCounts.high >= urgencyCounts.medium && urgencyCounts.high >= urgencyCounts.low) {
        mainUrgency = 'High';
      } else if (urgencyCounts.low >= urgencyCounts.medium && urgencyCounts.low >= urgencyCounts.high) {
        mainUrgency = 'Low';
      }
    }

    let insightText = '';
    let badge = 'Operational Summary';
    let color = '#2563EB';
    let bg = '#EFF6FF';
    let icon = 'info';

    if (statusCounts.active > 5) {
      insightText = `Active queue is high (${statusCounts.active} reports). Triage pending reports immediately to dispatch emergency response teams.`;
      badge = 'Triage Needed';
      color = '#EF4444';
      bg = '#FEF2F2';
      icon = 'alert-triangle';
    } else if (resolutionRate > 80) {
      insightText = `Outstanding response performance! Resolution rate is at ${resolutionRate.toFixed(0)}%. ${topCategoryLabel} cases make up ${topCategoryCount} of the logs.`;
      badge = 'Excellent Status';
      color = '#10B981';
      bg = '#F0FDF4';
      icon = 'thumbs-up';
    } else {
      insightText = `${topCategoryLabel} represents the highest volume incident type with ${topCategoryCount} reports. Incident priority leans towards ${mainUrgency}.`;
      badge = 'Trend Alert';
      color = '#EA580C';
      bg = '#FFF7ED';
      icon = 'trending-up';
    }

    return { text: insightText, badge, color, bg, icon };
  };

  const operationalInsight = getInsights();

  const getUrgencyTheme = (name) => {
    if (name === 'High') {
      return { bg: '#FEF2F2', border: '#FEE2E2', text: '#EF4444', label: 'High Priority' };
    }
    if (name === 'Medium') {
      return { bg: '#FFF7ED', border: '#FFEEDB', text: '#D97706', label: 'Medium Priority' };
    }
    return { bg: '#ECFDF5', border: '#D1FAE5', text: '#10B981', label: 'Low Priority' };
  };

  // Circular progress stroke specs
  const RADIUS = 36;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeOffset = CIRCUMFERENCE - (resolutionRate / 100) * CIRCUMFERENCE;

  // Chart configs
  const chartConfigBase = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(11, 37, 100, ${opacity})`, // Navy
    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: '#2563EB',
    },
    propsForBackgroundLines: {
      strokeDasharray: '4 4',
      stroke: '#F3F4F6',
    }
  };

  const barChartConfig = {
    ...chartConfigBase,
    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`, // Primary Blue
    labelColor: (opacity = 1) => `#111827`, // Pure high-contrast dark text
    barPercentage: 0.6,
  };

  const pieChartData = [
    { name: `High`, population: urgencyCounts.high, color: '#EF4444', legendFontColor: '#111827', legendFontSize: 13 },
    { name: `Medium`, population: urgencyCounts.medium, color: '#F59E0B', legendFontColor: '#111827', legendFontSize: 13 },
    { name: `Low`, population: urgencyCounts.low, color: '#10B981', legendFontColor: '#111827', legendFontSize: 13 },
  ];

  const topCategories = processedCategories.slice(0, 5);
  const barChartData = {
    labels: topCategories.map(c => c.label.split('/')[0]),
    datasets: [{ data: topCategories.map(c => c.count) }]
  };



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
          {/* Dynamic Insight Card */}
          <View style={[styles.insightCard, { backgroundColor: operationalInsight.bg, borderColor: operationalInsight.bg }]}>
            <View style={styles.insightHeaderRow}>
              <View style={[styles.insightIconWrapper, { backgroundColor: '#FFFFFF' }]}>
                <Feather name={operationalInsight.icon} size={16} color={operationalInsight.color} />
              </View>
              <View style={[styles.insightBadge, { backgroundColor: operationalInsight.color }]}>
                <Text style={styles.insightBadgeText}>{operationalInsight.badge}</Text>
              </View>
            </View>
            <Text style={[styles.insightText, { color: '#374151' }]}>
              {operationalInsight.text}
            </Text>
          </View>

          {/* Overview Grid Card */}
          <View style={styles.kpiGrid}>
            <TouchableOpacity 
              style={styles.kpiCard}
              onPress={() => navigation.navigate('AdminQueue', { initialFilter: 'all' })}
              activeOpacity={0.8}
            >
              <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Feather name="file-text" size={20} color="#2563EB" />
              </View>
              <Text style={styles.kpiVal}>{totalCount}</Text>
              <Text style={styles.kpiLabel}>Total Cases</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.kpiCard}
              onPress={() => navigation.navigate('AdminQueue', { initialFilter: 'submitted' })}
              activeOpacity={0.8}
            >
              <View style={[styles.kpiIconBox, { backgroundColor: '#FFF7ED' }]}>
                <Feather name="clock" size={20} color="#D97706" />
              </View>
              <Text style={styles.kpiVal}>{statusCounts.active}</Text>
              <Text style={styles.kpiLabel}>Active Queue</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.kpiCard}
              onPress={() => navigation.navigate('AdminQueue', { initialFilter: 'resolved' })}
              activeOpacity={0.8}
            >
              <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Feather name="check-circle" size={20} color="#10B981" />
              </View>
              <Text style={styles.kpiVal}>{statusCounts.resolved}</Text>
              <Text style={styles.kpiLabel}>Cases Resolved</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.kpiCard}
              onPress={() => navigation.navigate('AdminQueue', { initialFilter: 'declined' })}
              activeOpacity={0.8}
            >
              <View style={[styles.kpiIconBox, { backgroundColor: '#FEF2F2' }]}>
                <Feather name="x-circle" size={20} color="#EF4444" />
              </View>
              <Text style={styles.kpiVal}>{statusCounts.declined}</Text>
              <Text style={styles.kpiLabel}>Cases Declined</Text>
            </TouchableOpacity>
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

          {/* Custom SVG Weekly Trend Area Curve Chart -> Now React Native Chart Kit LineChart */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Weekly Ingestion Trend</Text>
            <Text style={styles.sectionSubtitle}>
              Emergency alerts filed per day over the active time range.
            </Text>

            <View style={{ alignItems: 'center', marginTop: 12 }}>
              <LineChart
                data={{
                  labels: trend.labels,
                  datasets: [{
                    data: trend.counts,
                    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
                    strokeWidth: 3
                  }]
                }}
                width={CHART_WIDTH}
                height={220}
                yAxisLabel=""
                yAxisSuffix=""
                yAxisInterval={1}
                chartConfig={{
                  ...chartConfigBase,
                  backgroundGradientFrom: '#F8FAFC',
                  backgroundGradientTo: '#FFFFFF',
                  propsForDots: {
                    r: '5',
                    strokeWidth: '2.5',
                    stroke: '#FFFFFF',
                  }
                }}
                withVerticalLines={false}
                bezier
                style={{
                  marginVertical: 8,
                  borderRadius: 16,
                  paddingRight: 10,
                }}
              />
            </View>
          </View>

          {/* Urgent Distribution & Priority Ratio -> Pie Chart */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Priority Urgency Breakdown</Text>
            <Text style={styles.sectionSubtitle}>
              Ratio distribution of incident urgencies designated to reports.
            </Text>

            <View style={styles.pieSectionRow}>
              <View style={styles.pieChartWrapper}>
                <PieChart
                  data={pieChartData}
                  width={SCREEN_WIDTH * 0.4}
                  height={120}
                  chartConfig={chartConfigBase}
                  accessor={"population"}
                  backgroundColor={"transparent"}
                  paddingLeft={"15"}
                  center={[0, 0]}
                  hasLegend={false}
                  absolute
                />
              </View>

              <View style={styles.customPieLegendColumn}>
                {pieChartData.map((item, index) => {
                  const theme = getUrgencyTheme(item.name);
                  const totalUrgency = urgencyCounts.high + urgencyCounts.medium + urgencyCounts.low;
                  const pct = totalUrgency > 0 ? (item.population / totalUrgency) * 100 : 0;
                  return (
                    <View key={index} style={[styles.legendChipItem, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                      <View style={styles.legendChipLeft}>
                        <View style={[styles.legendDotKey, { backgroundColor: item.color }]} />
                        <Text style={[styles.legendLabelName, { color: theme.text }]}>{theme.label}</Text>
                      </View>
                      <Text style={[styles.legendLabelPercentage, { color: theme.text }]}>
                        {item.population} cases • {pct.toFixed(0)}%
                      </Text>
                    </View>
                  );
                })}
              </View>
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
                <TouchableOpacity 
                  key={idx} 
                  style={styles.categoryRow}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('AdminQueue', { initialSearch: cat.name })}
                >
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
                    <Feather name="chevron-right" size={14} color="#9CA3AF" style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Bottom Smooth Gradient Background Fade */}
      <View style={styles.bottomGradient} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="fadeGradA" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0"   stopColor="#FFFFFF" stopOpacity="0"    />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.85" />
              <Stop offset="1"   stopColor="#FFFFFF" stopOpacity="1"    />
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#fadeGradA)" />
        </Svg>
      </View>

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
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 5,
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
  insightCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  insightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  insightIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  insightBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  insightBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  insightText: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  pieSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  pieChartWrapper: {
    flex: 0.42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customPieLegendColumn: {
    flex: 0.58,
    paddingLeft: 8,
  },
  legendChipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  legendChipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDotKey: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  legendLabelName: {
    fontSize: 11,
    fontWeight: '700',
  },
  legendLabelPercentage: {
    fontSize: 10.5,
    fontWeight: '800',
  },
});
