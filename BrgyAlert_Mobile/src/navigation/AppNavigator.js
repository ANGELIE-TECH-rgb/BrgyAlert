import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

// Import Screens
import LoginScreen from '../screens/common/LoginScreen';
import RegisterScreen from '../screens/common/RegisterScreen';
import ForgotPasswordScreen from '../screens/common/ForgotPasswordScreen';
import CitizenDashboard from '../screens/citizen/CitizenDashboard';
import AdminConsole from '../screens/admin/AdminConsole';
import IncidentDetail from '../screens/admin/IncidentDetail';
import AdminMapScreen from '../screens/admin/AdminMapScreen';
import AdminQueue from '../screens/admin/AdminQueue';
import ReportWizard from '../screens/citizen/ReportWizard';
import ReportSuccess from '../screens/citizen/ReportSuccess';
import StatusTracker from '../screens/citizen/StatusTracker';
import CitizenReports from '../screens/citizen/CitizenReports';
import ChatMessages from '../screens/citizen/ChatMessages';
import AdminMessages from '../screens/admin/AdminMessages';
import ChatScreen from '../screens/common/ChatScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, userProfile, loading } = useAuth();

  // Show a premium loading indicator while checking auth state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F2C59" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Auth Stack (Unauthenticated)
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : userProfile?.role === 'responder' || userProfile?.role === 'admin' ? (
          // Admin / Responder stack
          <>
            <Stack.Screen name="AdminHome" component={AdminConsole} />
            <Stack.Screen name="AdminQueue" component={AdminQueue} />
            <Stack.Screen name="AdminMessages" component={AdminMessages} />
            <Stack.Screen name="IncidentDetail" component={IncidentDetail} />
            <Stack.Screen name="AdminMapScreen" component={AdminMapScreen} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
          </>
        ) : (
          // Citizen Stack (Default)
          <>
            <Stack.Screen name="CitizenHome" component={CitizenDashboard} />
            <Stack.Screen name="CitizenReports" component={CitizenReports} />
            <Stack.Screen name="ChatMessages" component={ChatMessages} />
            <Stack.Screen name="ReportWizard" component={ReportWizard} />
            <Stack.Screen name="ReportSuccess" component={ReportSuccess} />
            <Stack.Screen name="StatusTracker" component={StatusTracker} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
});
