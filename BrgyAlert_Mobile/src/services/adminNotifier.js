/**
 * BrgyAlert — Admin Notification Dispatcher
 *
 * Fetches all admin/responder users from Firestore and dispatches Firestore
 * notifications directly to each of them.
 *
 * This approach is more reliable than relying on the admin's onSnapshot
 * listener (which only works if the admin's app is open and online).
 */

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { sendAndSaveNotification } from './notificationService';

/**
 * Notifies all admin and responder users with a Firestore notification entry.
 * Skips the current user (to avoid self-notifications).
 *
 * @param {string} senderUid - The uid of the user triggering the event (to skip self-notify)
 * @param {object} payload - { title, body, type, relatedId }
 */
export async function notifyAllAdmins(senderUid, { title, body, type, relatedId }) {
  try {
    // Fetch all users with role 'admin' or 'responder'
    const adminQuery = query(
      collection(db, 'users'),
      where('role', 'in', ['admin', 'responder'])
    );
    const snap = await getDocs(adminQuery);

    if (snap.empty) {
      console.log('[notifyAllAdmins] No admins or responders found.');
      return;
    }

    // Write a notification entry for each admin/responder
    const promises = [];
    snap.forEach((userDoc) => {
      const adminUid = userDoc.id;
      if (adminUid === senderUid) return; // don't notify the sender

      promises.push(
        sendAndSaveNotification(
          adminUid,
          { title, body, type, relatedId },
          true // skipLocalNotification — each admin's device will play its own sound via onSnapshot
        ).catch((e) => {
          console.log(`[notifyAllAdmins] Failed to notify admin ${adminUid}:`, e.message);
        })
      );
    });

    await Promise.all(promises);
    console.log(`[notifyAllAdmins] Dispatched notifications to ${promises.length} admin(s).`);
  } catch (err) {
    console.log('[notifyAllAdmins] Error dispatching admin notifications:', err.message);
  }
}
