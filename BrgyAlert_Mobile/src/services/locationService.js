import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';

export const requestLocationPermission = async () => {
  try {
    // Check if location services (GPS) are enabled globally on the device first
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      Alert.alert(
        'Location Services Disabled',
        "Your device's location services (GPS) are turned off. Please turn them on in your device settings to use automatic mapping features.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }

    // Check current permission status
    const { status: currentStatus, canAskAgain } = await Location.getForegroundPermissionsAsync();
    
    if (currentStatus === 'granted') {
      return true;
    }
    
    if (currentStatus === 'denied' && !canAskAgain) {
      Alert.alert(
        'Location Access Required',
        'Location permission was permanently denied. Please enable Location access in your device settings to use automatic incident mapping and emergency responder dispatch.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }

    // Show custom explanation before triggering OS prompt
    return new Promise((resolve) => {
      Alert.alert(
        'Location Access Required',
        'BrgyAlert needs access to your location to:\n\n• Tag incident reports to your correct Purok / Barangay automatically\n• Route emergency responders directly to your location during panic triggers\n\nYour location data is only accessed while the app is active.',
        [
          {
            text: 'Not Now',
            onPress: () => resolve(false),
            style: 'cancel'
          },
          {
            text: 'Continue',
            onPress: async () => {
              try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                resolve(status === 'granted');
              } catch (err) {
                console.log('Inner error requesting location permission:', err);
                resolve(false);
              }
            }
          }
        ],
        { cancelable: false }
      );
    });
  } catch (error) {
    console.log('Error requesting location permission:', error);
    return false;
  }
};

export const getCurrentLocation = async () => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = location.coords;
    
    // Reverse geocode to get structural address details (Purok / Barangay)
    let addressText = 'brgy barangay purok 1'; // default fallback text matching wireframe
    try {
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        const street = place.street || '';
        const district = place.district || place.subregion || '';
        const name = place.name || '';
        
        // Formulate a clean, localized address format
        addressText = [name, street, district].filter(Boolean).join(', ') || 'brgy barangay purok 1';
      }
    } catch (geoError) {
      console.warn('Geocoding failed, using coordinates as text:', geoError);
      addressText = `Lat: ${latitude.toFixed(4)}, Long: ${longitude.toFixed(4)}`;
    }

    return {
      latitude,
      longitude,
      addressText,
    };
  } catch (error) {
    console.log('Error getting current location:', error);
    
    // Alert the user specifically if device location settings are unsatisfied (GPS toggled off)
    if (error.message && error.message.includes('unsatisfied device settings')) {
      Alert.alert(
        'Location Services Disabled',
        "Your device's location services (GPS) are turned off. Please enable GPS/Location in your settings to pinpoint your coordinates.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
    }
    
    // Return standard fallback default coordinates (e.g., center of Barangay Lepa / Manila area)
    return {
      latitude: 14.599512, 
      longitude: 120.984222,
      addressText: 'brgy barangay purok 1', // standard mockup placeholder
    };
  }
};
