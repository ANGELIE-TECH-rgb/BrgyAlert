import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
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

/**
 * Pre-load and play the premium custom WAV notification chime
 */
export async function playNotificationSound() {
  try {
    if (soundObject) {
      try {
        await soundObject.unloadAsync();
      } catch (e) {
        // Ignore unloading errors
      }
    }
    soundObject = new Audio.Sound();
    await soundObject.loadAsync(require('../../assets/sounds/notification.wav'));
    await soundObject.playAsync();
  } catch (error) {
    console.log('Error playing notification sound:', error);
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
export async function triggerLocalNotification(title, body) {
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
    
    // Also play the custom audio sound chime
    await playNotificationSound();
  } catch (error) {
    console.log('Error triggering local notification:', error);
  }
}

/**
 * Saves notification to Firestore under /users/{userId}/notifications
 * and schedules a local system notification banner + custom sound chime
 */
export async function sendAndSaveNotification(userId, { title, body, type, relatedId }) {
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

    // 2. Trigger local system notification and play chime
    await triggerLocalNotification(title, body);
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
