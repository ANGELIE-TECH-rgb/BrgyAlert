import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export const requestCameraPermission = async () => {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return false;
  }
};

export const requestLibraryPermission = async () => {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting library permission:', error);
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
    console.error('Image compression failed, using original uri:', error);
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
    console.error('Error picking image from library:', error);
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
    console.error('Error capturing image with camera:', error);
    throw error;
  }
};
