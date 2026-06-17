import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert, Linking } from 'react-native';

export const requestCameraPermission = async () => {
  try {
    const { status: currentStatus, canAskAgain } = await ImagePicker.getCameraPermissionsAsync();
    
    if (currentStatus === 'granted') {
      return true;
    }
    
    if (currentStatus === 'denied' && !canAskAgain) {
      Alert.alert(
        'Camera Access Required',
        'Camera permission was permanently denied. Please enable Camera access in your device settings to capture and attach real-time photo evidence.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Camera Access Required',
        'BrgyAlert needs access to your camera to:\n\n• Let you snap real-time photos of incident scenes\n• Attach immediate visual evidence to your reports\n\nThis helps responders identify the threat or issue and bring the appropriate tools.',
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
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                resolve(status === 'granted');
              } catch (err) {
                console.log('Inner error requesting camera permission:', err);
                resolve(false);
              }
            }
          }
        ],
        { cancelable: false }
      );
    });
  } catch (error) {
    console.log('Error requesting camera permission:', error);
    return false;
  }
};

export const requestLibraryPermission = async () => {
  try {
    const { status: currentStatus, canAskAgain } = await ImagePicker.getMediaLibraryPermissionsAsync();
    
    if (currentStatus === 'granted') {
      return true;
    }
    
    if (currentStatus === 'denied' && !canAskAgain) {
      Alert.alert(
        'Gallery Access Required',
        'Gallery permission was permanently denied. Please enable Photos/Gallery access in your device settings to select and attach existing photo evidence.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }

    return new Promise((resolve) => {
      Alert.alert(
        'Gallery Access Required',
        'BrgyAlert needs access to your photo library to:\n\n• Let you select and upload saved images of incidents\n• Attach existing files as evidence to your reports\n\nThis lets you share pre-captured evidence of damages or issues. We only access images you select.',
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
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                resolve(status === 'granted');
              } catch (err) {
                console.log('Inner error requesting library permission:', err);
                resolve(false);
              }
            }
          }
        ],
        { cancelable: false }
      );
    });
  } catch (error) {
    console.log('Error requesting library permission:', error);
    return false;
  }
};

// Compress image to save bandwidth (converts to ~200KB)
export const compressImage = async (uri) => {
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }], // Resizes width to 1024px preserving aspect ratio
      { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG } // 65% quality compression
    );
    return manipResult.uri;
  } catch (error) {
    console.log('Image compression failed, using original uri:', error);
    return uri;
  }
};

export const selectImageFromLibrary = async () => {
  try {
    const hasPermission = await requestLibraryPermission();
    if (!hasPermission) {
      throw new Error('Gallery permission not granted');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1, // Start with high quality before manual compression
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('Image size exceeds the 5MB limit.');
      }
      const originalUri = asset.uri;
      const compressedUri = await compressImage(originalUri);
      return compressedUri;
    }
    return null;
  } catch (error) {
    console.log('Error picking image from library:', error);
    throw error;
  }
};

export const captureImageWithCamera = async () => {
  try {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      throw new Error('Camera permission not granted');
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('Image size exceeds the 5MB limit.');
      }
      const originalUri = asset.uri;
      const compressedUri = await compressImage(originalUri);
      return compressedUri;
    }
    return null;
  } catch (error) {
    console.log('Error capturing image with camera:', error);
    throw error;
  }
};
