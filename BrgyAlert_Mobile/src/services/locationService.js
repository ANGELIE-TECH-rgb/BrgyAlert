import * as Location from 'expo-location';

export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting location permission:', error);
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
    console.error('Error getting current location:', error);
    // Return standard fallback default coordinates (e.g., center of Barangay Lepa / Manila area)
    return {
      latitude: 14.599512, 
      longitude: 120.984222,
      addressText: 'brgy barangay purok 1', // standard mockup placeholder
    };
  }
};
