import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, updateDoc, doc, serverTimestamp, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let soundObject = null;
let activeChatAlertId = null;

/**
 * Global tracker for current active chat screen thread.
 * Used to suppress local banners for messages received in the active thread.
 */
export function setActiveChat(alertId) {
  activeChatAlertId = alertId;
}

export function getActiveChat() {
  return activeChatAlertId;
}

const SOUND_ASSETS = {
  emergency: require('../../assets/sounds/emergency.wav'),
  message: require('../../assets/sounds/message.wav'),
  report: require('../../assets/sounds/report.wav'),
  incident: require('../../assets/sounds/report.wav'),
  status: require('../../assets/sounds/report.wav'),
};

/**
 * Pre-load and play the custom WAV notification chime based on notification type
 */
export async function playNotificationSound(type = 'report') {
  try {
    const soundPref = await AsyncStorage.getItem('soundEnabled');
    if (soundPref === 'false') {
      return; // Audio chime disabled by user preference
    }
    if (soundObject) {
      try {
        await soundObject.unloadAsync();
      } catch (e) {
        // Ignore unloading errors
      }
    }
    
    // Set Audio mode to ensure sound plays even when device is on silent/vibrate mode
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });

    const soundAsset = SOUND_ASSETS[type] || SOUND_ASSETS.report;
    
    // Load and play the sound, with automatic cleanup once done playing
    const { sound } = await Audio.Sound.createAsync(
      soundAsset,
      { shouldPlay: true },
      (status) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      }
    );
    soundObject = sound;
  } catch (error) {
    console.log(`Error playing notification sound of type "${type}":`, error);
  }
}

/**
 * Request OS system level permissions for notifications and setup Android channel
 */
export async function registerForNotificationsAsync() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted.');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0F2C59',
      });
    }
    return true;
  } catch (error) {
    console.log('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * Schedules a local system notification banner and triggers foreground sound
 */
export async function triggerLocalNotification(title, body, type = 'report') {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default', // standard background sound
        badge: 1,
      },
      trigger: null, // trigger immediately
    });
    
    // Also play the custom audio sound chime matching the notification type
    await playNotificationSound(type);
  } catch (error) {
    console.log('Error triggering local notification:', error);
  }
}

/**
 * Saves notification to Firestore under /users/{userId}/notifications
 * and optionally schedules a local system notification banner + custom sound chime.
 *
 * @param {string} userId - The Firestore uid of the notification recipient
 * @param {object} payload - title, body, type, relatedId
 * @param {boolean} skipLocalNotification - Set true when saving for a DIFFERENT user (e.g. admin writing to citizen's subcollection)
 */
export async function sendAndSaveNotification(userId, { title, body, type, relatedId }, skipLocalNotification = false) {
  try {
    if (!userId) {
      console.log('Warning: sendAndSaveNotification called without userId');
      return;
    }
    // 1. Save to Firestore
    await addDoc(collection(db, 'users', userId, 'notifications'), {
      title,
      body,
      type: type || 'general',
      relatedId: relatedId || null,
      read: false,
      createdAt: serverTimestamp(),
    });

    // 2. Trigger local system notification and play chime ONLY for the current device's user
    if (!skipLocalNotification) {
      await triggerLocalNotification(title, body, type);
    }
  } catch (error) {
    console.log('Error sending and saving notification:', error);
  }
}

/**
 * Mark a single notification as read
 */
export async function markAsRead(userId, notificationId) {
  try {
    if (!userId || !notificationId) return;
    const notifRef = doc(db, 'users', userId, 'notifications', notificationId);
    await updateDoc(notifRef, { read: true });
  } catch (error) {
    console.log('Error marking notification as read:', error);
  }
}

/**
 * Mark all unread notifications as read for a user
 */
export async function markAllAsRead(userId) {
  try {
    if (!userId) return;
    const q = query(
      collection(db, 'users', userId, 'notifications'),
      where('read', '==', false)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.forEach((d) => {
      const notifRef = doc(db, 'users', userId, 'notifications', d.id);
      batch.update(notifRef, { read: true });
    });
    await batch.commit();
  } catch (error) {
    console.log('Error marking all notifications as read:', error);
  }
}
